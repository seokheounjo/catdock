import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { ActivityEvent, ActivityType } from '../../shared/types'
import * as store from './store'

// 중앙 활동 로깅 서비스
export function logActivity(
  type: ActivityType,
  agentId: string,
  agentName: string,
  description: string,
  metadata?: Record<string, unknown>
): ActivityEvent {
  const event: ActivityEvent = {
    id: uuid(),
    type,
    agentId,
    agentName,
    description,
    timestamp: Date.now(),
    metadata
  }

  store.addActivity(event)

  // 모든 윈도우에 브로드캐스트
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('activity:new', event)
  })

  return event
}

export function getRecentActivities(limit?: number): ActivityEvent[] {
  return store.getRecentActivities(limit)
}

export function clearActivities(): void {
  store.clearActivities()
}
