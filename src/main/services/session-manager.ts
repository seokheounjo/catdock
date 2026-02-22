import { BrowserWindow } from 'electron'
import { AgentConfig, ChatMessage } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as store from './store'
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
  hasConversation: boolean // --resume 사용 여부 결정
  cliSessionId: string | null // Claude CLI의 session_id (--resume용)
}

const activeSessions = new Map<string, ActiveSession>()

function getConfigDir(agentId: string): string {
  const dir = path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
    'virtual-company',
    'sessions',
    agentId
  )
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
      hasConversation: false, // CLI session_id가 있을 때만 true
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

export async function sendMessage(agentId: string, userMessage: string): Promise<void> {
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

  // Set agent status to working
  agentManager.setAgentStatus(agentId, 'working')
  broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'working' })

  try {
    await runClaudeSession(config, session, userMessage)
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') return

    const errorMsg: ChatMessage = {
      id: uuid(),
      agentId,
      role: 'system',
      content: `Error: ${(err as Error).message}`,
      timestamp: Date.now()
    }
    session.messages.push(errorMsg)
    broadcastToChat(agentId, 'session:message', errorMsg)
    agentManager.setAgentStatus(agentId, 'error')
    broadcastToChat(agentId, 'agent:status-changed', { id: agentId, status: 'error' })
  } finally {
    store.saveSessionHistory(agentId, session.messages)
  }
}

async function runClaudeSession(
  config: AgentConfig,
  session: ActiveSession,
  userMessage: string
): Promise<void> {
  const agentId = config.id
  const claudePath = 'claude'

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--model', config.model,
    '--max-turns', '25',
    '--permission-mode', 'acceptEdits'
  ]

  // 이전 CLI 세션이 있으면 --resume으로 이어서 대화
  if (session.hasConversation && session.cliSessionId) {
    args.push('--resume', session.cliSessionId)
  }

  // 시스템 프롬프트 (첫 대화 시에만 필요하지만 매번 보내도 안전)
  // ★ shell: false 사용하므로 직접 전달 가능
  if (config.systemPrompt) {
    args.push('--system-prompt', config.systemPrompt)
  }

  args.push(userMessage)

  return new Promise<void>((resolve, reject) => {
    const cwd = config.workingDirectory || process.cwd()

    // Claude Code 관련 환경변수 모두 제거 — nested session 감지 우회 + 인증 충돌 방지
    const cleanEnv = { ...process.env }
    for (const key of Object.keys(cleanEnv)) {
      if (key === 'CLAUDECODE' || key === 'CLAUDE_CODE_ENTRYPOINT' || key === 'CLAUDE_CODE_SESSION') {
        delete cleanEnv[key]
      }
    }

    let proc: ChildProcess
    try {
      proc = spawn(claudePath, args, {
        cwd,
        env: cleanEnv, // ★ CLAUDE_CONFIG_DIR 제거 — 기본 인증 정보 사용
        signal: session.abortController.signal,
        shell: false, // ★ Windows cmd.exe 파싱 문제 회피 (shell: true 대신)
        stdio: ['ignore', 'pipe', 'pipe'] // ★ stdin 닫기 — CLI가 입력 대기하지 않도록
      })
    } catch (err) {
      reject(err)
      return
    }

    session.process = proc

    let fullResponse = ''
    let resultText = '' // result 이벤트의 최종 텍스트 (fallback)
    let streamingMsgId = uuid()
    let lineBuffer = ''
    let costTotal = 0
    let finished = false // result 이벤트 수신 후 중복 완료 방지

    // ★ result 이벤트 수신 시 즉시 완료 처리 (close를 기다리지 않음)
    const finishSession = (): void => {
      if (finished) return
      finished = true
      session.process = null

      if (session.abortController.signal.aborted) {
        resolve()
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

      // 프로세스가 아직 살아있으면 종료
      if (proc && !proc.killed) {
        try { proc.kill() } catch { /* already dead */ }
      }

      resolve()
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
      lineBuffer += data.toString()
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || '' // 마지막 불완전한 라인은 버퍼에 유지

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
          // JSON 파싱 실패 시 무시 (verbose 로그 등)
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`[${config.name}] stderr:`, data.toString())
    })

    proc.on('close', (code) => {
      // 버퍼에 남은 라인 처리
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

      // result 이벤트에서 이미 완료 처리된 경우 스킵
      if (finished) return

      // result 없이 프로세스가 종료된 경우 (에러 등)
      if (code !== 0 && !fullResponse.trim() && !resultText.trim()) {
        session.process = null
        reject(new Error(`Claude process exited with code ${code}`))
      } else {
        finishSession()
      }
    })

    proc.on('error', (err) => {
      session.process = null
      reject(err)
    })
  })
}

// Claude CLI stream-json 실제 포맷:
// {"type":"system","subtype":"init","session_id":"...","tools":[...]}
// {"type":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"tool_use","name":"Read","input":{...}}]}}
// {"type":"result","subtype":"success","result":"...","total_cost_usd":0.01}
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
      } else if (blockType === 'tool_result') {
        const content = block.content as string
        if (content) {
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content
          const resultText = `\n\`\`\`\n${preview}\n\`\`\`\n`
          appendText(resultText)
          broadcastToChat(agentId, 'session:stream-delta', {
            id: streamingMsgId,
            agentId,
            delta: resultText
          })
        }
      }
    }
  } else if (type === 'result') {
    const cost = (event.total_cost_usd as number) || 0
    setCost(cost)
    // result 이벤트의 result 필드에 최종 텍스트가 있을 수 있음
    const resultText = event.result as string | undefined
    if (resultText) {
      // 이미 스트리밍으로 받은 텍스트와 중복 방지 — fullResponse가 비어있을 때만
      broadcastToChat(agentId, 'session:result-text', {
        id: streamingMsgId,
        agentId,
        text: resultText
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

export function cleanup(): void {
  for (const [, session] of activeSessions) {
    if (session.process) {
      session.process.kill()
    }
  }
  activeSessions.clear()
}
