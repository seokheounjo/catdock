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
  validateWorkingDirectory,
  checkClaudeCli,
  buildCliArgs
} from './cli-builder'
import { buildMcpConfigFile } from './mcp-manager'
import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

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

  // CLI 설치 여부 사전 확인
  const cliCheck = checkClaudeCli()
  if (!cliCheck.installed) {
    const errorMsg: ConversationMessage = {
      id: uuid(),
      conversationId: conv.config.id,
      senderType: 'system',
      agentId: null,
      agentName: null,
      content: `⚠️ Claude Code CLI가 설치되지 않았습니다.\n\n에이전트와 대화하려면 Claude Code CLI가 필요합니다.\n\n**설치 방법:**\n\`\`\`\nnpm install -g @anthropic-ai/claude-code\n\`\`\`\n\n설치 후 다시 시도해주세요.`,
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
    const isCliMissing =
      errMessage.includes('ENOENT') ||
      errMessage.includes('not found') ||
      errMessage.includes('not recognized')
    const displayMessage = isCliMissing
      ? `⚠️ Claude Code CLI를 실행할 수 없습니다. \`npm install -g @anthropic-ai/claude-code\` 로 설치하세요.`
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

// ── Claude CLI 스폰 ──

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
  },
  agentSession: AgentCliSession,
  prompt: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // MCP config 빌드
    buildMcpConfigFile(agentConfig.id)

    // 전사 규칙 + 에이전트 응답 언어 설정 로드
    const globalSettings = store.getSettings()

    const args = buildCliArgs(agentConfig as import('../../shared/types').AgentConfig, {
      resumeSessionId: agentSession.cliSessionId,
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
      proc = spawn('claude', args, {
        cwd,
        env: cleanEnv,
        signal: conv.abortController.signal,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      // prompt를 stdin으로 전달 (ENAMETOOLONG 방지)
      proc.stdin?.write(prompt)
      proc.stdin?.end()
    } catch (err) {
      reject(err)
      return
    }

    conv.currentProcess = proc

    let fullResponse = ''
    let resultText = ''
    const streamingMsgId = uuid()
    let lineBuffer = ''
    let costTotal = 0
    let finished = false

    const convId = conv.config.id
    const agentId = agentConfig.id
    const agentName = agentConfig.name

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

    proc.stdout?.on('data', (data: Buffer) => {
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          handleStreamEvent(
            event,
            convId,
            agentId,
            agentName,
            streamingMsgId,
            (text) => {
              fullResponse += text
            },
            (cost) => {
              costTotal = cost
            }
          )
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            agentSession.cliSessionId = event.session_id as string
          }
          if (event.type === 'result') {
            if (event.result) resultText = event.result as string
            finishSession()
          }
        } catch {
          // JSON 파싱 실패 무시
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`[conversation:${agentName}] stderr:`, data.toString())
    })

    proc.on('close', (code) => {
      if (lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer)
          handleStreamEvent(
            event,
            convId,
            agentId,
            agentName,
            streamingMsgId,
            (text) => {
              fullResponse += text
            },
            (cost) => {
              costTotal = cost
            }
          )
          if (event.type === 'result' && event.result) {
            resultText = event.result as string
          }
        } catch {
          /* ignore */
        }
      }
      if (finished) return
      if (code !== 0 && !fullResponse.trim() && !resultText.trim()) {
        conv.currentProcess = null
        reject(new Error(`Claude process exited with code ${code}`))
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

// ── 스트림 이벤트 처리 ──

function handleStreamEvent(
  event: Record<string, unknown>,
  convId: string,
  agentId: string,
  agentName: string,
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
          broadcast('conversation:stream-delta', convId, {
            id: streamingMsgId,
            agentId,
            agentName,
            delta: text
          })
        }
      } else if (blockType === 'tool_use') {
        const toolName = block.name as string
        const toolInput = block.input as Record<string, unknown>
        const toolText = `\n\n**${toolName}** \`${formatToolInput(toolName, toolInput)}\`\n`
        appendText(toolText)
        broadcast('conversation:stream-delta', convId, {
          id: streamingMsgId,
          agentId,
          agentName,
          delta: toolText
        })
      } else if (blockType === 'tool_result') {
        const content = block.content as string
        if (content) {
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
          const rt = `\n\`\`\`\n${preview}\n\`\`\`\n`
          appendText(rt)
          broadcast('conversation:stream-delta', convId, {
            id: streamingMsgId,
            agentId,
            agentName,
            delta: rt
          })
        }
      }
    }
  } else if (type === 'result') {
    setCost((event.total_cost_usd as number) || 0)
  }
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    return (input.file_path as string) || JSON.stringify(input)
  }
  if (toolName === 'Bash') return (input.command as string) || JSON.stringify(input)
  if (toolName === 'Grep' || toolName === 'Glob')
    return (input.pattern as string) || JSON.stringify(input)
  return JSON.stringify(input)
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
