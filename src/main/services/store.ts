import { app } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs'
import {
  AgentConfig,
  ChatMessage,
  SessionInfo,
  ConversationConfig,
  ConversationMessage,
  GlobalSettings,
  ActivityEvent,
  TaskDelegation
} from '../../shared/types'

// ── 프로젝트 데이터 스키마 (projects/<hash>/config.json) ──

interface StoreSchema {
  agents: AgentConfig[]
  sessions: Record<string, SessionInfo>
  conversations: ConversationConfig[]
  conversationHistories: Record<string, ConversationMessage[]>
  activities: ActivityEvent[]
  tasks: TaskDelegation[]
}

const projectDefaults: StoreSchema = {
  agents: [],
  sessions: {},
  conversations: [],
  conversationHistories: {},
  activities: [],
  tasks: []
}

// ── 전역 설정 디폴트 ──

const globalSettingsDefaults: GlobalSettings = {
  defaultModel: 'claude-opus-4-6',
  defaultPermissionMode: 'acceptEdits',
  defaultMaxTurns: 25,
  defaultWorkingDirectory: '',
  globalMcpServers: [],
  agentSpawnLimit: 10,
  theme: { mode: 'system' as const }
}

// ── 모듈 상태 ──

let currentProjectRoot: string = ''
let projectStorePath: string = ''
let globalSettingsPath: string = ''
let data: StoreSchema | null = null

// ── 해시 함수 ──

function hashPath(dir: string): string {
  return createHash('sha256').update(dir.toLowerCase()).digest('hex').slice(0, 12)
}

// ── 프로젝트 루트 관리 ──

export function setProjectRoot(dir: string): void {
  currentProjectRoot = dir
  // 프로젝트 경로 리셋 → 다음 load()에서 새 경로로 로드
  projectStorePath = ''
  globalSettingsPath = ''
  data = null
  // 즉시 마이그레이션 실행 (getSettings()가 load()보다 먼저 호출될 수 있으므로)
  migrateIfNeeded()
}

export function getProjectRoot(): string {
  return currentProjectRoot
}

// ── 경로 계산 ──

function getBaseDir(): string {
  return join(app.getPath('userData'), 'virtual-company-data')
}

function getStorePath(): string {
  if (!projectStorePath) {
    const baseDir = getBaseDir()
    const hash = hashPath(currentProjectRoot || process.cwd())
    const dir = join(baseDir, 'projects', hash)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    projectStorePath = join(dir, 'config.json')
  }
  return projectStorePath
}

export function getProjectStoreDir(): string {
  const baseDir = getBaseDir()
  const hash = hashPath(currentProjectRoot || process.cwd())
  return join(baseDir, 'projects', hash)
}

function getGlobalSettingsPath(): string {
  if (!globalSettingsPath) {
    const dir = getBaseDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    globalSettingsPath = join(dir, 'global-settings.json')
  }
  return globalSettingsPath
}

// ── 마이그레이션: 기존 전역 config.json → 프로젝트별 분리 ──

function migrateIfNeeded(): void {
  const baseDir = getBaseDir()
  const oldConfigPath = join(baseDir, 'config.json')
  const migratedPath = join(baseDir, 'config.json.migrated')

  // 이미 마이그레이션 완료 또는 기존 파일 없음
  if (!existsSync(oldConfigPath) || existsSync(migratedPath)) return

  try {
    const raw = readFileSync(oldConfigPath, 'utf-8')
    const oldData = JSON.parse(raw)

    // 1. 전역 설정 분리 → global-settings.json
    if (oldData.settings) {
      const globalPath = getGlobalSettingsPath()
      if (!existsSync(globalPath)) {
        writeFileSync(globalPath, JSON.stringify(oldData.settings, null, 2), 'utf-8')
        console.log('[store] 마이그레이션: global-settings.json 생성')
      }
    }

    // 2. 프로젝트 데이터 → 현재 프로젝트의 config.json으로 복사
    const projectPath = getStorePath()
    if (!existsSync(projectPath)) {
      const projectData: StoreSchema = {
        agents: oldData.agents || [],
        sessions: oldData.sessions || {},
        conversations: oldData.conversations || [],
        conversationHistories: oldData.conversationHistories || {},
        activities: oldData.activities || [],
        tasks: oldData.tasks || []
      }
      writeFileSync(projectPath, JSON.stringify(projectData, null, 2), 'utf-8')
      console.log('[store] 마이그레이션: 프로젝트 config.json 생성')
    }

    // 3. 원본 백업
    renameSync(oldConfigPath, migratedPath)
    console.log('[store] 마이그레이션 완료: config.json → config.json.migrated')
  } catch (err) {
    console.error('[store] 마이그레이션 실패:', err)
  }
}

// ── 로드/저장 ──

function load(): StoreSchema {
  if (data) return data
  try {
    const raw = readFileSync(getStorePath(), 'utf-8')
    data = { ...projectDefaults, ...JSON.parse(raw) }
  } catch {
    data = { ...projectDefaults }
  }
  return data!
}

function save(): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

// ── 전역 설정 로드/저장 ──

function loadGlobalSettings(): GlobalSettings {
  try {
    const raw = readFileSync(getGlobalSettingsPath(), 'utf-8')
    return { ...globalSettingsDefaults, ...JSON.parse(raw) }
  } catch {
    return { ...globalSettingsDefaults }
  }
}

function saveGlobalSettings(settings: GlobalSettings): void {
  writeFileSync(getGlobalSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

// ── Agent CRUD ──

export function getAgents(): AgentConfig[] {
  return load().agents
}

export function setAgents(agents: AgentConfig[]): void {
  load().agents = agents
  save()
}

export function getAgent(id: string): AgentConfig | undefined {
  return getAgents().find((a) => a.id === id)
}

export function addAgent(agent: AgentConfig): void {
  const agents = getAgents()
  agents.push(agent)
  setAgents(agents)
}

export function updateAgent(id: string, updates: Partial<AgentConfig>): AgentConfig | null {
  const agents = getAgents()
  const idx = agents.findIndex((a) => a.id === id)
  if (idx === -1) return null
  agents[idx] = { ...agents[idx], ...updates, updatedAt: Date.now() }
  setAgents(agents)
  return agents[idx]
}

export function deleteAgent(id: string): void {
  setAgents(getAgents().filter((a) => a.id !== id))
  const d = load()
  delete d.sessions[id]
  save()
}

// ── Session ──

export function getSessionHistory(agentId: string): ChatMessage[] {
  return load().sessions[agentId]?.messages ?? []
}

export function saveSessionHistory(agentId: string, messages: ChatMessage[]): void {
  const d = load()
  d.sessions[agentId] = {
    sessionId: d.sessions[agentId]?.sessionId ?? agentId,
    agentId,
    messages,
    createdAt: d.sessions[agentId]?.createdAt ?? Date.now(),
    updatedAt: Date.now()
  }
  save()
}

export function getSessionInfo(agentId: string): SessionInfo | undefined {
  return load().sessions[agentId]
}

export function updateSessionId(agentId: string, sessionId: string): void {
  const d = load()
  if (d.sessions[agentId]) {
    d.sessions[agentId].sessionId = sessionId
  } else {
    // 세션 엔트리가 아직 없으면 생성 (첫 대화 시 onInit이 saveSessionHistory보다 먼저 호출됨)
    d.sessions[agentId] = {
      sessionId,
      agentId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }
  save()
}

export function clearSessionHistory(agentId: string): void {
  const d = load()
  delete d.sessions[agentId]
  save()
}

// ── 그룹 대화 ──

export function getConversationConfigs(): ConversationConfig[] {
  return load().conversations || []
}

export function getConversationConfig(id: string): ConversationConfig | undefined {
  return getConversationConfigs().find((c) => c.id === id)
}

export function addConversationConfig(config: ConversationConfig): void {
  const d = load()
  if (!d.conversations) d.conversations = []
  d.conversations.push(config)
  save()
}

export function updateConversationConfig(
  id: string,
  updates: Partial<ConversationConfig>
): ConversationConfig | null {
  const d = load()
  if (!d.conversations) return null
  const idx = d.conversations.findIndex((c) => c.id === id)
  if (idx === -1) return null
  d.conversations[idx] = { ...d.conversations[idx], ...updates, updatedAt: Date.now() }
  save()
  return d.conversations[idx]
}

export function deleteConversationConfig(id: string): void {
  const d = load()
  if (!d.conversations) return
  d.conversations = d.conversations.filter((c) => c.id !== id)
  if (d.conversationHistories) delete d.conversationHistories[id]
  save()
}

export function getConversationHistory(id: string): ConversationMessage[] {
  const d = load()
  return d.conversationHistories?.[id] ?? []
}

export function saveConversationHistory(id: string, messages: ConversationMessage[]): void {
  const d = load()
  if (!d.conversationHistories) d.conversationHistories = {}
  d.conversationHistories[id] = messages
  save()
}

export function clearConversationHistory(id: string): void {
  const d = load()
  if (d.conversationHistories) delete d.conversationHistories[id]
  save()
}

// ── 글로벌 설정 (전역 — 프로젝트 간 공유) ──

export function getSettings(): GlobalSettings {
  return loadGlobalSettings()
}

export function updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
  const settings = loadGlobalSettings()
  const merged = { ...settings, ...updates }
  saveGlobalSettings(merged)
  return merged
}

// ── 활동 로그 ──

const MAX_ACTIVITIES = 500

export function addActivity(event: ActivityEvent): void {
  const d = load()
  if (!d.activities) d.activities = []
  d.activities.push(event)
  // 상한 유지
  if (d.activities.length > MAX_ACTIVITIES) {
    d.activities = d.activities.slice(-MAX_ACTIVITIES)
  }
  save()
}

export function getRecentActivities(limit: number = 100): ActivityEvent[] {
  const d = load()
  const activities = d.activities || []
  return activities.slice(-limit)
}

export function clearActivities(): void {
  const d = load()
  d.activities = []
  save()
}

// ── 작업 위임 ──

export function addTask(task: TaskDelegation): void {
  const d = load()
  if (!d.tasks) d.tasks = []
  d.tasks.push(task)
  save()
}

export function getTasks(): TaskDelegation[] {
  const d = load()
  return d.tasks || []
}

export function updateTask(id: string, updates: Partial<TaskDelegation>): TaskDelegation | null {
  const d = load()
  if (!d.tasks) return null
  const idx = d.tasks.findIndex((t) => t.id === id)
  if (idx === -1) return null
  d.tasks[idx] = { ...d.tasks[idx], ...updates }
  save()
  return d.tasks[idx]
}

export function deleteTask(id: string): boolean {
  const d = load()
  if (!d.tasks) return false
  const before = d.tasks.length
  d.tasks = d.tasks.filter((t) => t.id !== id)
  if (d.tasks.length === before) return false
  save()
  return true
}

export function getTasksForAgent(agentId: string): TaskDelegation[] {
  return getTasks().filter((t) => t.toAgentId === agentId || t.fromAgentId === agentId)
}

// 존재하지 않는 에이전트의 태스크 정리
export function cleanStaleTasks(): number {
  const d = load()
  if (!d.tasks || d.tasks.length === 0) return 0
  const agentIds = new Set((d.agents || []).map((a: { id: string }) => a.id))
  const before = d.tasks.length
  d.tasks = d.tasks.filter(
    (t: TaskDelegation) => agentIds.has(t.fromAgentId) || agentIds.has(t.toAgentId)
  )
  const removed = before - d.tasks.length
  if (removed > 0) save()
  return removed
}
