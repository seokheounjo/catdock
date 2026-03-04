import { BrowserWindow } from 'electron'
import { GlobalSettings } from '../../shared/types'
import * as store from './store'

export function getSettings(): GlobalSettings {
  return store.getSettings()
}

export function updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
  // defaultWorkingDirectory 변경 시 이전 값 기억 (업데이트 전에 캡처)
  const oldWorkingDir =
    updates.defaultWorkingDirectory !== undefined
      ? store.getSettings().defaultWorkingDirectory
      : undefined

  const settings = store.updateSettings(updates)

  // defaultWorkingDirectory가 변경되면 기존 에이전트들도 일괄 업데이트
  if (updates.defaultWorkingDirectory !== undefined) {
    const newDir = updates.defaultWorkingDirectory
    const agents = store.getAgents()
    for (const agent of agents) {
      // workingDirectory가 비어있거나 이전 기본값과 같은 에이전트 → 새 값으로 갱신
      if (
        !agent.workingDirectory ||
        agent.workingDirectory === '' ||
        agent.workingDirectory === oldWorkingDir
      ) {
        store.updateAgent(agent.id, { workingDirectory: newDir })
      }
    }
    // 에이전트 변경도 브로드캐스트
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:updated')
    })
  }

  // 모든 윈도우에 브로드캐스트
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('settings:changed', settings)
  })

  return settings
}
