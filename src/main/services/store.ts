import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { AgentConfig, ChatMessage, SessionInfo, ConversationConfig, ConversationMessage } from '../../shared/types'

interface StoreSchema {
  agents: AgentConfig[]
  sessions: Record<string, SessionInfo>
  conversations: ConversationConfig[]
  conversationHistories: Record<string, ConversationMessage[]>
}

const defaults: StoreSchema = {
  agents: [],
  sessions: {},
  conversations: [],
  conversationHistories: {}
}

let storePath: string
let data: StoreSchema

function getStorePath(): string {
  if (!storePath) {
    const dir = join(app.getPath('userData'), 'virtual-company-data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    storePath = join(dir, 'config.json')
  }
  return storePath
}

function load(): StoreSchema {
  if (data) return data
  try {
    const raw = readFileSync(getStorePath(), 'utf-8')
    data = { ...defaults, ...JSON.parse(raw) }
  } catch {
    data = { ...defaults }
  }
  return data
}

function save(): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2), 'utf-8')
}

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
    save()
  }
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

export function updateConversationConfig(id: string, updates: Partial<ConversationConfig>): ConversationConfig | null {
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
