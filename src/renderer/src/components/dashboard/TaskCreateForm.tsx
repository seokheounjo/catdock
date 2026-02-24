import { useState } from 'react'
import { useTaskStore } from '../../stores/task-store'
import { useAgentStore } from '../../stores/agent-store'
import { TaskPriority } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

interface TaskCreateFormProps {
  onClose: () => void
}

export function TaskCreateForm({ onClose }: TaskCreateFormProps) {
  const { t } = useI18n()
  const { createManualTask } = useTaskStore()
  const { agents } = useAgentStore()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [toAgentId, setToAgentId] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const handleSubmit = async () => {
    if (!title.trim() || !toAgentId) return

    await createManualTask({
      title: title.trim(),
      description: description.trim(),
      toAgentId,
      priority,
      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      tags: tagsInput ? tagsInput.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-chat-bg border border-white/10 rounded-xl w-[480px] max-h-[80vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-text">{t('taskCreate.title')}</h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.taskTitle')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('taskCreate.taskTitlePlaceholder')}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.description')}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('taskCreate.descriptionPlaceholder')}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.assignee')}</span>
            <select
              value={toAgentId}
              onChange={(e) => setToAgentId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              <option value="" className="bg-[#1e1e30]">{t('taskCreate.selectAgent')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id} className="bg-[#1e1e30]">{a.name} ({a.role})</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.priority')}</span>
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

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.dueDate')}</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('taskCreate.tags')}</span>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t('taskCreate.tagsPlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-text-muted hover:bg-white/10 cursor-pointer border border-white/10 text-sm transition-colors"
          >{t('taskCreate.cancel')}</button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !toAgentId}
            className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer border-none text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >{t('taskCreate.create')}</button>
        </div>
      </div>
    </div>
  )
}
