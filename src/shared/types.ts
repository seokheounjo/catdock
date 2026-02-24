// ── 에이전트 계층 ──

export type AgentRole = 'director' | 'leader' | 'member' | 'temporary'

export interface AgentHierarchy {
  role: AgentRole
  reportsTo?: string
  subordinates?: string[]
  leaderTeamName?: string
}

// ── 퍼미션 ──

export type PermissionMode = 'default' | 'allowAll' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface PermissionRequest {
  id: string
  agentId: string
  agentName: string
  toolName: string
  toolInput: Record<string, unknown>
  timestamp: number
}

// ── MCP 서버 ──

export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
}

// ── 프로세스 상태 ──

export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'terminating' | 'crashed'

export interface AgentProcessInfo {
  processStatus: ProcessStatus
  modelInUse: string
  pid?: number
  startedAt?: number
  lastError?: string
}

// ── 에이전트 설정 ──

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
  model: string
  group?: string
  createdAt: number
  updatedAt: number
  hierarchy?: AgentHierarchy
  permissionMode?: PermissionMode
  maxTurns?: number
  mcpConfig?: McpServerConfig[]
  teamMcpConfig?: McpServerConfig[] // 리더가 설정, 팀 전체에 적용
  cliFlags?: {
    verbose?: boolean
    debug?: boolean
    worktree?: boolean
    jsonSchema?: string
    continue?: boolean
    additionalArgs?: string[]
  }
  isTemporary?: boolean
  createdBy?: string
  expiresAt?: number
}

export type AgentStatus = 'idle' | 'working' | 'error'

export interface AgentState {
  config: AgentConfig
  status: AgentStatus
  lastMessage?: string
  sessionId?: string
  costTotal: number
  processInfo?: AgentProcessInfo
  currentTask?: string
}

export interface AgentGroup {
  name: string
  directory: string
  agentIds: string[]
}

// ── 채팅 ──

export interface ChatMessage {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolUse?: ToolUseBlock[]
  costDelta?: number
  isAutoReport?: boolean
  reportOriginAgentId?: string
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

// ── 활동 피드 ──

export type ActivityType =
  | 'message'
  | 'tool-use'
  | 'error'
  | 'status-change'
  | 'agent-created'
  | 'agent-deleted'
  | 'task-delegated'
  | 'upward-report'

export interface ActivityEvent {
  id: string
  type: ActivityType
  agentId: string
  agentName: string
  description: string
  timestamp: number
  metadata?: Record<string, unknown>
}

// ── 작업 위임 ──

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface TaskDelegation {
  id: string
  title: string
  description: string
  fromAgentId: string
  toAgentId: string
  status: TaskStatus
  createdAt: number
  completedAt?: number
  result?: string
  priority?: TaskPriority
  dueDate?: number
  tags?: string[]
  isManual?: boolean
}

// ── 역할 템플릿 ──

export interface RoleTemplate {
  id: string
  name: string
  isBuiltin: boolean
  isLeaderTemplate: boolean
  systemPrompt: string
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultMaxTurns: number
}

// ── 독 크기 ──

export type DockSize = 'small' | 'medium' | 'large'

// ── 글로벌 설정 ──

export interface GlobalSettings {
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultMaxTurns: number
  defaultWorkingDirectory: string
  globalMcpServers: McpServerConfig[]
  agentSpawnLimit: number
  theme?: ThemeSettings
  dockSize?: DockSize
  setupCompleted?: boolean
  companyRules?: string
  roleTemplates?: RoleTemplate[]
  language?: 'ko' | 'en' | 'ja' | 'zh'
  agentLanguage?: 'ko' | 'en' | 'ja' | 'zh'
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

// ── 에러 복구 ──

export type ErrorRecoveryStatus =
  | 'detected'
  | 'leader-notified'
  | 'recovering'
  | 'resolved'
  | 'failed'

export interface ErrorRecoveryEvent {
  id: string
  agentId: string
  agentName: string
  leaderId: string
  leaderName: string
  error: string
  status: ErrorRecoveryStatus
  startedAt: number
  resolvedAt?: number
}

// ── 테마 시스템 ──

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeSettings {
  mode: ThemeMode
  systemPreference?: 'light' | 'dark'
}

// ── MCP 헬스체크 ──

export type McpHealthStatus = 'connected' | 'disconnected' | 'checking' | 'not-found'

export interface McpHealthResult {
  name: string
  status: McpHealthStatus
  error?: string
  checkedAt: number
  agentId: string
}
