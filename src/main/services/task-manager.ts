import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { TaskDelegation, TaskStatus, TaskPriority } from '../../shared/types'
import * as store from './store'
import { logActivity } from './activity-logger'

export function createTask(task: Omit<TaskDelegation, 'id' | 'createdAt'>): TaskDelegation {
  const newTask: TaskDelegation = {
    ...task,
    id: uuid(),
    createdAt: Date.now()
  }
  store.addTask(newTask)

  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:created', newTask))

  const fromAgent = store.getAgent(task.fromAgentId)
  const toAgent = store.getAgent(task.toAgentId)
  logActivity(
    'task-delegated',
    task.fromAgentId,
    fromAgent?.name ?? 'Unknown',
    `${fromAgent?.name ?? 'Unknown'} → ${toAgent?.name ?? 'Unknown'}: ${task.title}`
  )

  return newTask
}

export function listTasks(): TaskDelegation[] {
  return store.getTasks()
}

export function getTasksForAgent(agentId: string): TaskDelegation[] {
  return store.getTasksForAgent(agentId)
}

export function updateTask(id: string, updates: Partial<TaskDelegation>): TaskDelegation | null {
  const task = store.updateTask(id, updates)
  if (task) {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:updated', task))
  }
  return task
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: string
): TaskDelegation | null {
  const updates: Partial<TaskDelegation> = { status }
  if (status === 'completed' || status === 'failed') {
    updates.completedAt = Date.now()
  }
  if (result !== undefined) {
    updates.result = result
  }
  return updateTask(id, updates)
}

export function createManualTask(opts: {
  title: string
  description: string
  toAgentId: string
  priority?: string
  dueDate?: number
  tags?: string[]
}): TaskDelegation {
  const newTask: TaskDelegation = {
    id: uuid(),
    title: opts.title,
    description: opts.description,
    fromAgentId: 'user',
    toAgentId: opts.toAgentId,
    status: 'pending',
    createdAt: Date.now(),
    priority: (opts.priority as TaskPriority) || 'medium',
    dueDate: opts.dueDate,
    tags: opts.tags,
    isManual: true
  }
  store.addTask(newTask)

  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('task:created', newTask))

  const toAgent = store.getAgent(opts.toAgentId)
  logActivity(
    'task-delegated',
    'user',
    'User',
    `User → ${toAgent?.name ?? 'Unknown'}: ${opts.title}`
  )

  return newTask
}
