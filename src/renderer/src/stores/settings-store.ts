import { create } from 'zustand'
import { GlobalSettings } from '../../../shared/types'

interface SettingsStore {
  settings: GlobalSettings | null
  loading: boolean
  fetchSettings: () => Promise<void>
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  loading: false,

  fetchSettings: async () => {
    set({ loading: true })
    const settings = await window.api.settings.get()
    set({ settings, loading: false })
  },

  updateSettings: async (updates) => {
    const settings = await window.api.settings.update(updates)
    set({ settings })
  }
}))
