import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as agentManager from '../services/agent-manager'
import * as sessionManager from '../services/session-manager'
import * as conversationManager from '../services/conversation-manager'
import { AgentConfig, ConversationConfig, ConversationMode } from '../../shared/types'

// 윈도우 함수는 나중에 index.ts에서 주입
let windowFns: {
  createChatWindow: (agentId: string, agentName: string) => void
  createEditorWindow: (agentId?: string) => void
  closeEditorWindow: () => void
  createGroupChatWindow: (conversationId: string, name: string) => void
  createConversationCreatorWindow: () => void
  resizeDock: (count: number) => void
  isDockWindow: (win: BrowserWindow) => boolean
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
    const win = BrowserWindow.fromWebContents(e.sender)
    // ★ destroy()로 renderer close 과정 우회 → 크래시 방지
    if (win) setTimeout(() => { if (!win.isDestroyed()) win.destroy() }, 50)
  })

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    // ★ 독 윈도우는 절대 닫지 않음
    // ★ destroy()로 renderer close 과정 우회 → 크래시 방지
    if (win && !windowFns?.isDockWindow(win)) {
      setTimeout(() => { if (!win.isDestroyed()) win.destroy() }, 50)
    }
  })

  ipcMain.handle('window:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Group Chat Windows
  ipcMain.handle('window:open-group-chat', (_e, conversationId: string) => {
    const config = conversationManager.getConversationConfig(conversationId)
    if (config) {
      windowFns?.createGroupChatWindow(conversationId, config.name)
    }
  })

  ipcMain.handle('window:open-new-conversation', () => {
    windowFns?.createConversationCreatorWindow()
  })

  // Conversation CRUD
  ipcMain.handle('conversation:create', (_e, config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    const conv = conversationManager.createConversation(config)
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('conversation:created', conv)
    )
    return conv
  })

  ipcMain.handle('conversation:list', () => {
    return conversationManager.listConversations()
  })

  ipcMain.handle('conversation:get', (_e, id: string) => {
    return conversationManager.getConversationConfig(id)
  })

  ipcMain.handle('conversation:update', (_e, id: string, updates: Partial<ConversationConfig>) => {
    return conversationManager.updateConversation(id, updates)
  })

  ipcMain.handle('conversation:delete', (_e, id: string) => {
    conversationManager.deleteConversation(id)
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('conversation:deleted', id)
    )
  })

  // Conversation messaging
  ipcMain.handle('conversation:send', (_e, conversationId: string, message: string) => {
    return conversationManager.sendMessage(conversationId, message)
  })

  ipcMain.handle('conversation:trigger-agent', (_e, conversationId: string, agentId: string) => {
    return conversationManager.triggerAgent(conversationId, agentId)
  })

  ipcMain.handle('conversation:pause', (_e, conversationId: string) => {
    conversationManager.pauseConversation(conversationId)
  })

  ipcMain.handle('conversation:resume', (_e, conversationId: string) => {
    return conversationManager.resumeConversation(conversationId)
  })

  ipcMain.handle('conversation:abort', (_e, conversationId: string) => {
    conversationManager.abortConversation(conversationId)
  })

  ipcMain.handle('conversation:clear', (_e, conversationId: string) => {
    conversationManager.clearConversation(conversationId)
  })

  ipcMain.handle('conversation:get-history', (_e, conversationId: string) => {
    return conversationManager.getHistory(conversationId)
  })

  ipcMain.handle('conversation:get-state', (_e, conversationId: string) => {
    return conversationManager.getState(conversationId)
  })

  ipcMain.handle('conversation:set-mode', (_e, conversationId: string, mode: ConversationMode) => {
    conversationManager.setMode(conversationId, mode)
  })
}
