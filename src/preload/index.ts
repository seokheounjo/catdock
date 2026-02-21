import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AgentConfig } from '../shared/types'

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

  // Windows
  window: {
    openChat: (agentId: string): Promise<void> =>
      ipcRenderer.invoke('window:open-chat', agentId),
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
