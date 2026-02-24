import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as agentManager from '../services/agent-manager'
import * as sessionManager from '../services/session-manager'
import * as conversationManager from '../services/conversation-manager'
import * as settingsManager from '../services/settings-manager'
import * as activityLogger from '../services/activity-logger'
import * as dynamicAgentManager from '../services/dynamic-agent-manager'
import {
  checkClaudeCli,
  installClaudeCli,
  checkNodeInstalled,
  checkForCliUpdate
} from '../services/cli-builder'
import * as errorRecovery from '../services/error-recovery'
import { randomAvatar } from '../services/default-agents'
import { respondToPermission } from '../services/permission-server'
import * as taskManager from '../services/task-manager'
import {
  AgentConfig,
  ConversationConfig,
  ConversationMode,
  DockSize,
  GlobalSettings,
  TaskDelegation,
  RoleTemplate
} from '../../shared/types'
import { BUILTIN_ROLE_TEMPLATES } from '../../shared/constants'
import * as store from '../services/store'
import { v4 as uuid } from 'uuid'
import { statSync, readFileSync as fsReadFileSync } from 'fs'
import { basename } from 'path'
import * as mcpHealth from '../services/mcp-health'

// 윈도우 함수는 나중에 index.ts에서 주입
let windowFns: {
  createChatWindow: (agentId: string, agentName: string) => void
  createEditorWindow: (agentId?: string) => void
  closeEditorWindow: () => void
  createGroupChatWindow: (conversationId: string, name: string) => void
  createConversationCreatorWindow: () => void
  createDashboardWindow: () => void
  createCommandCenterWindow: () => void
  createSettingsWindow: () => void
  resizeDock: (count: number) => void
  isDockWindow: (win: BrowserWindow) => boolean
  forceQuit: () => void
  setDockExpanded: (expanded: boolean) => void
  setDockSize: (size: DockSize) => void
}

export function setWindowFunctions(fns: typeof windowFns): void {
  windowFns = fns
}

export function registerIpcHandlers(): void {
  // ── Agent CRUD ──

  ipcMain.handle('agent:list', () => {
    return agentManager.listAgents()
  })

  ipcMain.handle(
    'agent:create',
    (_e, config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      const agent = agentManager.createAgent(config)
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:created', agent))
      windowFns?.resizeDock(agentManager.listAgents().length)
      activityLogger.logActivity(
        'agent-created',
        agent.id,
        agent.name,
        `에이전트 ${agent.name} 생성됨`
      )
      return agent
    }
  )

  ipcMain.handle('agent:update', (_e, id: string, updates: Partial<AgentConfig>) => {
    const agent = agentManager.updateAgent(id, updates)
    if (agent) {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:updated', agent))
    }
    return agent
  })

  ipcMain.handle('agent:delete', (_e, id: string) => {
    const agent = store.getAgent(id)
    sessionManager.abortSession(id)
    agentManager.deleteAgent(id)
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:deleted', id))
    windowFns?.resizeDock(agentManager.listAgents().length)
    if (agent) {
      activityLogger.logActivity('agent-deleted', id, agent.name, `에이전트 ${agent.name} 삭제됨`)
    }
  })

  ipcMain.handle('agent:get-state', (_e, id: string) => {
    return agentManager.getAgentState(id)
  })

  ipcMain.handle('agent:get-all-states', () => {
    return agentManager.getAllStates()
  })

  // ── Agent 계층/조직도 ──

  ipcMain.handle('agent:get-org-chart', () => {
    return agentManager.getOrgChart()
  })

  ipcMain.handle('agent:get-process-info', (_e, id: string) => {
    return agentManager.getProcessInfo(id)
  })

  // ── Agent 복제/내보내기/가져오기 ──

  ipcMain.handle('agent:duplicate', (_e, id: string) => {
    const agent = agentManager.duplicateAgent(id)
    if (agent) {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:created', agent))
      windowFns?.resizeDock(agentManager.listAgents().length)
    }
    return agent
  })

  ipcMain.handle('agent:export', (_e, id: string) => {
    return agentManager.exportAgentConfig(id)
  })

  ipcMain.handle('agent:import', (_e, json: string) => {
    const agent = agentManager.importAgentConfig(json)
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:created', agent))
    windowFns?.resizeDock(agentManager.listAgents().length)
    return agent
  })

  // ── 임시 에이전트 ──

  ipcMain.handle(
    'agent:spawn-temporary',
    (
      _e,
      config: {
        requestedBy: string
        name: string
        role: string
        model: string
        systemPrompt: string
        ttlMinutes?: number
        [key: string]: unknown
      }
    ) => {
      const { requestedBy, ttlMinutes, ...rest } = config
      const agentConfig = {
        ...rest,
        avatar: (rest.avatar as { style: string; seed: string }) || randomAvatar(),
        workingDirectory:
          (rest.workingDirectory as string) || store.getSettings().defaultWorkingDirectory || '',
        expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60 * 1000 : undefined
      } as Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>
      const agent = dynamicAgentManager.spawnTemporaryAgent(requestedBy, agentConfig)
      if (agent) windowFns?.resizeDock(agentManager.listAgents().length)
      return agent
    }
  )

  ipcMain.handle('agent:remove-temporary', (_e, id: string) => {
    const removed = dynamicAgentManager.removeTemporaryAgent(id)
    if (removed) windowFns?.resizeDock(agentManager.listAgents().length)
    return removed
  })

  // ── Session ──

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

  ipcMain.handle('session:get-error-log', (_e, agentId: string) => {
    return sessionManager.getErrorLog(agentId)
  })

  // ── CLI 상태 ──

  ipcMain.handle('cli:check', () => {
    return checkClaudeCli()
  })

  ipcMain.handle('cli:install', async () => {
    return installClaudeCli()
  })

  ipcMain.handle('cli:check-node', () => {
    return checkNodeInstalled()
  })

  // ── Windows ──

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
    if (win)
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 50)
  })

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('window:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && !windowFns?.isDockWindow(win)) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 50)
    }
  })

  ipcMain.handle('window:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('window:open-dashboard', () => {
    windowFns?.createDashboardWindow()
  })

  ipcMain.handle('window:open-command-center', () => {
    windowFns?.createCommandCenterWindow()
  })

  ipcMain.handle('window:open-settings', () => {
    windowFns?.createSettingsWindow()
  })

  // ── Group Chat Windows ──

  ipcMain.handle('window:open-group-chat', (_e, conversationId: string) => {
    const config = conversationManager.getConversationConfig(conversationId)
    if (config) {
      windowFns?.createGroupChatWindow(conversationId, config.name)
    }
  })

  ipcMain.handle('window:open-new-conversation', () => {
    windowFns?.createConversationCreatorWindow()
  })

  // ── Conversation CRUD ──

  ipcMain.handle(
    'conversation:create',
    (_e, config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      const conv = conversationManager.createConversation(config)
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('conversation:created', conv))
      return conv
    }
  )

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
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('conversation:deleted', id))
  })

  // ── Conversation messaging ──

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

  // ── Settings ──

  ipcMain.handle('settings:get', () => {
    return settingsManager.getSettings()
  })

  ipcMain.handle('settings:update', (_e, updates: Partial<GlobalSettings>) => {
    return settingsManager.updateSettings(updates)
  })

  // ── Activity ──

  ipcMain.handle('activity:get-recent', (_e, limit?: number) => {
    return activityLogger.getRecentActivities(limit)
  })

  ipcMain.handle('activity:clear', () => {
    activityLogger.clearActivities()
  })

  // ── Tasks ──

  ipcMain.handle('task:create', (_e, task: Omit<TaskDelegation, 'id' | 'createdAt'>) => {
    const newTask: TaskDelegation = {
      ...task,
      status: task.status || 'pending',
      id: uuid(),
      createdAt: Date.now()
    }
    store.addTask(newTask)
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:created', newTask))
    // 활동 로그
    const fromAgent = store.getAgent(task.fromAgentId)
    const toAgent = store.getAgent(task.toAgentId)
    activityLogger.logActivity(
      'task-delegated',
      task.fromAgentId,
      fromAgent?.name ?? 'Unknown',
      `${fromAgent?.name ?? 'Unknown'}이 ${toAgent?.name ?? 'Unknown'}에게 작업 위임: ${task.title}`
    )
    return newTask
  })

  ipcMain.handle('task:list', () => {
    return store.getTasks()
  })

  ipcMain.handle('task:get-for-agent', (_e, agentId: string) => {
    return store.getTasksForAgent(agentId)
  })

  ipcMain.handle('task:update', (_e, id: string, updates: Partial<TaskDelegation>) => {
    const task = store.updateTask(id, updates)
    if (task) {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:updated', task))
    }
    return task
  })

  ipcMain.handle('task:delete', (_e, id: string) => {
    const deleted = store.deleteTask(id)
    if (deleted) {
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:deleted', id))
    }
    return deleted
  })

  // ── Role Templates ──

  ipcMain.handle('settings:get-role-templates', () => {
    const settings = store.getSettings()
    const customTemplates = settings.roleTemplates ?? []
    return [...BUILTIN_ROLE_TEMPLATES, ...customTemplates]
  })

  ipcMain.handle('settings:save-role-template', (_e, template: RoleTemplate) => {
    const settings = store.getSettings()
    const templates = settings.roleTemplates ?? []
    const idx = templates.findIndex((t) => t.id === template.id)
    if (idx >= 0) {
      templates[idx] = template
    } else {
      templates.push({ ...template, isBuiltin: false })
    }
    store.updateSettings({ roleTemplates: templates })
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('settings:changed', store.getSettings())
    )
    return template
  })

  ipcMain.handle('settings:delete-role-template', (_e, id: string) => {
    const settings = store.getSettings()
    const templates = (settings.roleTemplates ?? []).filter((t) => t.id !== id)
    store.updateSettings({ roleTemplates: templates })
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('settings:changed', store.getSettings())
    )
    return true
  })

  // ── Manual Task ──

  ipcMain.handle(
    'task:create-manual',
    (
      _e,
      task: {
        title: string
        description: string
        toAgentId: string
        priority?: string
        dueDate?: number
        tags?: string[]
      }
    ) => {
      return taskManager.createManualTask(task)
    }
  )

  // ── Permission ──

  ipcMain.handle('permission:respond', (_e, requestId: string, allowed: boolean) => {
    respondToPermission(requestId, allowed)
  })

  // ── Delegation ──

  ipcMain.handle('delegation:get-active', () => {
    const tasks = store.getTasks()
    return tasks.filter((t) => t.status === 'in-progress')
  })

  // ── MCP ──

  ipcMain.handle('mcp:get-global', () => {
    return settingsManager.getSettings().globalMcpServers
  })

  ipcMain.handle('mcp:set-global', (_e, servers) => {
    settingsManager.updateSettings({ globalMcpServers: servers })
  })

  ipcMain.handle('mcp:get-agent', (_e, agentId: string) => {
    const agent = store.getAgent(agentId)
    return agent?.mcpConfig ?? []
  })

  ipcMain.handle('mcp:set-agent', (_e, agentId: string, servers) => {
    agentManager.updateAgent(agentId, { mcpConfig: servers })
  })

  ipcMain.handle('mcp:get-health', () => {
    return mcpHealth.getAllHealthResults()
  })

  ipcMain.handle('mcp:check-now', async () => {
    await mcpHealth.checkAllMcpServers()
    return mcpHealth.getAllHealthResults()
  })

  // ── App ──

  ipcMain.handle('app:quit', () => {
    windowFns?.forceQuit()
  })

  ipcMain.handle('app:set-dock-expanded', (_e, expanded: boolean) => {
    windowFns?.setDockExpanded(expanded)
  })

  ipcMain.handle('app:set-dock-size', (_e, size: DockSize) => {
    windowFns?.setDockSize(size)
    // 설정에 저장
    store.updateSettings({ dockSize: size } as Partial<GlobalSettings>)
  })

  // ── 파일 선택 / 읽기 ──

  ipcMain.handle('window:select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Text',
          extensions: [
            'txt',
            'md',
            'ts',
            'tsx',
            'js',
            'jsx',
            'json',
            'py',
            'css',
            'html',
            'yml',
            'yaml',
            'toml',
            'cfg',
            'ini',
            'sh',
            'bat',
            'rs',
            'go',
            'java',
            'c',
            'cpp',
            'h'
          ]
        },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('file:read-content', (_e, filePath: string) => {
    try {
      const stat = statSync(filePath)
      const MAX_SIZE = 100 * 1024 // 100KB

      if (stat.size > MAX_SIZE) {
        return {
          success: false,
          error: `파일이 너무 큽니다 (${Math.round(stat.size / 1024)}KB > 100KB 제한)`,
          content: null,
          fileName: basename(filePath),
          fileSize: stat.size
        }
      }

      const content = fsReadFileSync(filePath, 'utf-8')
      return {
        success: true,
        error: null,
        content,
        fileName: basename(filePath),
        fileSize: stat.size
      }
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        content: null,
        fileName: null,
        fileSize: 0
      }
    }
  })

  // ── Error Recovery ──

  ipcMain.handle('error-recovery:get-active', () => {
    return errorRecovery.getActiveRecoveries()
  })

  ipcMain.handle('error-recovery:is-recovering', (_e, agentId: string) => {
    return errorRecovery.isRecovering(agentId)
  })

  // ── CLI 업데이트 체크 ──

  ipcMain.handle('cli:check-update', () => {
    return checkForCliUpdate()
  })
}
