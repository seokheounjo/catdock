import { memo } from 'react'
import { useActivityStore } from '../../stores/activity-store'
import { ActivityEvent, ActivityType } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

const typeColors: Record<ActivityType, string> = {
  message: 'text-blue-400',
  'tool-use': 'text-purple-400',
  error: 'text-red-400',
  'status-change': 'text-gray-400',
  'agent-created': 'text-green-400',
  'agent-deleted': 'text-orange-400',
  'task-delegated': 'text-yellow-400'
}

const typeIcons: Record<ActivityType, string> = {
  message: '\u{1F4AC}',
  'tool-use': '\u{1F527}',
  error: '\u{274C}',
  'status-change': '\u{1F504}',
  'agent-created': '\u{2795}',
  'agent-deleted': '\u{2796}',
  'task-delegated': '\u{1F4CB}'
}

export function ActivityFeed() {
  const { t } = useI18n()
  const { activities, clearActivities } = useActivityStore()

  // 최신순
  const sorted = [...activities].reverse()

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text">{t('activity.title')}</h2>
        <button
          onClick={clearActivities}
          className="text-xs text-text-muted hover:text-text-muted bg-transparent border-none cursor-pointer"
        >
          {t('activity.clear')}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-text-muted text-center py-8">{t('activity.noActivity')}</div>
      ) : (
        <div className="space-y-1">
          {sorted.map((event) => (
            <ActivityItem key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

const ActivityItem = memo(function ActivityItem({ event }: { event: ActivityEvent }) {
  const timeStr = new Date(event.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
      <span className="text-sm shrink-0" aria-hidden="true">
        {typeIcons[event.type] || '\u{1F4CC}'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${typeColors[event.type] || 'text-text-muted'}`}>
            {event.agentName}
          </span>
          <span className="text-[10px] text-text-muted">{timeStr}</span>
        </div>
        <div className="text-xs text-text-muted truncate">{event.description}</div>
      </div>
    </div>
  )
})
