import { BrowserWindow } from 'electron'
import { AgentConfig, ChatMessage, AgentProcessInfo } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as store from './store'
import { buildCliArgs, buildCleanEnv, validateWorkingDirectory, checkClaudeCli } from './cli-builder'
import { buildMcpConfigFile } from './mcp-manager'
import { logActivity } from './activity-logger'
import { hasDelegation, executeDelegation } from './delegation-manager'
import { handleAgentError } from './error-recovery'
import * as watchdog from './process-watchdog'
import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

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
// 메시지 큐 — 에이전트가 바쁠 때 대기
const messageQueues = new Map<string, string[]>()
// 상향 보고 메시지 ID 추적 — 보고에 대한 재보고 방지
const reportMessageIds = new Set<string>()

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
    activeSessions.set(agentId, {
      agentId,
      process: null,
      abortController: new AbortController(),
      messages,
      configDir: getConfigDir(agentId),
      hasConversation: false,
      cliSessionId: null
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
  return !!(session?.process) || delegatingAgents.has(agentId)
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

// ── 상향 보고 ── CLI 호출 없이 상위자 채팅에 시스템 메시지 삽입
function sendUpwardReport(agentId: string, userMessage: string, assistantResponse: string): void {
  const config = store.getAgent(agentId)
  if (!config) return

  // director는 보고 대상 없음 (체인 종료)
  if (config.hierarchy?.role === 'director') return

  const superior = agentManager.findSuperiorForAgent(agentId)
  if (!superior) return

  const session = getSession(superior.id)

  // 보고 내용 구성: 사용자 지시 요약 + 에이전트 응답 요약
  const userSummary = userMessage.length > 200 ? userMessage.slice(0, 200) + '...' : userMessage
  const responseSummary = assistantResponse.length > 300 ? assistantResponse.slice(0, 300) + '...' : assistantResponse

  const reportContent = `[📋 자동 보고] 사용자가 ${config.name}에게 직접 지시:\n` +
    `▸ 지시: ${userSummary}\n` +
    `▸ 응답: ${responseSummary}`

  const reportMsg: ChatMessage = {
    id: `report-${uuid()}`,
    agentId: superior.id,
    role: 'user',
    content: reportContent,
    timestamp: Date.now(),
    isAutoReport: true,
    reportOriginAgentId: agentId
  }

  // 보고 메시지 ID 추적 (재보고 방지)
  reportMessageIds.add(reportMsg.id)

  session.messages.push(reportMsg)
  broadcastToChat(superior.id, 'session:message', reportMsg)
  store.saveSessionHistory(superior.id, session.messages)

  // 활동 로그
  logActivity('upward-report', agentId, config.name, `${config.name} → ${superior.name} 상향 보고`)

  console.log(`[upward-report] ${config.name} → ${superior.name} 보고 완료`)
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

  // CLI 설치 여부 사전 확인
  const cliCheck = checkClaudeCli()
  if (!cliCheck.installed) {
    const errorMsg: ChatMessage = {
      id: uuid(),
      agentId,
      role: 'system',
      content: `⚠️ Claude Code CLI가 설치되지 않았습니다.\n\n에이전트와 대화하려면 Claude Code CLI가 필요합니다.\n\n**설치 방법:**\n\`\`\`\nnpm install -g @anthropic-ai/claude-code\n\`\`\`\n\n설치 후 다시 시도해주세요.`,
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

    // ── 상향 보고: isAutoReport가 아닌 사용자 메시지 + director가 아닌 에이전트
    const isReport = reportMessageIds.has(userMsg.id) || userMessage.includes('[📋 자동 보고]')
    if (!isReport && config.hierarchy?.role !== 'director' && response) {
      try {
        sendUpwardReport(agentId, userMessage, response)
      } catch (reportErr) {
        console.error('[upward-report] 보고 실패:', reportErr)
      }
    }

    // director/leader 에이전트이고 위임 블록이 있으면 위임 실행 (재귀 방지)
    const canDelegate = config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    console.log(`[delegation-check] role=${config.hierarchy?.role}, canDelegate=${canDelegate}, hasDelegation=${response ? hasDelegation(response) : false}, isDelegating=${delegatingAgents.has(agentId)}, responseLen=${response?.length ?? 0}`)
    if (canDelegate && response && hasDelegation(response) && !delegatingAgents.has(agentId)) {
      // 위임자를 working 상태로 유지 (finishSession에서 idle로 바꿨으므로 다시 설정)
      agentManager.setAgentStatus(agentId, 'working')
      agentManager.setCurrentTask(agentId, '팀원 작업 대기 중...')
      broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'working' })

      delegatingAgents.add(agentId)
      executeDelegation(agentId, response, userMessage)
        .catch((err) => {
          console.error('[delegation] 위임 실행 실패:', err)
        })
        .finally(() => {
          delegatingAgents.delete(agentId)
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
    // ENOENT = CLI 실행 파일을 찾을 수 없음
    const isCliMissing = errMessage.includes('ENOENT') || errMessage.includes('not found') || errMessage.includes('not recognized')
    const displayMessage = isCliMissing
      ? `⚠️ Claude Code CLI를 실행할 수 없습니다.\n\n**설치 방법:**\n\`\`\`\nnpm install -g @anthropic-ai/claude-code\n\`\`\`\n\n설치 후 터미널을 다시 열고, \`claude --version\`으로 확인하세요.`
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

async function runClaudeSession(
  config: AgentConfig,
  session: ActiveSession,
  userMessage: string
): Promise<string> {
  const agentId = config.id

  // MCP config 파일 빌드 (있으면)
  buildMcpConfigFile(agentId)

  // 전사 규칙 + 에이전트 응답 언어 설정 로드
  const globalSettings = store.getSettings()

  // cli-builder로 인수 빌드
  const args = buildCliArgs(config, {
    resumeSessionId: session.cliSessionId,
    hasConversation: session.hasConversation,
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
      proc = spawn('claude', args, {
        cwd,
        env: cleanEnv,
        signal: session.abortController.signal,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      // userMessage를 stdin으로 전달 (ENAMETOOLONG 방지)
      proc.stdin?.write(userMessage)
      proc.stdin?.end()
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
    let lineBuffer = ''
    let costTotal = 0
    let finished = false

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
        try { proc.kill() } catch { /* already dead */ }
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

    proc.stdout?.on('data', (data: Buffer) => {
      // 워치독 하트비트 갱신
      watchdog.updateHeartbeat(agentId)

      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          handleStreamEvent(event, agentId, streamingMsgId, (text) => {
            fullResponse += text
          }, (cost) => {
            costTotal = cost
          })
          // init 이벤트에서 CLI session_id 저장
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            session.cliSessionId = event.session_id as string
          }
          // result 이벤트에서 최종 텍스트 추출 + 즉시 완료
          if (event.type === 'result') {
            if (event.result) resultText = event.result as string
            finishSession()
          }
        } catch {
          // JSON 파싱 실패 시 무시
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.error(`[${config.name}] stderr:`, text)
      appendErrorLog(agentId, text)
    })

    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer)
          handleStreamEvent(event, agentId, streamingMsgId, (text) => {
            fullResponse += text
          }, (cost) => {
            costTotal = cost
          })
          if (event.type === 'result') {
            if (event.result) resultText = event.result as string
          }
        } catch {
          // ignore
        }
      }

      if (finished) return

      if (code !== 0 && !fullResponse.trim() && !resultText.trim()) {
        session.process = null
        watchdog.unregisterProcess(agentId)
        broadcastProcessInfo(agentId, { processStatus: 'crashed', lastError: `Exit code ${code}` })
        reject(new Error(`Claude process exited with code ${code}`))
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

// 스트림 이벤트 처리
function handleStreamEvent(
  event: Record<string, unknown>,
  agentId: string,
  streamingMsgId: string,
  appendText: (text: string) => void,
  setCost: (cost: number) => void
): void {
  const type = event.type as string

  if (type === 'assistant') {
    const message = event.message as Record<string, unknown> | undefined
    if (!message) return

    const contentBlocks = message.content as Array<Record<string, unknown>> | undefined
    if (!contentBlocks || !Array.isArray(contentBlocks)) return

    for (const block of contentBlocks) {
      const blockType = block.type as string

      if (blockType === 'text') {
        const text = block.text as string
        if (text) {
          appendText(text)
          broadcastToChat(agentId, 'session:stream-delta', {
            id: streamingMsgId,
            agentId,
            delta: text
          })
        }
      } else if (blockType === 'tool_use') {
        const toolName = block.name as string
        const toolInput = block.input as Record<string, unknown>
        const toolText = `\n\n**${toolName}** \`${formatToolInput(toolName, toolInput)}\`\n`
        appendText(toolText)
        broadcastToChat(agentId, 'session:stream-delta', {
          id: streamingMsgId,
          agentId,
          delta: toolText
        })
        // 도구 사용 활동 로깅
        const config = store.getAgent(agentId)
        if (config) {
          logActivity('tool-use', agentId, config.name, `${toolName} 사용`, { toolName })
        }
      } else if (blockType === 'tool_result') {
        const content = block.content as string
        if (content) {
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
          const rt = `\n\`\`\`\n${preview}\n\`\`\`\n`
          appendText(rt)
          broadcastToChat(agentId, 'session:stream-delta', {
            id: streamingMsgId,
            agentId,
            delta: rt
          })
        }
      }
    }
  } else if (type === 'result') {
    const cost = (event.total_cost_usd as number) || 0
    setCost(cost)
    const rt = event.result as string | undefined
    if (rt) {
      broadcastToChat(agentId, 'session:result-text', {
        id: streamingMsgId,
        agentId,
        text: rt
      })
    }
  }
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    return (input.file_path as string) || JSON.stringify(input)
  }
  if (toolName === 'Bash') {
    return (input.command as string) || JSON.stringify(input)
  }
  if (toolName === 'Grep' || toolName === 'Glob') {
    return (input.pattern as string) || JSON.stringify(input)
  }
  return JSON.stringify(input)
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
    try { oldProc.kill() } catch { /* already dead */ }
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
    const canDelegateNested = config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    if (canDelegateNested && response && hasDelegation(response) && !delegatingAgents.has(agentId)) {
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
    session.abortController.abort()
    if (session.process) {
      session.process.kill()
      session.process = null
    }
    agentManager.setAgentStatus(agentId, 'idle')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
    broadcastProcessInfo(agentId, { processStatus: 'stopped' })
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

  const reportContent = `[⚠️ MCP 장애] ${config.name}의 MCP 서버 "${serverName}" 연결 실패\n` +
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
