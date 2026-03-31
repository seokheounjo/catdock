import { BrowserWindow } from 'electron'
import { AgentConfig, ChatMessage, AgentProcessInfo } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as store from './store'
import {
  buildCleanEnv,
  validateWorkingDirectory
} from './cli-builder'
import { resolveProfileForAgent, buildProfileEnv } from './cli-profile-manager'
import { buildMcpConfigFile } from './mcp-manager'
import { logActivity } from './activity-logger'
import { hasDelegation, executeDelegation, setSendMessageAndCapture, executeRemoveBlocks, hasMcpBlocks, parseMcpAddBlocks, parseMcpRemoveBlocks, parseJsonMcpConfig, hasDirectMcpConfig, buildOrgContext } from './delegation-manager'
import { buildMcpConfigFile as rebuildMcpConfigFile } from './mcp-manager'
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

// 외부에서 위임 상태 확인 (error-recovery에서 사용)
export function isDelegating(agentId: string): boolean {
  return delegatingAgents.has(agentId)
}
export function isAnyDelegationActive(): boolean {
  return delegatingAgents.size > 0
}
// 위임 시작 시간 추적 — 타임아웃 감지용
const delegatingStartTimes = new Map<string, number>()
// 메시지 큐 — 에이전트가 바쁠 때 대기
const messageQueues = new Map<string, string[]>()
// 상향 보고 메시지 ID 추적 — 보고에 대한 재보고 방지
const reportMessageIds = new Set<string>()
// 상향 보고 쿨다운 — 같은 에이전트의 연속 보고 방지 (API 절약)
const lastReportTime = new Map<string, number>()
const REPORT_COOLDOWN_MS = 60_000 // 60초

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
  abortSession: (agentId: string) => abortSession(agentId),
  isAnyDelegationActive: () => isAnyDelegationActive()
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

// ── 예산 관리 ──
function checkBudgetThreshold(agentId: string): void {
  const config = store.getAgent(agentId)
  if (!config) return
  const settings = store.getSettings()
  const budgetLimit = config.budgetLimitUsd ?? settings.defaultBudgetLimitUsd
  if (!budgetLimit) return // 무제한

  const { monthlyUsd } = store.getAgentCost(agentId)
  const warningPercent = config.budgetWarningPercent ?? settings.defaultBudgetWarningPercent ?? 80
  const usagePercent = (monthlyUsd / budgetLimit) * 100

  if (usagePercent >= 100) {
    const msg: ChatMessage = {
      id: `budget-exceeded-${Date.now()}`,
      agentId,
      role: 'system',
      content: `⚠️ 월 예산 초과: $${monthlyUsd.toFixed(4)} / $${budgetLimit.toFixed(2)} (${usagePercent.toFixed(0)}%). 이 에이전트의 작업이 일시 중지됩니다.`,
      timestamp: Date.now()
    }
    broadcastToChat(agentId, 'session:message', msg)
    agentManager.setAgentStatus(agentId, 'error')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'error' })
    logActivity('budget-exceeded', agentId, config.name, `월 예산 초과: $${monthlyUsd.toFixed(4)}/$${budgetLimit.toFixed(2)}`)
    console.log(`[budget] ${config.name} 월 예산 초과 → 자동 중지`)
  } else if (usagePercent >= warningPercent) {
    const msg: ChatMessage = {
      id: `budget-warning-${Date.now()}`,
      agentId,
      role: 'system',
      content: `💰 예산 경고: $${monthlyUsd.toFixed(4)} / $${budgetLimit.toFixed(2)} (${usagePercent.toFixed(0)}%)`,
      timestamp: Date.now()
    }
    broadcastToChat(agentId, 'session:message', msg)
    console.log(`[budget] ${config.name} 예산 경고: ${usagePercent.toFixed(0)}%`)
  }
}

function isBudgetExceeded(agentId: string): boolean {
  const config = store.getAgent(agentId)
  if (!config) return false
  const settings = store.getSettings()
  const budgetLimit = config.budgetLimitUsd ?? settings.defaultBudgetLimitUsd
  if (!budgetLimit) return false // 무제한
  const { monthlyUsd } = store.getAgentCost(agentId)
  return monthlyUsd >= budgetLimit
}

// ── 보고 생략 판단 — 경미한 응답은 CLI 호출 낭비 방지 ──
function shouldSkipReport(_userMessage: string, assistantResponse: string): boolean {
  // 매우 짧은 응답 — 단순 확인/인사 등
  if (assistantResponse.length < 150) return true

  // QUESTION 블록 답변 — UI 상호작용일 뿐, 보고할 실질적 내용 없음
  if (/^\*\*Q\d+:/.test(assistantResponse) && !assistantResponse.includes('[DELEGATE')) return true

  // 작업 실행 지표가 없고 짧은 응답 — 정보성 답변
  const hasActionIndicators = /\[DELEGATE|파일.*수정|코드.*변경|에러|오류|실패|버그|생성|삭제|배포|설치/.test(assistantResponse)
  if (!hasActionIndicators && assistantResponse.length < 500) return true

  return false
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

// ── MCP 블록 실행 ── Director/Leader 응답에서 MCP 서버 추가/제거
function executeMcpBlocks(agentId: string, response: string): void {
  const addBlocks = parseMcpAddBlocks(response)
  const removeNames = parseMcpRemoveBlocks(response)

  if (addBlocks.length === 0 && removeNames.length === 0) return

  const config = store.getAgent(agentId)
  if (!config) return

  let mcpConfig = [...(config.mcpConfig || [])]

  // MCP 서버 추가
  for (const block of addBlocks) {
    // 기존에 같은 이름이 있으면 교체
    mcpConfig = mcpConfig.filter((s) => s.name !== block.name)
    mcpConfig.push({
      name: block.name,
      command: block.command,
      args: block.args.length > 0 ? block.args : undefined,
      env: Object.keys(block.env).length > 0 ? block.env : undefined,
      cwd: block.cwd || undefined,
      enabled: true
    })
    console.log(`[mcp-blocks] ${config.name}: MCP 서버 추가 — ${block.name} (${block.command})${Object.keys(block.env).length > 0 ? ` env: ${Object.keys(block.env).join(',')}` : ''}`)
  }

  // MCP 서버 제거
  for (const name of removeNames) {
    const before = mcpConfig.length
    mcpConfig = mcpConfig.filter((s) => s.name !== name)
    if (mcpConfig.length < before) {
      console.log(`[mcp-blocks] ${config.name}: MCP 서버 제거 — ${name}`)
    }
  }

  // 에이전트 config 업데이트
  agentManager.updateAgent(agentId, { mcpConfig })

  // MCP config 파일 재빌드
  try {
    rebuildMcpConfigFile(agentId)
  } catch {
    // MCP 파일 빌드 실패는 무시 — 다음 세션에서 자동 재빌드됨
  }

  // UI에 변경 알림
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('mcp:config-changed', { agentId, added: addBlocks.length, removed: removeNames.length })
  })

  logActivity('mcp-configured', agentId, config.name,
    `MCP 설정 변경: +${addBlocks.length} -${removeNames.length}`)
}

// ── 사용자 메시지에서 직접 MCP 설정 처리 ──
// [MCP:ADD|...] 블록이나 JSON { "mcpServers": {...} } 형식 감지 후 즉시 등록
interface DirectMcpResult {
  handled: boolean
  registeredCount: number
  names: string[]
}

function handleDirectMcpInput(
  agentId: string,
  message: string,
  _session: ReturnType<typeof getSession>
): DirectMcpResult {
  const result: DirectMcpResult = { handled: false, registeredCount: 0, names: [] }

  // 1) [MCP:ADD|...] / [MCP:REMOVE|...] 블록 파싱
  const addBlocks = parseMcpAddBlocks(message)
  const removeNames = parseMcpRemoveBlocks(message)

  // 2) JSON 형식 MCP config 파싱 (붙여넣기)
  const jsonBlocks = parseJsonMcpConfig(message)

  const allAddBlocks = [...addBlocks, ...jsonBlocks]

  if (allAddBlocks.length === 0 && removeNames.length === 0) return result

  const config = store.getAgent(agentId)
  if (!config) return result

  let mcpConfig = [...(config.mcpConfig || [])]

  // MCP 서버 추가
  for (const block of allAddBlocks) {
    mcpConfig = mcpConfig.filter((s) => s.name !== block.name)
    mcpConfig.push({
      name: block.name,
      command: block.command,
      args: block.args.length > 0 ? block.args : undefined,
      env: Object.keys(block.env).length > 0 ? block.env : undefined,
      cwd: block.cwd || undefined,
      enabled: true
    })
    result.names.push(block.name)
    console.log(`[mcp-direct] 사용자 직접 등록: ${block.name} (${block.command})`)
  }

  // MCP 서버 제거
  for (const name of removeNames) {
    const before = mcpConfig.length
    mcpConfig = mcpConfig.filter((s) => s.name !== name)
    if (mcpConfig.length < before) {
      result.names.push(`-${name}`)
      console.log(`[mcp-direct] 사용자 직접 제거: ${name}`)
    }
  }

  result.registeredCount = allAddBlocks.length + removeNames.length
  result.handled = true

  // 에이전트 config 업데이트
  agentManager.updateAgent(agentId, { mcpConfig })

  // MCP config 파일 재빌드
  try {
    rebuildMcpConfigFile(agentId)
  } catch {
    // 무시
  }

  // UI 브로드캐스트
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send('mcp:config-changed', {
      agentId,
      added: allAddBlocks.length,
      removed: removeNames.length
    })
  })

  logActivity('mcp-configured', agentId, config.name,
    `사용자 직접 MCP 설정: +${allAddBlocks.length} -${removeNames.length}`)

  return result
}

// ── 모드 추출 ── [MODE:plan-first] 또는 [MODE:execute-now] 접두사 파싱
function extractMode(message: string): { mode: 'plan-first' | 'execute-now' | null; cleanMessage: string } {
  const planMatch = message.match(/^\[MODE:plan-first\]\n?/)
  if (planMatch) {
    return { mode: 'plan-first', cleanMessage: message.slice(planMatch[0].length) }
  }
  const execMatch = message.match(/^\[MODE:execute-now\]\n?/)
  if (execMatch) {
    return { mode: 'execute-now', cleanMessage: message.slice(execMatch[0].length) }
  }
  return { mode: null, cleanMessage: message }
}

// 모드에 따른 지시문 삽입
function applyModePrefix(mode: 'plan-first' | 'execute-now' | null, message: string): string {
  if (mode === 'plan-first') {
    return `[지시: 먼저 요청을 분석하고 2-3개 확인 질문을 한 뒤, 사용자 답변 후 필요한 팀만 편성하여 작업을 시작하라. 불필요한 팀은 만들지 마라.]\n\n${message}`
  }
  if (mode === 'execute-now') {
    return `[지시: 요청을 분석하여 즉시 필요한 팀만 편성하고 작업을 시작하라. 불필요한 질문 없이 바로 실행하라.]\n\n${message}`
  }
  return message
}

export async function sendMessage(agentId: string, userMessage: string): Promise<void> {
  const config = store.getAgent(agentId)
  if (!config) throw new Error(`Agent ${agentId} not found`)

  // ── 예산 초과 차단 ──
  if (isBudgetExceeded(agentId)) {
    const settings = store.getSettings()
    const budgetLimit = config.budgetLimitUsd ?? settings.defaultBudgetLimitUsd ?? 0
    const { monthlyUsd } = store.getAgentCost(agentId)
    const session = getSession(agentId)
    const blockedMsg: ChatMessage = {
      id: `budget-blocked-${Date.now()}`,
      agentId,
      role: 'system',
      content: `🚫 예산 초과로 작업이 차단되었습니다. (사용: $${monthlyUsd.toFixed(4)} / 한도: $${budgetLimit.toFixed(2)})\n설정에서 예산을 늘리거나 다음 달까지 기다려주세요.`,
      timestamp: Date.now()
    }
    session.messages.push(blockedMsg)
    broadcastToChat(agentId, 'session:message', blockedMsg)
    store.saveSessionHistory(agentId, session.messages)
    return
  }

  // 모드 추출 및 적용
  const { mode, cleanMessage } = extractMode(userMessage)
  const processedMessage = config.hierarchy?.role === 'director'
    ? applyModePrefix(mode, cleanMessage)
    : cleanMessage
  // 모드가 있으면 처리된 메시지 사용, 없으면 원본 유지
  const finalUserMessage = mode ? processedMessage : userMessage

  const session = getSession(agentId)

  // ── 사용자 메시지에서 직접 MCP 설정 감지 & 등록 ──
  if (hasDirectMcpConfig(cleanMessage)) {
    const directMcpResult = handleDirectMcpInput(agentId, cleanMessage, session)
    if (directMcpResult.handled && directMcpResult.registeredCount > 0) {
      // 등록 완료 시스템 메시지 추가
      const sysMsg: ChatMessage = {
        id: uuid(),
        agentId,
        role: 'system',
        content: `MCP 서버 ${directMcpResult.registeredCount}개 직접 등록 완료: ${directMcpResult.names.join(', ')}`,
        timestamp: Date.now()
      }
      session.messages.push(sysMsg)
      broadcastToChat(agentId, 'session:message', sysMsg)
      store.saveSessionHistory(agentId, session.messages)

      // MCP만 등록하고 AI 호출 없이 끝낼 수도 있지만,
      // 사용자가 추가 지시를 같이 보낼 수 있으므로 AI 호출은 계속 진행
    }
  }

  // 에이전트가 바쁘면 메시지를 큐에 추가
  if (isAgentBusy(agentId)) {
    if (!messageQueues.has(agentId)) messageQueues.set(agentId, [])
    messageQueues.get(agentId)!.push(finalUserMessage)

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

  // Add user message (UI에는 모드 접두사 없는 깨끗한 메시지 표시)
  const displayMessage = mode ? cleanMessage : userMessage
  const userMsg: ChatMessage = {
    id: uuid(),
    agentId,
    role: 'user',
    content: displayMessage,
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
    // Director에게 보내는 메시지에 현재 조직 현황 주입
    let cliMessage = finalUserMessage
    if (config.hierarchy?.role === 'director') {
      const orgContext = buildOrgContext(agentId)
      if (orgContext) {
        cliMessage = `${orgContext}\n${finalUserMessage}`
      }
    }

    const response = await runClaudeSession(config, session, cliMessage)

    // ── 상향 보고 체인: member → leader → director
    // 1) 일반 사용자 메시지 → 상위자에게 보고 (member/leader 모두)
    // 2) 자동 보고 메시지 수신 시 (leader가 member 보고를 받은 경우) → director에게 체인 보고
    const isMemberReport = finalUserMessage.includes('[📋 자동 보고]')
    const isDirectReport = reportMessageIds.has(userMsg.id)

    if (config.hierarchy?.role !== 'director' && response) {
      if (!isDirectReport && !isMemberReport) {
        // 일반 사용자 지시 → 상위자에게 보고 (스마트 생략 + 쿨다운 적용)
        const now = Date.now()
        const lastReport = lastReportTime.get(agentId) ?? 0
        if (now - lastReport < REPORT_COOLDOWN_MS) {
          console.log(`[upward-report] 쿨다운 중: ${config.name} (${Math.round((REPORT_COOLDOWN_MS - (now - lastReport)) / 1000)}초 남음)`)
        } else if (shouldSkipReport(finalUserMessage, response)) {
          console.log(`[upward-report] 보고 생략: ${config.name} (응답이 경미함, ${response.length}자)`)
        } else {
          try {
            lastReportTime.set(agentId, now)
            sendUpwardReport(agentId, finalUserMessage, response)
          } catch (reportErr) {
            console.error('[upward-report] 보고 실패:', reportErr)
          }
        }
      } else if (isMemberReport && config.hierarchy?.role === 'leader') {
        // 리더가 멤버 보고를 처리한 후 → 총괄에게 판단 결과 체인 보고
        const now = Date.now()
        const lastChain = lastReportTime.get(`chain-${agentId}`) ?? 0
        if (now - lastChain < REPORT_COOLDOWN_MS) {
          console.log(`[chain-report] 쿨다운 중: ${config.name}`)
        } else if (shouldSkipReport(userMessage, response)) {
          console.log(`[chain-report] 보고 생략: ${config.name} (판단 결과가 경미함)`)
        } else {
          try {
            lastReportTime.set(`chain-${agentId}`, now)
            sendChainReport(agentId, userMessage, response)
          } catch (reportErr) {
            console.error('[chain-report] 체인 보고 실패:', reportErr)
          }
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

    // [MCP:ADD|...] / [MCP:REMOVE|...] 블록 처리
    if (canManageTeam && response && hasMcpBlocks(response)) {
      try {
        executeMcpBlocks(agentId, response)
      } catch (mcpErr) {
        console.error('[mcp-blocks] MCP 블록 처리 실패:', mcpErr)
      }
    }

    // 조직 최적화 요청인 경우 위임 실행 차단 (REMOVE만 처리됨)
    const isOptimizeOnly = /조직\s*최적화/.test(userMessage)
    if (isOptimizeOnly && canManageTeam && response) {
      console.log('[delegation-check] 조직 최적화 모드 — DELEGATE 실행 차단, REMOVE만 처리')
    }

    // director/leader 에이전트이고 위임 블록이 있으면 위임 실행 (재귀 방지)
    const canDelegate = config.hierarchy?.role === 'director' || config.hierarchy?.role === 'leader'
    console.log(
      `[delegation-check] role=${config.hierarchy?.role}, canDelegate=${canDelegate}, hasDelegation=${response ? hasDelegation(response) : false}, isDelegating=${delegatingAgents.has(agentId)}, responseLen=${response?.length ?? 0}, optimizeOnly=${isOptimizeOnly}`
    )
    if (canDelegate && response && hasDelegation(response) && !delegatingAgents.has(agentId) && !isOptimizeOnly) {
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
    // 프로필 환경변수 주입
    const profile = resolveProfileForAgent(config)
    const envWithProfile = profile ? buildProfileEnv(cleanEnv, profile) : cleanEnv

    // 프로세스 시작 상태
    broadcastProcessInfo(agentId, {
      processStatus: 'starting',
      modelInUse: config.model
    })

    let proc: ChildProcess
    try {
      const spawnResult = adapter.spawnProcess(config, args, {
        cwd,
        env: envWithProfile,
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
      // 비용 영속화 + 예산 체크
      if (costTotal > 0) {
        store.addAgentCost(agentId, costTotal)
        checkBudgetThreshold(agentId)
      }
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
        // 도구 입력을 한 줄로 축약 (최대 80자)
        const rawInput = formatToolInput(toolName, toolInput)
        const firstLine = rawInput.split('\n')[0]
        const shortInput = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine
        const toolText = `\n\n> **${toolName}** \`${shortInput}\`\n`
        fullResponse += toolText
        broadcastToChat(agentId, 'session:stream-delta', {
          id: streamingMsgId,
          agentId,
          delta: toolText
        })
        const agentConfig = store.getAgent(agentId)
        if (agentConfig) {
          logActivity('tool-use', agentId, agentConfig.name, `${toolName} 사용`, {
            toolName,
            toolInput: shortInput,
            currentCostUsd: costTotal
          })
        }
      },
      onToolResult: (output: string) => {
        // 도구 결과를 짧게 축약 (최대 150자, 1줄 요약)
        const trimmed = output.trim()
        if (!trimmed) return // 빈 결과는 표시하지 않음
        const firstLine = trimmed.split('\n')[0]
        const preview = firstLine.length > 150 ? firstLine.slice(0, 147) + '...' : firstLine
        const rt = `\n> \`${preview}\`\n`
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

  // ★ error 상태 에이전트 → 세션 리셋 후 진행 (깨끗한 상태로 시작)
  const currentStatus = agentManager.getAgentState(agentId)?.status
  if (currentStatus === 'error') {
    console.log(`[sendMessageAndCapture] ${config.name} error 상태 → 세션 리셋`)
    if (session.process) {
      try { session.process.kill() } catch { /* already dead */ }
      session.process = null
    }
    session.abortController.abort()
    // 새 세션으로 시작 (기존 대화 이력은 유지하되 CLI 세션은 새로 시작)
    session.cliSessionId = null
    session.hasConversation = false
    store.updateSessionId(agentId, '')
    agentManager.setAgentStatus(agentId, 'idle')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'idle' })
  }

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
      delegatingStartTimes.set(agentId, Date.now())
      try {
        await executeDelegation(agentId, response, userMessage)
        // 위임 종합 후 마지막 assistant 메시지 반환
        const lastAssistant = session.messages.filter((m) => m.role === 'assistant').pop()
        return lastAssistant?.content ?? response
      } finally {
        delegatingAgents.delete(agentId)
        delegatingStartTimes.delete(agentId)
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
