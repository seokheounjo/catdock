import { ElectronAPI } from '@electron-toolkit/preload'
import {
  AgentConfig,
  AgentState,
  AgentProcessInfo,
  ChatMessage,
  CliProvider,
  CliCheckResult,
  ConversationConfig,
  ConversationMessage,
  ConversationMode,
  ConversationStatus,
  DockSize,
  GlobalSettings,
  ActivityEvent,
  TaskDelegation,
  McpServerConfig,
  McpHealthResult,
  McpDiscoveryResult,
  DiscoveredMcpServer,
  DiscoveredLocalModel,
  LlmDiscoveryResult,
  LocalLlmSource,
  CliProfile,
  RoleTemplate,
  ErrorRecoveryEvent
} from '../shared/types'
import type { ModelTier } from '../shared/constants'

interface AgentApi {
  list(): Promise<AgentConfig[]>
  create(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig>
  update(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig>
  delete(id: string): Promise<void>
  getState(id: string): Promise<AgentState | null>
  getAllStates(): Promise<AgentState[]>
  getOrgChart(): Promise<{
    leaders: AgentConfig[]
    members: AgentConfig[]
    temporary: AgentConfig[]
  }>
  getProcessInfo(id: string): Promise<AgentProcessInfo | null>
  spawnTemporary(config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentConfig>
  removeTemporary(id: string): Promise<void>
  duplicate(id: string): Promise<AgentConfig>
  exportConfig(id: string): Promise<string>
  importConfig(json: string): Promise<AgentConfig>
}

interface SessionApi {
  send(agentId: string, message: string): Promise<void>
  abort(agentId: string): Promise<void>
  clear(agentId: string): Promise<void>
  getHistory(agentId: string): Promise<ChatMessage[]>
  getErrorLog(agentId: string): Promise<string[]>
}

interface WindowApi {
  openChat(agentId: string): Promise<void>
  openGroupChat(conversationId: string): Promise<void>
  openNewConversation(): Promise<void>
  openEditor(agentId?: string): Promise<void>
  closeEditor(): Promise<void>
  openDashboard(): Promise<void>
  openCommandCenter(): Promise<void>
  openSettings(): Promise<void>
  minimize(): Promise<void>
  close(): Promise<void>
  selectDirectory(): Promise<string | null>
  selectFile(): Promise<string | null>
}

interface FileApi {
  readContent(filePath: string): Promise<{
    success: boolean
    error: string | null
    content: string | null
    fileName: string | null
    fileSize: number
  }>
}

interface ConversationApi {
  create(
    config: Omit<ConversationConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ConversationConfig>
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
  getState(
    conversationId: string
  ): Promise<{ status: ConversationStatus; currentAgentId: string | null } | null>
  setMode(conversationId: string, mode: ConversationMode): Promise<void>
}

interface SettingsApi {
  get(): Promise<GlobalSettings>
  update(updates: Partial<GlobalSettings>): Promise<GlobalSettings>
  getRoleTemplates(): Promise<RoleTemplate[]>
  saveRoleTemplate(template: RoleTemplate): Promise<RoleTemplate>
  deleteRoleTemplate(id: string): Promise<boolean>
}

interface ActivityApi {
  getRecent(limit?: number): Promise<ActivityEvent[]>
  clear(): Promise<void>
}

interface TaskApi {
  create(task: Omit<TaskDelegation, 'id' | 'createdAt'>): Promise<TaskDelegation>
  createManual(task: {
    title: string
    description: string
    toAgentId: string
    priority?: string
    dueDate?: number
    tags?: string[]
  }): Promise<TaskDelegation>
  list(): Promise<TaskDelegation[]>
  getForAgent(agentId: string): Promise<TaskDelegation[]>
  update(id: string, updates: Partial<TaskDelegation>): Promise<TaskDelegation | null>
  delete(id: string): Promise<boolean>
}

interface PermissionApi {
  respond(requestId: string, allowed: boolean): Promise<void>
}

interface DelegationApi {
  getActive(): Promise<TaskDelegation[]>
}

interface ErrorRecoveryApi {
  getActive(): Promise<ErrorRecoveryEvent[]>
  isRecovering(agentId: string): Promise<boolean>
}

interface CliApi {
  check(): Promise<{
    installed: boolean
    version: string | null
    path: string | null
    error: string | null
  }>
  install(): Promise<{
    success: boolean
    message: string
  }>
  checkNode(): Promise<{
    installed: boolean
    version: string | null
  }>
  checkUpdate(): Promise<{
    currentVersion: string | null
    latestVersion: string | null
    updateAvailable: boolean
    error: string | null
  }>
  checkProvider(provider: CliProvider): Promise<CliCheckResult>
  checkAllProviders(): Promise<Record<CliProvider, CliCheckResult>>
}

interface McpApi {
  getGlobal(): Promise<McpServerConfig[]>
  setGlobal(servers: McpServerConfig[]): Promise<void>
  getAgent(agentId: string): Promise<McpServerConfig[]>
  setAgent(agentId: string, servers: McpServerConfig[]): Promise<void>
  getHealth(): Promise<Record<string, McpHealthResult[]>>
  checkNow(): Promise<Record<string, McpHealthResult[]>>
  discoverDirectory(dir: string): Promise<DiscoveredMcpServer[]>
  discoverAll(): Promise<McpDiscoveryResult>
  getDiscovered(): Promise<DiscoveredMcpServer[]>
  importDiscovered(name: string, target: string): Promise<boolean>
}

interface LlmApi {
  discoverAll(): Promise<LlmDiscoveryResult>
  getDiscovered(): Promise<DiscoveredLocalModel[]>
  checkSource(source: LocalLlmSource): Promise<{ available: boolean; version?: string; error?: string }>
}

interface ProfileApi {
  list(): Promise<CliProfile[]>
  listForProvider(provider: CliProvider): Promise<CliProfile[]>
  create(profile: Omit<CliProfile, 'id' | 'createdAt'>): Promise<CliProfile>
  update(id: string, updates: Partial<CliProfile>): Promise<CliProfile | null>
  delete(id: string): Promise<boolean>
  getUsage(): Promise<Record<string, number>>
}

interface ModelApi {
  getAvailable(provider: CliProvider): Promise<{ value: string; label: string; tier: ModelTier }[]>
}

interface AppApi {
  quit(): Promise<void>
  setDockExpanded(expanded: boolean): Promise<void>
  setDockSize(size: DockSize): Promise<void>
  setDockVisibleCount(count: number): Promise<void>
}

interface Api {
  agent: AgentApi
  session: SessionApi
  conversation: ConversationApi
  window: WindowApi
  file: FileApi
  settings: SettingsApi
  activity: ActivityApi
  task: TaskApi
  permission: PermissionApi
  delegation: DelegationApi
  errorRecovery: ErrorRecoveryApi
  cli: CliApi
  mcp: McpApi
  llm: LlmApi
  profile: ProfileApi
  model: ModelApi
  app: AppApi
  on(channel: string, callback: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
