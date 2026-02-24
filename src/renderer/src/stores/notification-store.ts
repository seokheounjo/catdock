import { create } from 'zustand'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  timestamp: number
  duration?: number // ms, 0 = persistent
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearAll: () => void
}

let nextId = 0

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],

  addNotification: (n) => {
    const id = `notif-${++nextId}`
    const notification: Notification = {
      ...n,
      id,
      timestamp: Date.now(),
      duration: n.duration ?? 5000
    }
    set({ notifications: [...get().notifications, notification] })

    // 자동 제거
    if (notification.duration && notification.duration > 0) {
      setTimeout(() => {
        set({ notifications: get().notifications.filter((x) => x.id !== id) })
      }, notification.duration)
    }
  },

  removeNotification: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) })
  },

  clearAll: () => {
    set({ notifications: [] })
  }
}))
