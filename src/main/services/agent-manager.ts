import { v4 as uuid } from 'uuid'
import {
  AgentConfig,
  AgentState,
  AgentStatus,
  AgentProcessInfo,
  AgentHierarchy
} from '../../shared/types'
import * as store from './store'

// In-memory runtime state (status, cost, sessionId, processInfo 등)
interface RuntimeState {
  status: AgentStatus
  costTotal: number
  sessionId?: string
  lastMessage?: string
  processInfo?: AgentProcessInfo
  currentTask?: string
}

const runtimeState = new Map<string, RuntimeState>()

function ensureRuntime(id: string): void {
  if (!runtimeState.has(id)) {
    runtimeState.set(id, { status: 'idle', costTotal: 0 })
  }
}

export function listAgents(): AgentConfig[] {
  return store.getAgents()
}

export function createAgent(
  config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>
): AgentConfig {
  const agent: AgentConfig = {
    ...config,
    id: uuid(),
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  store.addAgent(agent)
  runtimeState.set(agent.id, { status: 'idle', costTotal: 0 })
  return agent
}

export function updateAgent(id: string, updates: Partial<AgentConfig>): AgentConfig | null {
  return store.updateAgent(id, updates)
}

export function deleteAgent(id: string): void {
  store.deleteAgent(id)
  runtimeState.delete(id)
}

export function getAgentState(id: string): AgentState | null {
  const config = store.getAgent(id)
  if (!config) return null
  ensureRuntime(id)
  const rt = runtimeState.get(id)!
  return {
    config,
    status: rt.status,
    lastMessage: rt.lastMessage,
    sessionId: rt.sessionId,
    costTotal: rt.costTotal,
    processInfo: rt.processInfo,
    currentTask: rt.currentTask
  }
}

export function setAgentStatus(id: string, status: AgentStatus): void {
  ensureRuntime(id)
  runtimeState.get(id)!.status = status
}

export function setAgentSessionId(id: string, sessionId: string): void {
  ensureRuntime(id)
  runtimeState.get(id)!.sessionId = sessionId
}

export function addAgentCost(id: string, cost: number): void {
  ensureRuntime(id)
  runtimeState.get(id)!.costTotal += cost
}

export function setLastMessage(id: string, msg: string): void {
  ensureRuntime(id)
  runtimeState.get(id)!.lastMessage = msg
}

export function getAllStates(): AgentState[] {
  return listAgents()
    .map((c) => getAgentState(c.id))
    .filter(Boolean) as AgentState[]
}

// ── 프로세스 정보 ──

export function setProcessInfo(id: string, info: AgentProcessInfo): void {
  ensureRuntime(id)
  runtimeState.get(id)!.processInfo = info
}

export function getProcessInfo(id: string): AgentProcessInfo | null {
  ensureRuntime(id)
  return runtimeState.get(id)!.processInfo ?? null
}

export function setCurrentTask(id: string, task: string | undefined): void {
  ensureRuntime(id)
  runtimeState.get(id)!.currentTask = task
}

// ── 에이전트 계층 ──

export function setAgentHierarchy(id: string, hierarchy: AgentHierarchy): AgentConfig | null {
  return store.updateAgent(id, { hierarchy })
}

// 하위호환: 첫 번째 리더 반환
export function getLeader(): AgentConfig | null {
  const agents = listAgents()
  return agents.find((a) => a.hierarchy?.role === 'leader') ?? null
}

// 모든 리더 반환
export function getLeaders(): AgentConfig[] {
  return listAgents().filter((a) => a.hierarchy?.role === 'leader')
}

export function getSubordinates(leaderId: string): AgentConfig[] {
  const agents = listAgents()
  return agents.filter((a) => a.hierarchy?.reportsTo === leaderId)
}

export function getOrgChart(): {
  directors: AgentConfig[]
  leaders: AgentConfig[]
  members: AgentConfig[]
  temporary: AgentConfig[]
} {
  const agents = listAgents()
  const directors = agents.filter((a) => a.hierarchy?.role === 'director')
  const leaders = agents.filter((a) => a.hierarchy?.role === 'leader')
  const members = agents.filter((a) => !a.hierarchy || a.hierarchy.role === 'member')
  const temporary = agents.filter((a) => a.hierarchy?.role === 'temporary' || a.isTemporary)
  return { directors, leaders, members, temporary }
}

// director 또는 leader만 위임 가능
export function canDelegate(agentId: string): boolean {
  const agent = store.getAgent(agentId)
  if (!agent) return false
  return agent.hierarchy?.role === 'director' || agent.hierarchy?.role === 'leader'
}

// 상위자 찾기 — member→leader, leader→director
export function findSuperiorForAgent(agentId: string): AgentConfig | null {
  const agent = store.getAgent(agentId)
  if (!agent) return null

  // reportsTo가 명시되어 있으면 그 상위자 반환
  if (agent.hierarchy?.reportsTo) {
    const superior = store.getAgent(agent.hierarchy.reportsTo)
    if (superior) return superior
  }

  const role = agent.hierarchy?.role

  // leader → director 찾기
  if (role === 'leader') {
    const agents = listAgents()
    // 같은 그룹 director 우선
    if (agent.group) {
      const groupDirector = agents.find(
        (a) => a.group === agent.group && a.hierarchy?.role === 'director' && a.id !== agentId
      )
      if (groupDirector) return groupDirector
    }
    // 아무 director
    const anyDirector = agents.find((a) => a.hierarchy?.role === 'director' && a.id !== agentId)
    if (anyDirector) return anyDirector
    return null
  }

  // member → leader 찾기 (기존 findLeaderForAgent 로직)
  return findLeaderForAgent(agentId)
}

// ── 에이전트의 리더 찾기 ──

export function findLeaderForAgent(agentId: string): AgentConfig | null {
  const agent = store.getAgent(agentId)
  if (!agent) return null

  // reportsTo가 명시되어 있으면 그 리더 반환
  if (agent.hierarchy?.reportsTo) {
    const leader = store.getAgent(agent.hierarchy.reportsTo)
    if (leader) return leader
  }

  // 같은 그룹의 리더 찾기
  if (agent.group) {
    const agents = listAgents()
    const groupLeader = agents.find(
      (a) => a.group === agent.group && a.hierarchy?.role === 'leader' && a.id !== agentId
    )
    if (groupLeader) return groupLeader
  }

  // 아무 리더나 찾기 (폴백)
  const leaders = getLeaders()
  const fallback = leaders.find((l) => l.id !== agentId)
  return fallback ?? null
}

// ── 에이전트 복제 / 내보내기 / 가져오기 ──

export function duplicateAgent(id: string): AgentConfig | null {
  const original = store.getAgent(id)
  if (!original) return null

  const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = original
  return createAgent({
    ...rest,
    name: `${original.name} (Copy)`
  })
}

export function exportAgentConfig(id: string): string | null {
  const agent = store.getAgent(id)
  if (!agent) return null
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...exportable } = agent
  return JSON.stringify(exportable, null, 2)
}

export function importAgentConfig(json: string): AgentConfig {
  const parsed = JSON.parse(json)
  // id, createdAt, updatedAt 제거하고 새로 생성
  const { id: _id, createdAt: _ca, updatedAt: _ua, ...config } = parsed
  return createAgent(config)
}
