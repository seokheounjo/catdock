import { create } from 'zustand'
import { ActivityEvent } from '../../../shared/types'

interface ActivityStore {
  activities: ActivityEvent[]
  loading: boolean
  fetchActivities: (limit?: number) => Promise<void>
  addActivity: (event: ActivityEvent) => void
  clearActivities: () => Promise<void>
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  activities: [],
  loading: false,

  fetchActivities: async (limit = 100) => {
    set({ loading: true })
    const activities = await window.api.activity.getRecent(limit)
    set({ activities, loading: false })
  },

  addActivity: (event) => {
    const activities = [...get().activities, event]
    // 클라이언트 측 상한
    if (activities.length > 500) activities.shift()
    set({ activities })
  },

  clearActivities: async () => {
    await window.api.activity.clear()
    set({ activities: [] })
  }
}))
