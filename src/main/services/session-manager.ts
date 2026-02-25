import { BrowserWindow } from 'electron'
import { AgentConfig, ChatMessage, AgentProcessInfo } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as store from './store'
import {
  buildCleanEnv,
  validateWorkingDirectory
} from './cli-builder'
import { buildMcpConfigFile } from './mcp-manager'
import { logActivity } from './activity-logger'
import { hasDelegation, executeDelegation, setSendMessageAndCapture, executeRemoveBlocks } from './delegation-manager'
import { handleAgentError, setSessionCallbacks, setFindBackupDirector } from './error-recovery'
import * as watchdog from './process-watchdog'
import { v4 as uuid } from 'uuid'
import { ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getAdapter, resolveProvider } from './cli-adapters'
import { StreamParser, formatToolInput } from './stream-parser'

interface ActiveSession {
  agentId: string
  process: ChildProcess | null
  abortController: AbortController
  messages: ChatMessage[]
  configDir: string
  hasConversation: boolean
  cliSessionId: string | null
}

const activeSessions = new Map<string, ActiveSession>()
// 위임 재귀 방지 — 현재 위임 종합 중인 에이전트 ID (director/leader)
const delegatingAgents = new Set<string>()
// 위임 시작 시간 추적 — 타임아웃 감지용
const delegatingStartTimes = new Map<string, number>()
// 메시지 큐 — 에이전트가 바쁠 때 대기
const messageQueues = new Map<string, string[]>()
// 상향 보고 메시지 ID 추적 — 보고에 대한 재보고 방지
const reportMessageIds = new Set<string>()

// 위임 교착 상태 감시 — 10분 이상 위임 중이면 강제 해제
const DELEGATION_TIMEOUT_MS = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const agentId of delegatingAgents) {
    const started = delegatingStartTimes.get(agentId) ?? 0
    if (now - started > DELEGATION_TIMEOUT_MS) {
      console.warn(`[delegation-watchdog] ${agentId} 위임 타임아웃 (${Math.round((now - started) / 60000)}분) — 강제 해제`)
      delegatingAgents.delete(agentId)
      delegatingStartTimes.delete(agentId)
      agentManager.setAgentStatus(agentId, 'idle')
      agentManager.setCurrentTask(agentId, undefined)
      broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
      processNextInQueue(agentId)
    }
  }
}, 30_000) // 30초마다 체크

// ── 순환 의존 방지: 하위 모듈에 콜백 주입 ──
// 모듈 로드 시점에는 함수가 아직 정의되지 않았으므로, 래퍼를 통해 지연 바인딩
setSendMessageAndCapture((agentId: string, message: string) =>
  sendMessageAndCapture(agentId, message)
)
setSessionCallbacks({
  getErrorLog: (agentId: string) => getErrorLog(agentId),
  sendMessage: (agentId: string, message: string) => sendMessage(agentId, message),
  abortSession: (agentId: string) => abortSession(agentId)
})
setFindBackupDirector(watchdog.findBackupDirector)
watchdog.setSendMessage((agentId: string, message: string) => sendMessage(agentId, message))

function getConfigDir(agentId: string): string {
  // 프로젝트별 세션 디렉토리 사용
  const dir = path.join(store.getProjectStoreDir(), 'sessions', agentId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getSession(agentId: string): ActiveSession {
  if (!activeSessions.has(agentId)) {
    const messages = store.getSessionHistory(agentId)
    // 영속 저장소에서 CLI 세션 ID 복원 — 앱 재시작 후에도 --resume 유지
    const sessionInfo = store.getSessionInfo(agentId)
    const restoredCliSessionId = sessionInfo?.sessionId ?? null
    const hasExistingMessages = messages.length > 0
    activeSessions.set(agentId, {
      agentId,
      process: null,
      abortController: new AbortController(),
      messages,
      configDir: getConfigDir(agentId),
      hasConversation: hasExistingMessages,
      cliSessionId: restoredCliSessionId
    })
  }
  return activeSessions.get(agentId)!
}

function broadcastToChat(agentId: string, channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, agentId, data)
  })
}

// 프로세스 상태 브로드캐스트
function broadcastProcessInfo(agentId: string, info: Partial<AgentProcessInfo>): void {
  const current = agentManager.getProcessInfo(agentId)
  const updated: AgentProcessInfo = {
    processStatus: 'stopped',
    modelInUse: '',
    ...current,
    ...info
  }
  agentManager.setProcessInfo(agentId, updated)
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('agent:process-info-changed', agentId, updated)
  })
}

// 에이전트가 바쁜지 확인 (프로세스 실행 중 or 위임 진행 중)
function isAgentBusy(agentId: string): boolean {
  const session = activeSessions.get(agentId)
  return !!session?.process || delegatingAgents.has(agentId)
}

// 큐에서 다음 메시지 처리
function processNextInQueue(agentId: string): void {
  const queue = messageQueues.get(agentId)
  if (!queue || queue.length === 0) return
  const nextMessage = queue.shift()!
  if (queue.length === 0) messageQueues.delete(agentId)

  console.log(`[message-queue] ${agentId} 대기 메시지 처리: "${nextMessage.slice(0, 50)}"`)
  sendMessage(agentId, nextMessage).catch((err) => {
    console.error(`[message-queue] ${agentId} 큐 메시지 처리 실패:`, err)
  })
}

// ── 상향 보고 ── 상위자에게 보고하고 CLI를 호출하여 판단 + 재위임 가능
function sendUpwardReport(agentId: string, userMessage: string, assistantResponse: string): void {
  const config = store.getAgent(agentId)
  if (!config) return

  // director는 보고 대상 없음 (체인 종료)
  if (config.hierarchy?.role === 'director') return

  const superior = agentManager.findSuperiorForAgent(agentId)
  if (!superior) return

  // 보고 내용 구성: 사용자 지시 요약 + 에이전트 응답 요약
  const userSummary = userMessage.length > 300 ? userMessage.slice(0, 300) + '...' : userMessage
  const responseSummary =
    assistantResponse.length > 500 ? assistantResponse.slice(0, 500) + '...' : assistantResponse

  const reportContent =
    `[📋 자동 보고] 사용자가 ${config.name}(${config.role})에게 직접 지시했습니다.\n` +
    `▸ 사용자 지시: ${userSummary}\n` +
    `▸ ${config.name}의 응답: ${responseSummary}\n\n` +
    `이 보고를 검토하고, 필요하다면 추가 조치를 취하거나 작업을 재배분해주세요. ` +
    `문제가 있다면 관련 팀원에게 수정을 위임할 수 있습니다.`

  // 상위자에게 실제 CLI 호출로 보고 (판단 + 위임 가능)
  // 비동기로 실행 — 현재 흐름을 블록하지 않음
  const reportId = `report-${uuid()}`
  reportMessageIds.add(reportId)

  logActivity('upward-report', agentId, config.name, `${config.name} → ${superior.name} 상향 보고`)
  console.log(`[upward-report] ${config.name} → ${superior.name} 보고 전송 (CLI 호출)`)

  // sendMessage로 실제 CLI 호출 — 상위자가 판단하고 위임할 수 있음
  sendMessage(superior.id, reportContent).catch((err) => {
    console.error(`[upward-report] ${config.name} → ${superior.name} 보고 처리 실패:`, err)
  })
}

// ── 체인 보고 ── 리더가 멤버 보고를 검토한 뒤 총괄에게 판단 결과 전달
function sendChainReport(agentId: string, _originalReport: string, leaderJudgment: string): void {
  const config = store.getAgent(agentId)
  if (!config) return

  // 리더만 체인 보고 가능
  if (config.hierarchy?.role !== 'leader') return

  // 총괄(Director)를 찾음
  const director = agentManager.findSuperiorForAgent(agentId)
  if (!director || director.hierarchy?.role !== 'director') return

  const judgmentSummary =
    leaderJudgment.length > 500 ? leaderJudgment.slice(0, 500) + '...' : leaderJudgment

  const chainContent =
    `[📋 체인 보고] ${config.name}(${config.role})이 팀원 보고를 검토한 결과입니다:\n` +
    `▸ ${config.name}의 판단: ${judgmentSummary}\n\n` +
    `추가 조치가 필요하면 관련 팀에 작업을 재배분해주세요.`

  const reportId = `chain-report-${uuid()}`
  reportMessageIds.add(reportId)

  logActivity('chain-report', agentId, config.name, `${config.name} → ${director.name} 체인 보고`)
  console.log(`[chain-report] ${config.name} → ${director.name} 판단 결과 전달 (CLI 호출)`)

  // 총괄에게 CLI 호출 — 총괄이 판단하고 재위임할 수 있음
  sendMessage(director.id, chainContent).catch((err) => {
    console.error(`[chain-report] ${config.name} → ${director.name} 보고 처리 실패:`, err)
  })
}

export async function sendMessage(agentId: string, userMessage: string): Promise<void> {
  const config = store.getAgent(agentId)
  if (!config) throw new Error(`Agent ${agentId} not found`)

  const session = getSession(agentId)

  // 에이전트가 바쁘면 메시지를 큐에 추가
  if (isAgentBusy(agentId)) {
    if (!messageQueues.has(agentId)) messageQueues.set(agentId, [])
    messageQueues.get(agentId)!.push(userMessage)

    const queueCount = messageQueues.get(agentId)!.length
    const queueMsg: ChatMessage = {
      id: uuid(),
      agentId,
      role: 'system',
      content: `메시지가 대기열에 추가되었습니다 (${queueCount}건 대기 중). 현재 작업 완료 후 처리됩니다.`,
      timestamp: Date.now()
    }
    session.messages.push(queueMsg)
    broadcastToChat(agentId, 'session:message', queueMsg)
    store.saveSessionHistory(agentId, session.messages)
    return
  }

  session.abortController = new AbortController()

  // Add user message
  const userMsg: ChatMessage = {
    id: uuid(),
    agentId,
    role: 'user',
    content: userMessage,
    timestamp: Date.now()
  }
  session.messages.push(userMsg)
  broadcastToChat(agentId, 'session:message', userMsg)

  // CLI 설치 여부 사전 확인 (프로바이더별)
  const provider = resolveProvider(config)
  const adapter = getAdapter(provider)
  const cliCheck = adapter.checkInstalled()
  if (!cliCheck.installed) {
    const displayName = adapter.getDisplayName()
    const installCmd = adapter.getInstallCommand()
    const errorMsg: ChatMessage = {
      id: uuid(),
      agentId,
      role: 'system',
      content: `⚠️ ${displayName}가 설치되지 않았습니다.\n\n에이전트와 대화하려면 ${displayName}가 필요합니다.\n\n**설치 방법:**\n\`\`\`\n${installCmd}\n\`\`\`\n\n설치 후 다시 시도해주세요.`,
      timestamp: Date.now()
    }
    session.messages.push(errorMsg)
    broadcastToChat(agentId, 'session:message', errorMsg)
    store.saveSessionHistory(agentId, session.messages)
    return
  }

  // Set agent status to working
  agentManager.setAgentStatus(agentId, 'working')
  broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'working' })

  try {
    const response = await runClaudeSession(config, session, userMessage)

    // ── 상향 보고 체인: member → leader → director
    // 1) 일반 사용자 메시지 → 상위자에게 보고 (member/leader 모두)
    // 2) 자동 보고 메시지 수신 시 (leader가 member 보고를 받은 경우) → director에게 체인 보고
    const isMemberReport = userMessage.includes('[📋 자동 보고]')
    const isDirectReport = reportMessageIds.has(userMsg.id)

    if (config.hierarchy?.role !== 'director' && response) {
      if (!isDirectReport && !isMemberReport) {
        // 일반 사용자 지시 → 상위자에게 보고
        try {
          sendUpwardReport(agentId, userMessage, response)
        } catch (reportErr) {
          console.error('[upward-report] 보고 실패:', reportErr)
        }
      } else if (isMemberReport && config.hierarchy?.role === 'leader') {
        // 리더가 멤버 보고를 처리한 후 → 총괄에게 판단 결과 체인 보고
        try {
          sendChainReport(agentId, userMessage, response)
        } catch (reportErr) {
          console.error('[chain-report] 체인 보고 실패:', reportErr)
        }
      }
    }

    // [REMOVE:Name] 블록 처리 — 리더/디렉터가 팀원 삭제 요청
    const canManageTeam = config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    if (canManageTeam && response) {
      try {
        executeRemoveBlocks(agentId, response)
      } catch (removeErr) {
        console.error('[remove-blocks] 팀원 삭제 실패:', removeErr)
      }
    }

    // director/leader 에이전트이고 위임 블록이 있으면 위임 실행 (재귀 방지)
    const canDelegate = config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    console.log(
      `[delegation-check] role=${config.hierarchy?.role}, canDelegate=${canDelegate}, hasDelegation=${response ? hasDelegation(response) : false}, isDelegating=${delegatingAgents.has(agentId)}, responseLen=${response?.length ?? 0}`
    )
    if (canDelegate && response && hasDelegation(response) && !delegatingAgents.has(agentId)) {
      // 위임자를 working 상태로 유지 (finishSession에서 idle로 바꿨으므로 다시 설정)
      agentManager.setAgentStatus(agentId, 'working')
      agentManager.setCurrentTask(agentId, '팀원 작업 대기 중...')
      broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'working' })

      delegatingAgents.add(agentId)
      delegatingStartTimes.set(agentId, Date.now())
      executeDelegation(agentId, response, userMessage)
        .catch((err) => {
          console.error('[delegation] 위임 실행 실패:', err)
        })
        .finally(() => {
          delegatingAgents.delete(agentId)
          delegatingStartTimes.delete(agentId)
          agentManager.setAgentStatus(agentId, 'idle')
          agentManager.setCurrentTask(agentId, undefined)
          broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
          // 위임 완료 후 대기 메시지 처리
          processNextInQueue(agentId)
        })
    } else {
      // 위임 없으면 바로 대기 메시지 처리
      processNextInQueue(agentId)
    }
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return

    const errMessage = (err as Error).message || String(err)
    const providerForError = resolveProvider(config)
    const adapterForError = getAdapter(providerForError)
    // ENOENT = CLI 실행 파일을 찾을 수 없음
    const isCliMissing =
      errMessage.includes('ENOENT') ||
      errMessage.includes('not found') ||
      errMessage.includes('not recognized')
    const displayMessage = isCliMissing
      ? `⚠️ ${adapterForError.getDisplayName()}를 실행할 수 없습니다.\n\n**설치 방법:**\n\`\`\`\n${adapterForError.getInstallCommand()}\n\`\`\`\n\n설치 후 다시 시도하세요.`
      : `Error: ${errMessage}`

    const errorMsg: ChatMessage = {
      id: uuid(),
      agentId,
      role: 'system',
      content: displayMessage,
      timestamp: Date.now()
    }
    session.messages.push(errorMsg)
    broadcastToChat(agentId, 'session:message', errorMsg)
    agentManager.setAgentStatus(agentId, 'error')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'error' })
    broadcastProcessInfo(agentId, { processStatus: 'crashed', lastError: errMessage })
    logActivity('error', agentId, config.name, `오류: ${errMessage}`)

    // 자동 에러 복구 — 모든 역할 허용 (director는 backup director로 에스컬레이션)
    handleAgentError(agentId, errMessage).catch((recoverErr) => {
      console.error('[error-recovery] 자동 복구 시도 실패:', recoverErr)
    })

    // 에러 후에도 대기 메시지 처리
    processNextInQueue(agentId)
  } finally {
    store.saveSessionHistory(agentId, session.messages)
  }
}

async function runCliSession(
  config: AgentConfig,
  session: ActiveSession,
  userMessage: string,
  _retryWithoutResume = false
): Promise<string> {
  const agentId = config.id
  const provider = resolveProvider(config)
  const adapter = getAdapter(provider)

  // MCP config 파일 빌드 (MCP 지원 프로바이더만)
  if (adapter.supportsMcp()) {
    buildMcpConfigFile(agentId)
  }

  // 전사 규칙 + 에이전트 응답 언어 설정 로드
  const globalSettings = store.getSettings()

  // resume 재시도 시에는 세션 ID 무시
  const useResumeId = _retryWithoutResume ? null : (adapter.supportsResume() ? session.cliSessionId : null)

  // 어댑터로 인수 빌드
  const args = adapter.buildArgs(config, {
    resumeSessionId: useResumeId,
    hasConversation: _retryWithoutResume ? false : session.hasConversation,
    userMessage,
    companyRules: globalSettings.companyRules,
    agentLanguage: globalSettings.agentLanguage
  })

  return new Promise<string>((resolve, reject) => {
    let cwd: string
    try {
      cwd = validateWorkingDirectory(config.workingDirectory)
    } catch (err) {
      reject(err)
      return
    }

    const cleanEnv = buildCleanEnv()

    // 프로세스 시작 상태
    broadcastProcessInfo(agentId, {
      processStatus: 'starting',
      modelInUse: config.model
    })

    let proc: ChildProcess
    try {
      const spawnResult = adapter.spawnProcess(config, args, {
        cwd,
        env: cleanEnv,
        signal: session.abortController.signal
      })
      proc = spawnResult.process

      // stdin 전달 여부에 따라 분기
      if (spawnResult.writeStdin) {
        proc.stdin?.write(userMessage)
        proc.stdin?.end()
      }
    } catch (err) {
      broadcastProcessInfo(agentId, { processStatus: 'crashed', lastError: String(err) })
      reject(err)
      return
    }

    session.process = proc

    // 워치독에 프로세스 등록
    watchdog.registerProcess(agentId, proc)

    // 프로세스 실행 중 상태
    broadcastProcessInfo(agentId, {
      processStatus: 'running',
      pid: proc.pid,
      startedAt: Date.now()
    })

    let fullResponse = ''
    let resultText = ''
    const streamingMsgId = uuid()
    let costTotal = 0
    let finished = false

    // StreamParser로 통합 파싱
    const parser = new StreamParser(adapter)

    const finishSession = (): void => {
      if (finished) return
      finished = true
      session.process = null
      watchdog.unregisterProcess(agentId)

      if (session.abortController.signal.aborted) {
        broadcastProcessInfo(agentId, { processStatus: 'stopped' })
        resolve('')
        return
      }

      const finalContent = fullResponse.trim() || resultText.trim()
      const assistantMsg: ChatMessage = {
        id: streamingMsgId,
        agentId,
        role: 'assistant',
        content: finalContent,
        timestamp: Date.now(),
        costDelta: costTotal
      }
      session.messages.push(assistantMsg)
      session.hasConversation = true

      broadcastToChat(agentId, 'session:stream-end', assistantMsg)
      agentManager.setAgentStatus(agentId, 'idle')
      agentManager.setLastMessage(agentId, finalContent.slice(0, 100))
      agentManager.addAgentCost(agentId, costTotal)
      broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
      broadcastProcessInfo(agentId, { processStatus: 'stopped' })

      if (proc && !proc.killed) {
        try {
          proc.kill()
        } catch {
          /* already dead */
        }
      }

      resolve(finalContent)
    }

    // stream-start 이벤트
    const streamStart: ChatMessage = {
      id: streamingMsgId,
      agentId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    }
    broadcastToChat(agentId, 'session:stream-start', streamStart)

    const parserCallbacks = {
      onInit: (sessionId: string) => {
        session.cliSessionId = sessionId
        // 영속 저장소에도 CLI 세션 ID 저장 — 앱 재시작 후 --resume 유지
        store.updateSessionId(agentId, sessionId)
      },
      onText: (text: string) => {
        fullResponse += text
        broadcastToChat(agentId, 'session:stream-delta', {
          id: streamingMsgId,
          agentId,
          delta: text
        })
      },
      onToolUse: (toolName: string, toolInput: Record<string, unknown>) => {
        const toolText = `\n\n**${toolName}** \`${formatToolInput(toolName, toolInput)}\`\n`
        fullResponse += toolText
        broadcastToChat(agentId, 'session:stream-delta', {
          id: streamingMsgId,
          agentId,
          delta: toolText
        })
        const agentConfig = store.getAgent(agentId)
        if (agentConfig) {
          logActivity('tool-use', agentId, agentConfig.name, `${toolName} 사용`, { toolName })
        }
      },
      onToolResult: (output: string) => {
        const preview = output.length > 300 ? output.slice(0, 300) + '...' : output
        const rt = `\n\`\`\`\n${preview}\n\`\`\`\n`
        fullResponse += rt
        broadcastToChat(agentId, 'session:stream-delta', {
          id: streamingMsgId,
          agentId,
          delta: rt
        })
      },
      onCost: (cost: number) => {
        costTotal = cost
      },
      onResult: (text: string) => {
        resultText = text
        broadcastToChat(agentId, 'session:result-text', {
          id: streamingMsgId,
          agentId,
          text
        })
        finishSession()
      },
      onError: (message: string) => {
        console.error(`[${config.name}] stream error:`, message)
      }
    }

    proc.stdout?.on('data', (data: Buffer) => {
      watchdog.updateHeartbeat(agentId)
      parser.processChunk(data.toString(), parserCallbacks)
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.error(`[${config.name}] stderr:`, text)
      appendErrorLog(agentId, text)
    })

    proc.on('close', (code) => {
      parser.flush(parserCallbacks)

      if (finished) return

      if (code !== 0 && !fullResponse.trim() && !resultText.trim()) {
        session.process = null
        watchdog.unregisterProcess(agentId)

        // --resume 실패 시 세션 ID를 지우고 재시도 (1회만)
        if (!_retryWithoutResume && useResumeId) {
          console.warn(`[${config.name}] --resume 실패 (code ${code}), 새 세션으로 재시도`)
          session.cliSessionId = null
          session.hasConversation = false
          store.updateSessionId(agentId, '')
          broadcastProcessInfo(agentId, { processStatus: 'starting', modelInUse: config.model })
          runCliSession(config, session, userMessage, true).then(resolve, reject)
          return
        }

        broadcastProcessInfo(agentId, { processStatus: 'crashed', lastError: `Exit code ${code}` })
        const displayName = adapter.getDisplayName()
        reject(new Error(`${displayName} process exited with code ${code}`))
      } else {
        finishSession()
      }
    })

    proc.on('error', (err) => {
      session.process = null
      watchdog.unregisterProcess(agentId)
      broadcastProcessInfo(agentId, { processStatus: 'crashed', lastError: err.message })
      reject(err)
    })
  })
}

// 하위호환 래퍼
async function runClaudeSession(
  config: AgentConfig,
  session: ActiveSession,
  userMessage: string
): Promise<string> {
  return runCliSession(config, session, userMessage)
}

// 메시지 전송 + 응답 텍스트 캡처하여 반환 (위임 시스템용)
export async function sendMessageAndCapture(agentId: string, userMessage: string): Promise<string> {
  const config = store.getAgent(agentId)
  if (!config) throw new Error(`Agent ${agentId} not found`)

  const session = getSession(agentId)

  // 이미 실행 중인 프로세스가 있으면 abort
  if (session.process) {
    const oldProc = session.process
    session.process = null
    session.abortController.abort()
    try {
      oldProc.kill()
    } catch {
      /* already dead */
    }
  }

  session.abortController = new AbortController()

  // 사용자 메시지 추가 (위임 컨텍스트)
  const userMsg: ChatMessage = {
    id: uuid(),
    agentId,
    role: 'user',
    content: userMessage,
    timestamp: Date.now()
  }
  session.messages.push(userMsg)
  broadcastToChat(agentId, 'session:message', userMsg)

  agentManager.setAgentStatus(agentId, 'working')
  broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'working' })

  try {
    const response = await runClaudeSession(config, session, userMessage)

    // 중첩 위임: 이 에이전트가 leader이고 위임 블록이 있으면 실행
    const canDelegateNested =
      config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    if (
      canDelegateNested &&
      response &&
      hasDelegation(response) &&
      !delegatingAgents.has(agentId)
    ) {
      delegatingAgents.add(agentId)
      try {
        await executeDelegation(agentId, response, userMessage)
        // 위임 종합 후 마지막 assistant 메시지 반환
        const lastAssistant = session.messages.filter((m) => m.role === 'assistant').pop()
        return lastAssistant?.content ?? response
      } finally {
        delegatingAgents.delete(agentId)
      }
    }

    return response
  } finally {
    store.saveSessionHistory(agentId, session.messages)
  }
}

export function abortSession(agentId: string): void {
  const session = activeSessions.get(agentId)
  if (session) {
    const wasRunning = !!session.process
    session.abortController.abort()
    if (session.process) {
      session.process.kill()
      session.process = null
    }
    agentManager.setAgentStatus(agentId, 'idle')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
    broadcastProcessInfo(agentId, { processStatus: 'stopped' })

    // 스트리밍 중이었으면 stream-end 브로드캐스트 → UI의 streaming 상태 리셋
    if (wasRunning) {
      const abortMsg: ChatMessage = {
        id: `abort-${uuid()}`,
        agentId,
        role: 'system',
        content: '⏹ 중지됨',
        timestamp: Date.now()
      }
      session.messages.push(abortMsg)
      store.saveSessionHistory(agentId, session.messages)
      broadcastToChat(agentId, 'session:stream-end', abortMsg)
    }
  }
}

export function clearSession(agentId: string): void {
  const session = activeSessions.get(agentId)
  if (session) {
    abortSession(agentId)
    session.messages = []
    session.hasConversation = false
    session.cliSessionId = null
  }
  store.clearSessionHistory(agentId)
  broadcastToChat(agentId, 'session:cleared', agentId)
}

export function getHistory(agentId: string): ChatMessage[] {
  const session = activeSessions.get(agentId)
  if (session) return session.messages
  return store.getSessionHistory(agentId)
}

// 모든 교착 상태 강제 해제 — UI에서 수동 호출 가능
export function flushStuckDelegations(): number {
  let flushed = 0
  for (const agentId of delegatingAgents) {
    console.warn(`[flush] ${agentId} 위임 상태 강제 해제`)
    delegatingAgents.delete(agentId)
    delegatingStartTimes.delete(agentId)
    agentManager.setAgentStatus(agentId, 'idle')
    agentManager.setCurrentTask(agentId, undefined)
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
    processNextInQueue(agentId)
    flushed++
  }
  // 큐에 남은 메시지도 처리 시도
  for (const [agentId] of messageQueues) {
    if (!isAgentBusy(agentId)) {
      processNextInQueue(agentId)
    }
  }
  return flushed
}

// ── stderr 에러 로그 ──

const errorLogs = new Map<string, string[]>()
const MAX_ERROR_LOG_LINES = 100

export function appendErrorLog(agentId: string, line: string): void {
  if (!errorLogs.has(agentId)) errorLogs.set(agentId, [])
  const log = errorLogs.get(agentId)!
  log.push(line)
  if (log.length > MAX_ERROR_LOG_LINES) log.shift()
}

export function getErrorLog(agentId: string): string[] {
  return errorLogs.get(agentId) ?? []
}

// ── MCP 장애 보고 ── CLI 호출 없이 상위자 채팅에 시스템 메시지 삽입
export function sendMcpFailureReport(agentId: string, serverName: string, error: string): void {
  const config = store.getAgent(agentId)
  if (!config) return

  const superior = agentManager.findSuperiorForAgent(agentId)
  if (!superior) return

  const session = getSession(superior.id)

  const reportContent =
    `[⚠️ MCP 장애] ${config.name}의 MCP 서버 "${serverName}" 연결 실패\n` +
    `▸ 오류: ${error}\n` +
    `▸ 시각: ${new Date().toLocaleTimeString()}`

  const reportMsg: ChatMessage = {
    id: `mcp-report-${uuid()}`,
    agentId: superior.id,
    role: 'system',
    content: reportContent,
    timestamp: Date.now(),
    isAutoReport: true,
    reportOriginAgentId: agentId
  }

  session.messages.push(reportMsg)
  broadcastToChat(superior.id, 'session:message', reportMsg)
  store.saveSessionHistory(superior.id, session.messages)

  logActivity('error', agentId, config.name, `MCP 장애: ${serverName} — ${error}`)
  console.log(`[mcp-failure-report] ${config.name} → ${superior.name}: ${serverName} 장애 보고`)
}

export function cleanup(): void {
  for (const [, session] of activeSessions) {
    if (session.process) {
      session.process.kill()
    }
  }
  activeSessions.clear()
}
