import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  AgentConfig,
  CliProvider,
  CliCheckResult,
  ConversationConfig,
  ConversationMode,
  DockSize,
  GlobalSettings,
  TaskDelegation,
  McpServerConfig,
  McpHealthResult,
  McpDiscoveryResult,
  DiscoveredMcpServer,
  DiscoveredLocalModel,
  LlmDiscoveryResult,
  LocalLlmSource,
  CliProfile,
  RoleTemplate
} from '../shared/types'
import type { ModelTier } from '../shared/constants'

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
    getAllStates: () => ipcRenderer.invoke('agent:get-all-states'),
    getOrgChart: () => ipcRenderer.invoke('agent:get-org-chart'),
    getProcessInfo: (id: string) => ipcRenderer.invoke('agent:get-process-info', id),
    spawnTemporary: (
      config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<AgentConfig> => ipcRenderer.invoke('agent:spawn-temporary', config),
    removeTemporary: (id: string): Promise<void> =>
      ipcRenderer.invoke('agent:remove-temporary', id),
    duplicate: (id: string): Promise<AgentConfig> => ipcRenderer.invoke('agent:duplicate', id),
    exportConfig: (id: string): Promise<string> => ipcRenderer.invoke('agent:export', id),
    importConfig: (json: string): Promise<AgentConfig> => ipcRenderer.invoke('agent:import', json)
  },

  // Session
  session: {
    send: (agentId: string, message: string): Promise<void> =>
      ipcRenderer.invoke('session:send', agentId, message),
    abort: (agentId: string): Promise<void> => ipcRenderer.invoke('session:abort', agentId),
    clear: (agentId: string): Promise<void> => ipcRenderer.invoke('session:clear', agentId),
    getHistory: (agentId: string) => ipcRenderer.invoke('session:get-history', agentId),
    getErrorLog: (agentId: string): Promise<string[]> =>
      ipcRenderer.invoke('session:get-error-log', agentId)
  },

  // Conversation (그룹 채팅)
  conversation: {
    create: (
      config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<ConversationConfig> => ipcRenderer.invoke('conversation:create', config),
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
    openChat: (agentId: string): Promise<void> => ipcRenderer.invoke('window:open-chat', agentId),
    openGroupChat: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('window:open-group-chat', conversationId),
    openNewConversation: (): Promise<void> => ipcRenderer.invoke('window:open-new-conversation'),
    openEditor: (agentId?: string): Promise<void> =>
      ipcRenderer.invoke('window:open-editor', agentId),
    closeEditor: (): Promise<void> => ipcRenderer.invoke('window:close-editor'),
    openDashboard: (): Promise<void> => ipcRenderer.invoke('window:open-dashboard'),
    openCommandCenter: (): Promise<void> => ipcRenderer.invoke('window:open-command-center'),
    openSettings: (): Promise<void> => ipcRenderer.invoke('window:open-settings'),
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('window:select-directory'),
    selectFile: (): Promise<string | null> => ipcRenderer.invoke('window:select-file')
  },

  // File
  file: {
    readContent: (
      filePath: string
    ): Promise<{
      success: boolean
      error: string | null
      content: string | null
      fileName: string | null
      fileSize: number
    }> => ipcRenderer.invoke('file:read-content', filePath)
  },

  // Settings
  settings: {
    get: (): Promise<GlobalSettings> => ipcRenderer.invoke('settings:get'),
    update: (updates: Partial<GlobalSettings>): Promise<GlobalSettings> =>
      ipcRenderer.invoke('settings:update', updates),
    getRoleTemplates: (): Promise<RoleTemplate[]> =>
      ipcRenderer.invoke('settings:get-role-templates'),
    saveRoleTemplate: (template: RoleTemplate): Promise<RoleTemplate> =>
      ipcRenderer.invoke('settings:save-role-template', template),
    deleteRoleTemplate: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('settings:delete-role-template', id)
  },

  // Activity
  activity: {
    getRecent: (limit?: number) => ipcRenderer.invoke('activity:get-recent', limit),
    clear: (): Promise<void> => ipcRenderer.invoke('activity:clear')
  },

  // Tasks
  task: {
    create: (task: Omit<TaskDelegation, 'id' | 'createdAt'>) =>
      ipcRenderer.invoke('task:create', task),
    createManual: (task: {
      title: string
      description: string
      toAgentId: string
      priority?: string
      dueDate?: number
      tags?: string[]
    }): Promise<TaskDelegation> => ipcRenderer.invoke('task:create-manual', task),
    list: () => ipcRenderer.invoke('task:list'),
    getForAgent: (agentId: string) => ipcRenderer.invoke('task:get-for-agent', agentId),
    update: (id: string, updates: Partial<TaskDelegation>) =>
      ipcRenderer.invoke('task:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('task:delete', id)
  },

  // Permission
  permission: {
    respond: (requestId: string, allowed: boolean): Promise<void> =>
      ipcRenderer.invoke('permission:respond', requestId, allowed)
  },

  // Approval Gate
  approval: {
    respond: (requestId: string, approved: boolean): Promise<void> =>
      ipcRenderer.invoke('approval:respond', requestId, approved),
    getPending: () =>
      ipcRenderer.invoke('approval:get-pending') as Promise<
        import('../shared/types').ApprovalRequest[]
      >
  },

  // Agent Cost
  cost: {
    getForAgent: (agentId: string): Promise<{ totalUsd: number; monthlyUsd: number }> =>
      ipcRenderer.invoke('agent:get-cost', agentId),
    getAll: (): Promise<Record<string, { totalUsd: number; monthlyUsd: number }>> =>
      ipcRenderer.invoke('agent:get-all-costs')
  },

  // Delegation
  delegation: {
    getActive: () =>
      ipcRenderer.invoke('delegation:get-active') as Promise<
        import('../shared/types').TaskDelegation[]
      >
  },

  // Error Recovery
  errorRecovery: {
    getActive: () =>
      ipcRenderer.invoke('error-recovery:get-active') as Promise<
        import('../shared/types').ErrorRecoveryEvent[]
      >,
    isRecovering: (agentId: string) =>
      ipcRenderer.invoke('error-recovery:is-recovering', agentId) as Promise<boolean>
  },

  // CLI
  cli: {
    check: () =>
      ipcRenderer.invoke('cli:check') as Promise<{
        installed: boolean
        version: string | null
        path: string | null
        error: string | null
      }>,
    install: () =>
      ipcRenderer.invoke('cli:install') as Promise<{
        success: boolean
        message: string
      }>,
    checkNode: () =>
      ipcRenderer.invoke('cli:check-node') as Promise<{
        installed: boolean
        version: string | null
      }>,
    checkUpdate: () =>
      ipcRenderer.invoke('cli:check-update') as Promise<{
        currentVersion: string | null
        latestVersion: string | null
        updateAvailable: boolean
        error: string | null
      }>,
    checkProvider: (provider: CliProvider) =>
      ipcRenderer.invoke('cli:check-provider', provider) as Promise<CliCheckResult>,
    checkAllProviders: () =>
      ipcRenderer.invoke('cli:check-all-providers') as Promise<Record<CliProvider, CliCheckResult>>
  },

  // MCP
  mcp: {
    getGlobal: (): Promise<McpServerConfig[]> => ipcRenderer.invoke('mcp:get-global'),
    setGlobal: (servers: McpServerConfig[]): Promise<void> =>
      ipcRenderer.invoke('mcp:set-global', servers),
    getAgent: (agentId: string): Promise<McpServerConfig[]> =>
      ipcRenderer.invoke('mcp:get-agent', agentId),
    setAgent: (agentId: string, servers: McpServerConfig[]): Promise<void> =>
      ipcRenderer.invoke('mcp:set-agent', agentId, servers),
    getHealth: (): Promise<Record<string, McpHealthResult[]>> =>
      ipcRenderer.invoke('mcp:get-health'),
    checkNow: (): Promise<Record<string, McpHealthResult[]>> => ipcRenderer.invoke('mcp:check-now'),
    discoverDirectory: (dir: string): Promise<DiscoveredMcpServer[]> =>
      ipcRenderer.invoke('mcp:discover-directory', dir),
    discoverAll: (): Promise<McpDiscoveryResult> => ipcRenderer.invoke('mcp:discover-all'),
    getDiscovered: (): Promise<DiscoveredMcpServer[]> => ipcRenderer.invoke('mcp:get-discovered'),
    importDiscovered: (name: string, target: string): Promise<boolean> =>
      ipcRenderer.invoke('mcp:import-discovered', name, target)
  },

  // LLM Discovery
  llm: {
    discoverAll: (): Promise<LlmDiscoveryResult> => ipcRenderer.invoke('llm:discover-all'),
    getDiscovered: (): Promise<DiscoveredLocalModel[]> => ipcRenderer.invoke('llm:get-discovered'),
    checkSource: (
      source: LocalLlmSource
    ): Promise<{ available: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('llm:check-source', source)
  },

  // CLI Profiles
  profile: {
    list: (): Promise<CliProfile[]> => ipcRenderer.invoke('profile:list'),
    listForProvider: (provider: CliProvider): Promise<CliProfile[]> =>
      ipcRenderer.invoke('profile:list-for-provider', provider),
    create: (profile: Omit<CliProfile, 'id' | 'createdAt'>): Promise<CliProfile> =>
      ipcRenderer.invoke('profile:create', profile),
    update: (id: string, updates: Partial<CliProfile>): Promise<CliProfile | null> =>
      ipcRenderer.invoke('profile:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('profile:delete', id),
    getUsage: (): Promise<Record<string, number>> => ipcRenderer.invoke('profile:get-usage')
  },

  // Model (통합 모델 목록)
  model: {
    getAvailable: (
      provider: CliProvider
    ): Promise<{ value: string; label: string; tier: ModelTier }[]> =>
      ipcRenderer.invoke('model:get-available', provider)
  },

  // Shell (ACTION 블록용)
  shell: {
    openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:open-external', url),
    openPath: (filePath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:open-path', filePath),
    runCommand: (
      command: string,
      cwd?: string
    ): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> =>
      ipcRenderer.invoke('shell:run-command', command, cwd)
  },

  // App
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    setDockExpanded: (expanded: boolean): Promise<void> =>
      ipcRenderer.invoke('app:set-dock-expanded', expanded),
    setDockSize: (size: DockSize): Promise<void> => ipcRenderer.invoke('app:set-dock-size', size),
    setDockVisibleCount: (count: number): Promise<void> =>
      ipcRenderer.invoke('dock:set-visible-count', count),
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
  // @ts-ignore -- contextBridge 미사용 시 window 직접 할당 필요
  window.electron = electronAPI
  // @ts-ignore -- contextBridge 미사용 시 window 직접 할당 필요
  window.api = api
}
