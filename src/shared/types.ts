export interface AgentConfig {
  id: string
  name: string
  role: string
  avatar: {
    style: string
    seed: string
  }
  systemPrompt: string
  workingDirectory: string
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514' | 'claude-haiku-4-5-20251001'
  group?: string
  createdAt: number
  updatedAt: number
}

export type AgentStatus = 'idle' | 'working' | 'error'

export interface AgentState {
  config: AgentConfig
  status: AgentStatus
  lastMessage?: string
  sessionId?: string
  costTotal: number
}

export interface AgentGroup {
  name: string
  directory: string
  agentIds: string[]
}

export interface ChatMessage {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolUse?: ToolUseBlock[]
  costDelta?: number
}

export interface ToolUseBlock {
  name: string
  input: string
  output?: string
}

export interface SessionInfo {
  sessionId: string
  agentId: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// IPC channel types
export interface AgentApi {
  list(): Promise<AgentConfig[]>
  create(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig>
  update(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig>
  delete(id: string): Promise<void>
  getState(id: string): Promise<AgentState | null>
}

export interface SessionApi {
  send(agentId: string, message: string): Promise<void>
  abort(agentId: string): Promise<void>
  clear(agentId: string): Promise<void>
  getHistory(agentId: string): Promise<ChatMessage[]>
}

export interface WindowApi {
  openChat(agentId: string): Promise<void>
  getAgentId(): Promise<string | null>
  minimize(): Promise<void>
  close(): Promise<void>
  selectDirectory(): Promise<string | null>
}
