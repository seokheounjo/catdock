import { ElectronAPI } from '@electron-toolkit/preload'
import { AgentConfig, AgentState, ChatMessage, ConversationConfig, ConversationMessage, ConversationMode, ConversationStatus } from '../shared/types'

interface AgentApi {
  list(): Promise<AgentConfig[]>
  create(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig>
  update(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig>
  delete(id: string): Promise<void>
  getState(id: string): Promise<AgentState | null>
  getAllStates(): Promise<AgentState[]>
}

interface SessionApi {
  send(agentId: string, message: string): Promise<void>
  abort(agentId: string): Promise<void>
  clear(agentId: string): Promise<void>
  getHistory(agentId: string): Promise<ChatMessage[]>
}

interface WindowApi {
  openChat(agentId: string): Promise<void>
  openGroupChat(conversationId: string): Promise<void>
  openNewConversation(): Promise<void>
  openEditor(agentId?: string): Promise<void>
  closeEditor(): Promise<void>
  minimize(): Promise<void>
  close(): Promise<void>
  selectDirectory(): Promise<string | null>
}

interface ConversationApi {
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

interface Api {
  agent: AgentApi
  session: SessionApi
  conversation: ConversationApi
  window: WindowApi
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
