import { v4 as uuid } from 'uuid'
import { AgentConfig, AgentState, AgentStatus } from '../../shared/types'
import * as store from './store'

// In-memory runtime state (status, cost, sessionId)
const runtimeState = new Map<string, { status: AgentStatus; costTotal: number; sessionId?: string; lastMessage?: string }>()

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
    costTotal: rt.costTotal
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
