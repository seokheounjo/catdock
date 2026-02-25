import { BrowserWindow } from 'electron'
import {
  ConversationConfig,
  ConversationMessage,
  ConversationMode,
  ConversationStatus
} from '../../shared/types'
import * as agentManager from './agent-manager'
import * as store from './store'
import {
  buildCleanEnv,
  validateWorkingDirectory
} from './cli-builder'
import { buildMcpConfigFile } from './mcp-manager'
import { v4 as uuid } from 'uuid'
import { ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { getAdapter, resolveProvider } from './cli-adapters'
import { StreamParser, formatToolInput } from './stream-parser'

// ── 내부 상태 ──

interface AgentCliSession {
  cliSessionId: string | null
  configDir: string
  hasConversation: boolean
}

interface ActiveConversation {
  config: ConversationConfig
  messages: ConversationMessage[]
  status: ConversationStatus
  currentAgentId: string | null
  currentProcess: ChildProcess | null
  abortController: AbortController
  chainPosition: { round: number; participantIdx: number } | null
  agentSessions: Map<string, AgentCliSession>
}

const activeConversations = new Map<string, ActiveConversation>()

// ── 헬퍼 ──

function getConfigDir(conversationId: string, agentId: string): string {
  // 프로젝트별 대화 세션 디렉토리 사용
  const dir = path.join(store.getProjectStoreDir(), 'conversations', conversationId, agentId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, ...args)
  })
}

function getConversation(conversationId: string): ActiveConversation | null {
  if (activeConversations.has(conversationId)) {
    return activeConversations.get(conversationId)!
  }
  const config = store.getConversationConfig(conversationId)
  if (!config) return null

  const messages = store.getConversationHistory(conversationId)
  const conv: ActiveConversation = {
    config,
    messages,
    status: 'idle',
    currentAgentId: null,
    currentProcess: null,
    abortController: new AbortController(),
    chainPosition: null,
    agentSessions: new Map()
  }
  activeConversations.set(conversationId, conv)
  return conv
}

function getAgentSession(conv: ActiveConversation, agentId: string): AgentCliSession {
  if (!conv.agentSessions.has(agentId)) {
    conv.agentSessions.set(agentId, {
      cliSessionId: null,
      configDir: getConfigDir(conv.config.id, agentId),
      hasConversation: false
    })
  }
  return conv.agentSessions.get(agentId)!
}

function persistMessages(conv: ActiveConversation): void {
  store.saveConversationHistory(conv.config.id, conv.messages)
}

// ── CRUD ──

export function createConversation(
  opts: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>
): ConversationConfig {
  const config: ConversationConfig = {
    ...opts,
    id: uuid(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  store.addConversationConfig(config)
  return config
}

export function listConversations(): ConversationConfig[] {
  return store.getConversationConfigs()
}

export function getConversationConfig(id: string): ConversationConfig | null {
  return store.getConversationConfig(id) ?? null
}

export function updateConversation(
  id: string,
  updates: Partial<ConversationConfig>
): ConversationConfig | null {
  const result = store.updateConversationConfig(id, updates)
  const conv = activeConversations.get(id)
  if (conv && result) conv.config = result
  return result
}

export function deleteConversation(id: string): void {
  abortConversation(id)
  activeConversations.delete(id)
  store.deleteConversationConfig(id)
}

export function getHistory(conversationId: string): ConversationMessage[] {
  const conv = activeConversations.get(conversationId)
  if (conv) return conv.messages
  return store.getConversationHistory(conversationId)
}

export function getState(
  conversationId: string
): { status: ConversationStatus; currentAgentId: string | null } | null {
  const conv = getConversation(conversationId)
  if (!conv) return null
  return { status: conv.status, currentAgentId: conv.currentAgentId }
}

export function setMode(conversationId: string, mode: ConversationMode): void {
  const conv = getConversation(conversationId)
  if (!conv) return
  conv.config.mode = mode
  store.updateConversationConfig(conversationId, { mode })
  broadcast('conversation:mode-changed', conversationId, mode)
}

// ── 메시지 전송 ──

export async function sendMessage(conversationId: string, userMessage: string): Promise<void> {
  const conv = getConversation(conversationId)
  if (!conv) throw new Error(`Conversation ${conversationId} not found`)

  const msg: ConversationMessage = {
    id: uuid(),
    conversationId,
    senderType: 'user',
    agentId: null,
    agentName: null,
    content: userMessage,
    timestamp: Date.now()
  }
  conv.messages.push(msg)
  persistMessages(conv)
  broadcast('conversation:message', conversationId, msg)

  if (conv.status === 'chaining') {
    return
  }

  if (conv.config.mode === 'auto-chain') {
    await runChain(conv, null)
  }
}

// ── 수동 트리거 ──

export async function triggerAgent(conversationId: string, agentId: string): Promise<void> {
  const conv = getConversation(conversationId)
  if (!conv) throw new Error(`Conversation ${conversationId} not found`)
  if (conv.status === 'chaining' || conv.status === 'waiting-agent') return

  conv.status = 'waiting-agent'
  broadcast('conversation:status-changed', conversationId, {
    status: conv.status,
    currentAgentId: agentId
  })

  try {
    await runSingleAgent(conv, agentId)
  } finally {
    if (conv.status === 'waiting-agent') {
      conv.status = 'idle'
      conv.currentAgentId = null
      broadcast('conversation:status-changed', conversationId, {
        status: 'idle',
        currentAgentId: null
      })
    }
  }
}

// ── 일시정지 / 재개 / 중단 ──

export function pauseConversation(conversationId: string): void {
  const conv = activeConversations.get(conversationId)
  if (!conv || conv.status !== 'chaining') return
  conv.status = 'paused'
  broadcast('conversation:status-changed', conversationId, {
    status: 'paused',
    currentAgentId: conv.currentAgentId
  })
}

export async function resumeConversation(conversationId: string): Promise<void> {
  const conv = activeConversations.get(conversationId)
  if (!conv || conv.status !== 'paused') return

  if (conv.config.mode === 'auto-chain') {
    await runChain(conv, conv.chainPosition)
  }
}

export function abortConversation(conversationId: string): void {
  const conv = activeConversations.get(conversationId)
  if (!conv) return
  conv.abortController.abort()
  if (conv.currentProcess) {
    try {
      conv.currentProcess.kill()
    } catch {
      /* already dead */
    }
    conv.currentProcess = null
  }
  conv.status = 'idle'
  conv.currentAgentId = null
  conv.chainPosition = null
  conv.abortController = new AbortController()
  broadcast('conversation:status-changed', conversationId, { status: 'idle', currentAgentId: null })
}

export function clearConversation(conversationId: string): void {
  abortConversation(conversationId)
  const conv = activeConversations.get(conversationId)
  if (conv) {
    conv.messages = []
    conv.agentSessions.clear()
  }
  store.clearConversationHistory(conversationId)
  broadcast('conversation:cleared', conversationId)
}

// ── 자동 연쇄 ──

async function runChain(
  conv: ActiveConversation,
  resumeFrom: { round: number; participantIdx: number } | null
): Promise<void> {
  const { config } = conv
  conv.status = 'chaining'
  conv.abortController = new AbortController()
  broadcast('conversation:status-changed', config.id, { status: 'chaining', currentAgentId: null })

  const startRound = resumeFrom?.round ?? 0
  const startIdx = resumeFrom?.participantIdx ?? 0

  try {
    for (let round = startRound; round < config.maxRoundsPerChain; round++) {
      const firstIdx = round === startRound ? startIdx : 0
      for (let i = firstIdx; i < config.participantIds.length; i++) {
        // 일시정지 체크 (외부에서 pauseConversation 호출 가능)
        if ((conv.status as ConversationStatus) === 'paused') {
          conv.chainPosition = { round, participantIdx: i }
          return
        }
        if (conv.abortController.signal.aborted) return

        const agentId = config.participantIds[i]
        await runSingleAgent(conv, agentId)

        if (conv.abortController.signal.aborted) return
      }
    }
  } finally {
    if (conv.status === 'chaining') {
      conv.status = 'idle'
      conv.currentAgentId = null
      conv.chainPosition = null
      broadcast('conversation:status-changed', config.id, { status: 'idle', currentAgentId: null })
      broadcast('conversation:chain-complete', config.id)
    }
  }
}

// ── 단일 에이전트 CLI 실행 ──

async function runSingleAgent(conv: ActiveConversation, agentId: string): Promise<void> {
  const agentConfig = store.getAgent(agentId)
  if (!agentConfig) {
    const sysMsg: ConversationMessage = {
      id: uuid(),
      conversationId: conv.config.id,
      senderType: 'system',
      agentId: null,
      agentName: null,
      content: `에이전트 ${agentId}를 찾을 수 없습니다.`,
      timestamp: Date.now()
    }
    conv.messages.push(sysMsg)
    persistMessages(conv)
    broadcast('conversation:message', conv.config.id, sysMsg)
    return
  }

  // CLI 설치 여부 사전 확인 (프로바이더별)
  const provider = resolveProvider(agentConfig)
  const adapter = getAdapter(provider)
  const cliCheck = adapter.checkInstalled()
  if (!cliCheck.installed) {
    const displayName = adapter.getDisplayName()
    const installCmd = adapter.getInstallCommand()
    const errorMsg: ConversationMessage = {
      id: uuid(),
      conversationId: conv.config.id,
      senderType: 'system',
      agentId: null,
      agentName: null,
      content: `⚠️ ${displayName}가 설치되지 않았습니다.\n\n에이전트와 대화하려면 ${displayName}가 필요합니다.\n\n**설치 방법:**\n\`\`\`\n${installCmd}\n\`\`\`\n\n설치 후 다시 시도해주세요.`,
      timestamp: Date.now()
    }
    conv.messages.push(errorMsg)
    persistMessages(conv)
    broadcast('conversation:message', conv.config.id, errorMsg)
    return
  }

  conv.currentAgentId = agentId
  broadcast('conversation:status-changed', conv.config.id, {
    status: conv.status,
    currentAgentId: agentId
  })

  const agentSession = getAgentSession(conv, agentId)
  const contextPrompt = buildContextForAgent(conv, agentConfig.name, agentConfig.role)

  try {
    await spawnClaude(conv, agentConfig, agentSession, contextPrompt)
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return

    const errMessage = (err as Error).message || String(err)
    const adapterForError = getAdapter(resolveProvider(agentConfig))
    const isCliMissing =
      errMessage.includes('ENOENT') ||
      errMessage.includes('not found') ||
      errMessage.includes('not recognized')
    const displayMessage = isCliMissing
      ? `⚠️ ${adapterForError.getDisplayName()}를 실행할 수 없습니다. \`${adapterForError.getInstallCommand()}\` 로 설치하세요.`
      : `[${agentConfig.name}] 오류: ${errMessage}`

    const errorMsg: ConversationMessage = {
      id: uuid(),
      conversationId: conv.config.id,
      senderType: 'system',
      agentId,
      agentName: agentConfig.name,
      content: displayMessage,
      timestamp: Date.now()
    }
    conv.messages.push(errorMsg)
    persistMessages(conv)
    broadcast('conversation:message', conv.config.id, errorMsg)
  }
}

// ── 컨텍스트 빌드 ──

const MAX_PROMPT_LENGTH = 24000

function buildContextForAgent(
  conv: ActiveConversation,
  agentName: string,
  agentRole: string
): string {
  const participants = conv.config.participantIds
    .map((id) => {
      const a = store.getAgent(id)
      return a ? `${a.name}(${a.role})` : id
    })
    .join(', ')

  const header = `그룹 토론 참여자: ${participants}\n---\n`
  const footer = `\n---\n지금 네 차례. ${agentName}(${agentRole})로서 자연스럽게 응답해. 다른 참여자의 의견을 참고하고, 네 전문 분야 관점에서 기여해.`
  const budgetForTranscript = MAX_PROMPT_LENGTH - header.length - footer.length

  const recent = conv.messages.slice(-15)
  const lines: string[] = []
  let totalLen = 0

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i]
    const content = m.content.length > 400 ? m.content.slice(0, 400) + '...' : m.content
    let line: string
    if (m.senderType === 'user') line = `[User]: ${content}`
    else if (m.senderType === 'agent') line = `[${m.agentName}]: ${content}`
    else line = `[System]: ${content}`

    if (totalLen + line.length + 1 > budgetForTranscript) break
    lines.unshift(line)
    totalLen += line.length + 1
  }

  return header + lines.join('\n') + footer
}

// ── CLI 프로세스 스폰 (어댑터 패턴) ──

function spawnCliProcess(
  conv: ActiveConversation,
  agentConfig: {
    id: string
    name: string
    model: string
    systemPrompt: string
    workingDirectory: string
    permissionMode?: string
    maxTurns?: number
    mcpConfig?: unknown[]
    cliFlags?: unknown
    cliProvider?: import('../../shared/types').CliProvider
  },
  agentSession: AgentCliSession,
  prompt: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const fullConfig = agentConfig as import('../../shared/types').AgentConfig
    const provider = resolveProvider(fullConfig)
    const adapter = getAdapter(provider)

    // MCP config 빌드 (MCP 지원 프로바이더만)
    if (adapter.supportsMcp()) {
      buildMcpConfigFile(agentConfig.id)
    }

    const globalSettings = store.getSettings()

    const args = adapter.buildArgs(fullConfig, {
      resumeSessionId: adapter.supportsResume() ? agentSession.cliSessionId : null,
      hasConversation: agentSession.hasConversation,
      userMessage: prompt,
      companyRules: globalSettings.companyRules,
      agentLanguage: globalSettings.agentLanguage
    })

    let cwd: string
    try {
      cwd = validateWorkingDirectory(agentConfig.workingDirectory)
    } catch {
      cwd = agentConfig.workingDirectory || process.cwd()
    }
    const cleanEnv = buildCleanEnv()

    let proc: ChildProcess
    try {
      const spawnResult = adapter.spawnProcess(fullConfig, args, {
        cwd,
        env: cleanEnv,
        signal: conv.abortController.signal
      })
      proc = spawnResult.process

      if (spawnResult.writeStdin) {
        proc.stdin?.write(prompt)
        proc.stdin?.end()
      }
    } catch (err) {
      reject(err)
      return
    }

    conv.currentProcess = proc

    let fullResponse = ''
    let resultText = ''
    const streamingMsgId = uuid()
    let costTotal = 0
    let finished = false

    const convId = conv.config.id
    const agentId = agentConfig.id
    const agentName = agentConfig.name

    // StreamParser로 통합 파싱
    const parser = new StreamParser(adapter)

    broadcast('conversation:stream-start', convId, {
      id: streamingMsgId,
      agentId,
      agentName
    })

    const finishSession = (): void => {
      if (finished) return
      finished = true
      conv.currentProcess = null

      if (conv.abortController.signal.aborted) {
        resolve()
        return
      }

      const finalContent = fullResponse.trim() || resultText.trim()
      if (!finalContent) {
        broadcast('conversation:stream-end', convId, {
          id: streamingMsgId,
          agentId,
          agentName,
          skipped: true
        })
        resolve()
        return
      }

      const assistantMsg: ConversationMessage = {
        id: streamingMsgId,
        conversationId: convId,
        senderType: 'agent',
        agentId,
        agentName,
        content: finalContent,
        timestamp: Date.now(),
        costDelta: costTotal
      }
      conv.messages.push(assistantMsg)
      agentSession.hasConversation = true
      persistMessages(conv)

      broadcast('conversation:stream-end', convId, assistantMsg)
      agentManager.addAgentCost(agentId, costTotal)

      if (proc && !proc.killed) {
        try {
          proc.kill()
        } catch {
          /* already dead */
        }
      }

      resolve()
    }

    const parserCallbacks = {
      onInit: (sessionId: string) => {
        agentSession.cliSessionId = sessionId
      },
      onText: (text: string) => {
        fullResponse += text
        broadcast('conversation:stream-delta', convId, {
          id: streamingMsgId,
          agentId,
          agentName,
          delta: text
        })
      },
      onToolUse: (toolName: string, toolInput: Record<string, unknown>) => {
        const toolText = `\n\n**${toolName}** \`${formatToolInput(toolName, toolInput)}\`\n`
        fullResponse += toolText
        broadcast('conversation:stream-delta', convId, {
          id: streamingMsgId,
          agentId,
          agentName,
          delta: toolText
        })
      },
      onToolResult: (output: string) => {
        const preview = output.length > 300 ? output.slice(0, 300) + '...' : output
        const rt = `\n\`\`\`\n${preview}\n\`\`\`\n`
        fullResponse += rt
        broadcast('conversation:stream-delta', convId, {
          id: streamingMsgId,
          agentId,
          agentName,
          delta: rt
        })
      },
      onCost: (cost: number) => {
        costTotal = cost
      },
      onResult: (text: string) => {
        resultText = text
        finishSession()
      },
      onError: (message: string) => {
        console.error(`[conversation:${agentName}] stream error:`, message)
      }
    }

    proc.stdout?.on('data', (data: Buffer) => {
      parser.processChunk(data.toString(), parserCallbacks)
    })

    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`[conversation:${agentName}] stderr:`, data.toString())
    })

    proc.on('close', (code) => {
      parser.flush(parserCallbacks)

      if (finished) return
      if (code !== 0 && !fullResponse.trim() && !resultText.trim()) {
        conv.currentProcess = null
        const displayName = adapter.getDisplayName()
        reject(new Error(`${displayName} process exited with code ${code}`))
      } else {
        finishSession()
      }
    })

    proc.on('error', (err) => {
      conv.currentProcess = null
      reject(err)
    })
  })
}

// 하위호환 래퍼
function spawnClaude(
  conv: ActiveConversation,
  agentConfig: {
    id: string
    name: string
    model: string
    systemPrompt: string
    workingDirectory: string
    permissionMode?: string
    maxTurns?: number
    mcpConfig?: unknown[]
    cliFlags?: unknown
    cliProvider?: import('../../shared/types').CliProvider
  },
  agentSession: AgentCliSession,
  prompt: string
): Promise<void> {
  return spawnCliProcess(conv, agentConfig, agentSession, prompt)
}

// ── Cleanup ──

export function cleanup(): void {
  for (const [, conv] of activeConversations) {
    if (conv.currentProcess) {
      try {
        conv.currentProcess.kill()
      } catch {
        /* ignore */
      }
    }
  }
  activeConversations.clear()
}
