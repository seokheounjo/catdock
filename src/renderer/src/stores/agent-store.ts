import { create } from 'zustand'
import { AgentConfig, AgentState, AgentStatus } from '../../../shared/types'

interface AgentStore {
  agents: AgentConfig[]
  states: Map<string, AgentState>
  loading: boolean

  fetchAgents: () => Promise<void>
  fetchStates: () => Promise<void>
  createAgent: (config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AgentConfig>
  updateAgent: (id: string, updates: Partial<AgentConfig>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setAgentStatus: (id: string, status: AgentStatus) => void
  openChat: (agentId: string) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  states: new Map(),
  loading: false,

  fetchAgents: async () => {
    set({ loading: true })
    const agents = await window.api.agent.list()
    set({ agents, loading: false })
  },

  fetchStates: async () => {
    const states = await window.api.agent.getAllStates()
    const map = new Map<string, AgentState>()
    for (const s of states) {
      map.set(s.config.id, s)
    }
    set({ states: map })
  },

  createAgent: async (config) => {
    const agent = await window.api.agent.create(config)
    set({ agents: [...get().agents, agent] })
    return agent
  },

  updateAgent: async (id, updates) => {
    const agent = await window.api.agent.update(id, updates)
    if (agent) {
      set({ agents: get().agents.map((a) => (a.id === id ? agent : a)) })
    }
  },

  deleteAgent: async (id) => {
    await window.api.agent.delete(id)
    set({ agents: get().agents.filter((a) => a.id !== id) })
    const states = get().states
    states.delete(id)
    set({ states: new Map(states) })
  },

  setAgentStatus: (id, status) => {
    const states = new Map(get().states)
    const existing = states.get(id)
    if (existing) {
      states.set(id, { ...existing, status })
      set({ states })
    }
  },

  openChat: async (agentId) => {
    await window.api.window.openChat(agentId)
  }
}))
