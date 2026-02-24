import { create } from 'zustand'
import { TaskDelegation, TaskPriority } from '../../../shared/types'

interface TaskFilter {
  search: string
  agentId: string | null
  priority: TaskPriority | null
}

interface TaskStore {
  tasks: TaskDelegation[]
  loading: boolean
  filter: TaskFilter
  setFilter: (filter: Partial<TaskFilter>) => void
  filteredTasks: () => TaskDelegation[]
  fetchTasks: () => Promise<void>
  addTask: (task: TaskDelegation) => void
  updateTask: (task: TaskDelegation) => void
  removeTask: (id: string) => void
  createTask: (task: Omit<TaskDelegation, 'id' | 'createdAt'>) => Promise<TaskDelegation>
  createManualTask: (task: { title: string; description: string; toAgentId: string; priority?: string; dueDate?: number; tags?: string[] }) => Promise<TaskDelegation>
  changeTaskStatus: (id: string, status: TaskDelegation['status'], result?: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  filter: { search: '', agentId: null, priority: null },

  setFilter: (filter) => {
    set({ filter: { ...get().filter, ...filter } })
  },

  filteredTasks: () => {
    const { tasks, filter } = get()
    return tasks.filter((t) => {
      if (filter.search) {
        const q = filter.search.toLowerCase()
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      }
      if (filter.agentId) {
        if (t.toAgentId !== filter.agentId && t.fromAgentId !== filter.agentId) return false
      }
      if (filter.priority) {
        if (t.priority !== filter.priority) return false
      }
      return true
    })
  },

  fetchTasks: async () => {
    set({ loading: true })
    const tasks = await window.api.task.list()
    set({ tasks, loading: false })
  },

  addTask: (task) => {
    set({ tasks: [...get().tasks, task] })
  },

  updateTask: (task) => {
    set({ tasks: get().tasks.map((t) => (t.id === task.id ? task : t)) })
  },

  createTask: async (task) => {
    const newTask = await window.api.task.create(task)
    set({ tasks: [...get().tasks, newTask] })
    return newTask
  },

  createManualTask: async (task) => {
    const newTask = await window.api.task.createManual(task)
    set({ tasks: [...get().tasks, newTask] })
    return newTask
  },

  removeTask: (id) => {
    set({ tasks: get().tasks.filter((t) => t.id !== id) })
  },

  deleteTask: async (id) => {
    await window.api.task.delete(id)
    set({ tasks: get().tasks.filter((t) => t.id !== id) })
  },

  changeTaskStatus: async (id, status, result) => {
    const updates: Partial<TaskDelegation> = { status }
    if (status === 'completed' || status === 'failed') {
      updates.completedAt = Date.now()
    }
    if (result !== undefined) updates.result = result
    const task = await window.api.task.update(id, updates)
    if (task) {
      set({ tasks: get().tasks.map((t) => (t.id === task.id ? task : t)) })
    }
  }
}))
