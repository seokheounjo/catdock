import { useNotificationStore, NotificationType } from '../../stores/notification-store'

const typeStyles: Record<NotificationType, string> = {
  info: 'border-blue-500/50 bg-blue-500/10',
  success: 'border-green-500/50 bg-green-500/10',
  warning: 'border-yellow-500/50 bg-yellow-500/10',
  error: 'border-red-500/50 bg-red-500/10'
}

export function NotificationCenter() {
  const { notifications, removeNotification } = useNotificationStore()

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`rounded-lg border p-3 shadow-lg backdrop-blur-sm transition-all animate-[slide-up_0.2s_ease-out] ${typeStyles[n.type]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-text">{n.title}</div>
              {n.message && (
                <div className="text-xs text-text-muted mt-0.5">{n.message}</div>
              )}
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-text-muted hover:text-text-secondary bg-transparent border-none cursor-pointer text-xs shrink-0"
            >✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}
