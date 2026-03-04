import { BrowserWindow } from 'electron'
import { GlobalSettings } from '../../shared/types'
import * as store from './store'
import { seedDirectorIfEmpty } from './default-agents'

export function getSettings(): GlobalSettings {
  return store.getSettings()
}

export function updateSettings(updates: Partial<GlobalSettings>): GlobalSettings {
  const oldDir = store.getSettings().defaultWorkingDirectory
  const settings = store.updateSettings(updates)

  // defaultWorkingDirectory가 변경되면 프로젝트 전환
  if (
    updates.defaultWorkingDirectory !== undefined &&
    updates.defaultWorkingDirectory &&
    updates.defaultWorkingDirectory !== oldDir
  ) {
    const newDir = updates.defaultWorkingDirectory
    console.log(`[settings-manager] 프로젝트 전환: "${oldDir}" → "${newDir}"`)

    // 프로젝트 루트 전환 → 새 프로젝트의 config.json 로드
    store.setProjectRoot(newDir)

    // 새 프로젝트에 총괄이 없으면 기본 에이전트 시딩
    const seeded = seedDirectorIfEmpty()
    const agents = store.getAgents()
    console.log(`[settings-manager] 새 프로젝트 에이전트: ${agents.length}개 (시딩: ${seeded})`)

    // 독 UI에 에이전트 목록 갱신 알림
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('agent:created')
      win.webContents.send('agent:updated')
    })
  }

  // 모든 윈도우에 설정 변경 브로드캐스트
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('settings:changed', settings)
  })

  return settings
}
