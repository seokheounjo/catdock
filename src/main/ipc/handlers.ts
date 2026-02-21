import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as agentManager from '../services/agent-manager'
import * as sessionManager from '../services/session-manager'
import { AgentConfig } from '../../shared/types'

// 윈도우 함수는 나중에 index.ts에서 주입
let windowFns: {
  createChatWindow: (agentId: string, agentName: string) => void
  createEditorWindow: (agentId?: string) => void
  closeEditorWindow: () => void
  resizeDock: (count: number) => void
}

export function setWindowFunctions(fns: typeof windowFns): void {
  windowFns = fns
}

export function registerIpcHandlers(): void {
  // Agent CRUD
  ipcMain.handle('agent:list', () => {
    return agentManager.listAgents()
  })

  ipcMain.handle('agent:create', (_e, config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    const agent = agentManager.createAgent(config)
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('agent:created', agent)
    )
    windowFns?.resizeDock(agentManager.listAgents().length)
    return agent
  })

  ipcMain.handle('agent:update', (_e, id: string, updates: Partial<AgentConfig>) => {
    const agent = agentManager.updateAgent(id, updates)
    if (agent) {
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('agent:updated', agent)
      )
    }
    return agent
  })

  ipcMain.handle('agent:delete', (_e, id: string) => {
    sessionManager.abortSession(id)
    agentManager.deleteAgent(id)
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('agent:deleted', id)
    )
    windowFns?.resizeDock(agentManager.listAgents().length)
  })

  ipcMain.handle('agent:get-state', (_e, id: string) => {
    return agentManager.getAgentState(id)
  })

  ipcMain.handle('agent:get-all-states', () => {
    return agentManager.getAllStates()
  })

  // Session
  ipcMain.handle('session:send', (_e, agentId: string, message: string) => {
    return sessionManager.sendMessage(agentId, message)
  })

  ipcMain.handle('session:abort', (_e, agentId: string) => {
    sessionManager.abortSession(agentId)
  })

  ipcMain.handle('session:clear', (_e, agentId: string) => {
    sessionManager.clearSession(agentId)
  })

  ipcMain.handle('session:get-history', (_e, agentId: string) => {
    return sessionManager.getHistory(agentId)
  })

  // Windows
  ipcMain.handle('window:open-chat', (_e, agentId: string) => {
    const config = agentManager.listAgents().find((a) => a.id === agentId)
    if (config) {
      windowFns?.createChatWindow(agentId, config.name)
    }
  })

  ipcMain.handle('window:open-editor', (_e, agentId?: string) => {
    windowFns?.createEditorWindow(agentId)
  })

  ipcMain.handle('window:close-editor', (e) => {
    // 에디터 창 자체를 닫기
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle('window:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
