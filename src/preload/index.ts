import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AgentConfig, ConversationConfig, ConversationMode } from '../shared/types'

const api = {
  // Agent CRUD
  agent: {
    list: (): Promise<AgentConfig[]> => ipcRenderer.invoke('agent:list'),
    create: (config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig> =>
      ipcRenderer.invoke('agent:create', config),
    update: (id: string, updates: Partial<AgentConfig>): Promise<AgentConfig> =>
      ipcRenderer.invoke('agent:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('agent:delete', id),
    getState: (id: string) => ipcRenderer.invoke('agent:get-state', id),
    getAllStates: () => ipcRenderer.invoke('agent:get-all-states')
  },

  // Session
  session: {
    send: (agentId: string, message: string): Promise<void> =>
      ipcRenderer.invoke('session:send', agentId, message),
    abort: (agentId: string): Promise<void> => ipcRenderer.invoke('session:abort', agentId),
    clear: (agentId: string): Promise<void> => ipcRenderer.invoke('session:clear', agentId),
    getHistory: (agentId: string) => ipcRenderer.invoke('session:get-history', agentId)
  },

  // Conversation (그룹 채팅)
  conversation: {
    create: (config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConversationConfig> =>
      ipcRenderer.invoke('conversation:create', config),
    list: (): Promise<ConversationConfig[]> => ipcRenderer.invoke('conversation:list'),
    get: (id: string) => ipcRenderer.invoke('conversation:get', id),
    update: (id: string, updates: Partial<ConversationConfig>) =>
      ipcRenderer.invoke('conversation:update', id, updates),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('conversation:delete', id),
    send: (conversationId: string, message: string): Promise<void> =>
      ipcRenderer.invoke('conversation:send', conversationId, message),
    triggerAgent: (conversationId: string, agentId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:trigger-agent', conversationId, agentId),
    pause: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:pause', conversationId),
    resume: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:resume', conversationId),
    abort: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:abort', conversationId),
    clear: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:clear', conversationId),
    getHistory: (conversationId: string) =>
      ipcRenderer.invoke('conversation:get-history', conversationId),
    getState: (conversationId: string) =>
      ipcRenderer.invoke('conversation:get-state', conversationId),
    setMode: (conversationId: string, mode: ConversationMode): Promise<void> =>
      ipcRenderer.invoke('conversation:set-mode', conversationId, mode)
  },

  // Windows
  window: {
    openChat: (agentId: string): Promise<void> =>
      ipcRenderer.invoke('window:open-chat', agentId),
    openGroupChat: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('window:open-group-chat', conversationId),
    openNewConversation: (): Promise<void> =>
      ipcRenderer.invoke('window:open-new-conversation'),
    openEditor: (agentId?: string): Promise<void> =>
      ipcRenderer.invoke('window:open-editor', agentId),
    closeEditor: (): Promise<void> => ipcRenderer.invoke('window:close-editor'),
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('window:select-directory')
  },

  // Events from main
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
      callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
