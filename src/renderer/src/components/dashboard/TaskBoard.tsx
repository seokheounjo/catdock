import { useState } from 'react'
import { useTaskStore } from '../../stores/task-store'
import { useAgentStore } from '../../stores/agent-store'
import { TaskDelegation, TaskStatus, TaskPriority } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'
import { TaskCreateForm } from './TaskCreateForm'
import { TaskDetailModal } from './TaskDetailModal'

const columns: { status: TaskStatus; colorClass: string }[] = [
  { status: 'pending', colorClass: 'border-gray-500' },
  { status: 'assigned', colorClass: 'border-yellow-500' },
  { status: 'in-progress', colorClass: 'border-blue-500' },
  { status: 'completed', colorClass: 'border-green-500' },
  { status: 'failed', colorClass: 'border-red-500' },
  { status: 'cancelled', colorClass: 'border-gray-400' }
]

const priorityColors: Record<TaskPriority, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
}

export function TaskBoard() {
  const { t } = useI18n()
  const { filteredTasks, filter, setFilter } = useTaskStore()
  const { agents } = useAgentStore()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskDelegation | null>(null)

  const tasks = filteredTasks()
  const getAgentName = (id: string) => {
    if (id === 'user') return t('taskBoard.user')
    return agents.find((a) => a.id === id)?.name ?? t('taskBoard.unknown')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text">{t('taskBoard.title')}</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs cursor-pointer border-none transition-colors"
        >
          + {t('taskBoard.newTask')}
        </button>
      </div>

      {/* 필터바 */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
          placeholder={t('taskBoard.filter.search')}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-xs outline-none focus:border-accent w-48"
        />
        <select
          value={filter.agentId ?? ''}
          onChange={(e) => setFilter({ agentId: e.target.value || null })}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-xs outline-none focus:border-accent appearance-none cursor-pointer"
        >
          <option value="" className="bg-[#1e1e30]">
            {t('taskBoard.filter.allAgents')}
          </option>
          {agents.map((a) => (
            <option key={a.id} value={a.id} className="bg-[#1e1e30]">
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={filter.priority ?? ''}
          onChange={(e) => setFilter({ priority: (e.target.value as TaskPriority) || null })}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-xs outline-none focus:border-accent appearance-none cursor-pointer"
        >
          <option value="" className="bg-[#1e1e30]">
            {t('taskBoard.filter.allPriorities')}
          </option>
          {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
            <option key={p} value={p} className="bg-[#1e1e30]">
              {t(`taskBoard.priority.${p}`)}
            </option>
          ))}
        </select>
      </div>

      {tasks.length === 0 ? (
        <div className="text-sm text-text-muted text-center py-8">{t('taskBoard.noTasks')}</div>
      ) : (
        <div className="grid grid-cols-6 gap-3">
          {columns.map((col) => {
            const colTasks = tasks.filter((task) => task.status === col.status)
            return (
              <div key={col.status} className="space-y-2 min-w-0">
                <div
                  className={`text-[10px] font-medium text-text-muted pb-2 border-b-2 ${col.colorClass}`}
                >
                  {t(`taskBoard.columns.${col.status}`)} ({colTasks.length})
                </div>
                <div className="space-y-2">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      getAgentName={getAgentName}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreateForm && <TaskCreateForm onClose={() => setShowCreateForm(false)} />}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          getAgentName={getAgentName}
        />
      )}
    </div>
  )
}

function TaskCard({
  task,
  getAgentName,
  onClick
}: {
  task: TaskDelegation
  getAgentName: (id: string) => string
  onClick: () => void
}) {
  const { t } = useI18n()
  const { changeTaskStatus, deleteTask } = useTaskStore()
  const [now] = useState(() => Date.now())
  const isOverdue =
    task.dueDate && task.dueDate < now && task.status !== 'completed' && task.status !== 'cancelled'

  // 상태 전환 규칙
  const getActions = (): { label: string; status: TaskStatus; color: string }[] => {
    switch (task.status) {
      case 'pending':
        return [
          { label: t('taskBoard.actions.assign'), status: 'assigned', color: 'text-yellow-400' },
          { label: t('taskBoard.actions.start'), status: 'in-progress', color: 'text-blue-400' },
          { label: t('taskBoard.actions.cancel'), status: 'cancelled', color: 'text-gray-400' }
        ]
      case 'assigned':
        return [
          { label: t('taskBoard.actions.start'), status: 'in-progress', color: 'text-blue-400' },
          { label: t('taskBoard.actions.cancel'), status: 'cancelled', color: 'text-gray-400' }
        ]
      case 'in-progress':
        return [
          { label: t('taskBoard.actions.complete'), status: 'completed', color: 'text-green-400' },
          { label: t('taskBoard.actions.fail'), status: 'failed', color: 'text-red-400' },
          { label: t('taskBoard.actions.cancel'), status: 'cancelled', color: 'text-gray-400' }
        ]
      case 'failed':
      case 'cancelled':
        return [{ label: t('taskBoard.actions.reopen'), status: 'pending', color: 'text-blue-400' }]
      default:
        return []
    }
  }

  const actions = getActions()

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-2.5 space-y-1.5 group relative cursor-pointer hover:bg-white/[0.08] transition-colors"
      onClick={onClick}
    >
      {/* 삭제 버튼 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          deleteTask(task.id)
        }}
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded text-text-muted hover:text-red-400 hover:bg-red-500/10
                   opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer
                   flex items-center justify-center text-xs"
        title={t('taskBoard.actions.delete')}
      >
        &#x2715;
      </button>

      {/* 우선순위 뱃지 + 제목 */}
      <div className="flex items-start gap-1.5 pr-5">
        {task.priority && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium border shrink-0 ${priorityColors[task.priority]}`}
          >
            {t(`taskBoard.priority.${task.priority}`)}
          </span>
        )}
        <div className="text-xs font-medium text-text leading-tight truncate">{task.title}</div>
      </div>

      {/* 마감일 */}
      {task.dueDate && (
        <div className={`text-[9px] ${isOverdue ? 'text-red-400 font-medium' : 'text-text-muted'}`}>
          {isOverdue && `${t('taskBoard.overdue')} · `}
          {new Date(task.dueDate).toLocaleDateString()}
        </div>
      )}

      {/* 태그 칩 */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 에이전트 + 날짜 */}
      <div className="flex items-center justify-between text-[9px] text-text-muted">
        <span className="truncate">
          {getAgentName(task.fromAgentId)} → {getAgentName(task.toAgentId)}
        </span>
        <span className="shrink-0">{new Date(task.createdAt).toLocaleDateString()}</span>
      </div>

      {/* 상태 전환 버튼 */}
      {actions.length > 0 && (
        <div className="flex gap-1.5 pt-0.5">
          {actions.map((action) => (
            <button
              key={action.status}
              onClick={(e) => {
                e.stopPropagation()
                changeTaskStatus(task.id, action.status)
              }}
              className={`text-[10px] ${action.color} hover:opacity-80 bg-transparent border-none cursor-pointer`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
