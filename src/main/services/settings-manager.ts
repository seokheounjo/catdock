import { BrowserWindow } from 'electron'
import { GlobalSettings } from '../../shared/types'
import * as store from './store'

export function getSettings(): GlobalSettings {
  return store.getSettings()
}

export function updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
  const settings = store.updateSettings(updates)

  // 모든 윈도우에 브로드캐스트
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('settings:changed', settings)
  })

  return settings
}
