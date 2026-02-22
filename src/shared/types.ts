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

// ── 그룹 대화 ──

export type ConversationMode = 'auto-chain' | 'manual'
export type ConversationStatus = 'idle' | 'chaining' | 'paused' | 'waiting-agent'

export interface ConversationConfig {
  id: string
  name: string
  participantIds: string[]
  mode: ConversationMode
  maxRoundsPerChain: number
  createdAt: number
  updatedAt: number
}

export interface ConversationMessage {
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  agentId: string | null
  agentName: string | null
  content: string
  timestamp: number
  costDelta?: number
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
  openGroupChat(conversationId: string): Promise<void>
  openNewConversation(): Promise<void>
  getAgentId(): Promise<string | null>
  getConversationId(): Promise<string | null>
  minimize(): Promise<void>
  close(): Promise<void>
  selectDirectory(): Promise<string | null>
}

export interface ConversationApi {
  create(config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConversationConfig>
  list(): Promise<ConversationConfig[]>
  get(id: string): Promise<ConversationConfig | null>
  update(id: string, updates: Partial<ConversationConfig>): Promise<ConversationConfig | null>
  delete(id: string): Promise<void>
  send(conversationId: string, message: string): Promise<void>
  triggerAgent(conversationId: string, agentId: string): Promise<void>
  pause(conversationId: string): Promise<void>
  resume(conversationId: string): Promise<void>
  abort(conversationId: string): Promise<void>
  clear(conversationId: string): Promise<void>
  getHistory(conversationId: string): Promise<ConversationMessage[]>
  getState(conversationId: string): Promise<{ status: ConversationStatus; currentAgentId: string | null } | null>
  setMode(conversationId: string, mode: ConversationMode): Promise<void>
}
