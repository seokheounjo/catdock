import { ElectronAPI } from '@electron-toolkit/preload'
import { AgentConfig, AgentState, ChatMessage } from '../shared/types'

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
  openEditor(agentId?: string): Promise<void>
  closeEditor(): Promise<void>
  minimize(): Promise<void>
  close(): Promise<void>
  selectDirectory(): Promise<string | null>
}

interface Api {
  agent: AgentApi
  session: SessionApi
  window: WindowApi
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
