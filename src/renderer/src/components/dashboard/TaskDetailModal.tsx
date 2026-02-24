import { useState } from 'react'
import { useTaskStore } from '../../stores/task-store'
// import { useAgentStore } from '../../stores/agent-store'
import { TaskDelegation, TaskStatus, TaskPriority } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

interface TaskDetailModalProps {
  task: TaskDelegation
  onClose: () => void
  getAgentName: (id: string) => string
}

export function TaskDetailModal({ task, onClose, getAgentName }: TaskDetailModalProps) {
  const { t } = useI18n()
  const { deleteTask } = useTaskStore()
  // useAgentStore()

  const [status, setStatus] = useState(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '')
  const [tagsInput, setTagsInput] = useState((task.tags ?? []).join(', '))
  const [result, setResult] = useState(task.result ?? '')

  const handleSave = async () => {
    const updates: Partial<TaskDelegation> = {
      status,
      priority,
      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      tags: tagsInput ? tagsInput.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      result: result || undefined
    }
    if ((status === 'completed' || status === 'failed') && status !== task.status) {
      updates.completedAt = Date.now()
    }
    await window.api.task.update(task.id, updates)
    // 로컬 스토어 업데이트
    useTaskStore.getState().updateTask({ ...task, ...updates } as TaskDelegation)
    onClose()
  }

  const handleDelete = async () => {
    await deleteTask(task.id)
    onClose()
  }

  const isOverdue = task.dueDate && task.dueDate < Date.now() && task.status !== 'completed' && task.status !== 'cancelled'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-chat-bg border border-white/10 rounded-xl w-[520px] max-h-[85vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">{t('taskDetail.title')}</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-white/10 cursor-pointer bg-transparent border-none text-xs"
          >&#x2715;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 제목 (읽기전용) */}
          <div>
            <div className="text-base font-medium text-text">{task.title}</div>
            {task.description && (
              <div className="text-xs text-text-muted mt-1">{task.description}</div>
            )}
          </div>

          {/* 상태 */}
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskDetail.status')}</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {(['pending', 'assigned', 'in-progress', 'completed', 'failed', 'cancelled'] as TaskStatus[]).map((s) => (
                <option key={s} value={s} className="bg-[#1e1e30]">{t(`taskBoard.columns.${s}`)}</option>
              ))}
            </select>
          </label>

          {/* 우선순위 */}
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskDetail.priority')}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                <option key={p} value={p} className="bg-[#1e1e30]">{t(`taskBoard.priority.${p}`)}</option>
              ))}
            </select>
          </label>

          {/* 담당자 / 생성자 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-text-muted block mb-1">{t('taskDetail.assignee')}</span>
              <div className="text-sm text-text">{getAgentName(task.toAgentId)}</div>
            </div>
            <div>
              <span className="text-xs text-text-muted block mb-1">{t('taskDetail.creator')}</span>
              <div className="text-sm text-text">{getAgentName(task.fromAgentId)}</div>
            </div>
          </div>

          {/* 날짜 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-text-muted block mb-1">{t('taskDetail.createdAt')}</span>
              <div className="text-sm text-text">{new Date(task.createdAt).toLocaleString()}</div>
            </div>
            <label className="block">
              <span className={`text-xs mb-1 block ${isOverdue ? 'text-red-400' : 'text-text-muted'}`}>{t('taskDetail.dueDate')}</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-sm outline-none focus:border-accent"
              />
            </label>
          </div>

          {task.completedAt && (
            <div>
              <span className="text-xs text-text-muted block mb-1">{t('taskDetail.completedAt')}</span>
              <div className="text-sm text-text">{new Date(task.completedAt).toLocaleString()}</div>
            </div>
          )}

          {/* 태그 */}
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskDetail.tags')}</span>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('taskDetail.noTags')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          </label>

          {/* 결과 */}
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskDetail.result')}</span>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder={t('taskDetail.resultPlaceholder')}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent resize-none"
            />
          </label>
        </div>

        <div className="flex justify-between px-5 py-3 border-t border-white/10">
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer border border-red-500/20 text-sm transition-colors"
          >{t('taskDetail.delete')}</button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 text-text-muted hover:bg-white/10 cursor-pointer border border-white/10 text-sm transition-colors"
            >{t('taskDetail.close')}</button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer border-none text-sm transition-colors"
            >{t('taskDetail.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
