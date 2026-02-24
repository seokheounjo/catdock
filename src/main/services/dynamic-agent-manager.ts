import { AgentConfig } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as sessionManager from './session-manager'
import * as settingsManager from './settings-manager'
import { logActivity } from './activity-logger'
import { BrowserWindow } from 'electron'

// 임시 에이전트 생성 (스폰 제한 확인)
export function spawnTemporaryAgent(
  requestedBy: string,
  config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'>
): AgentConfig | null {
  const settings = settingsManager.getSettings()
  const currentTemps = agentManager.listAgents().filter((a) => a.isTemporary)

  if (currentTemps.length >= settings.agentSpawnLimit) {
    throw new Error(`임시 에이전트 스폰 제한 초과 (최대: ${settings.agentSpawnLimit})`)
  }

  const agent = agentManager.createAgent({
    ...config,
    isTemporary: true,
    createdBy: requestedBy,
    hierarchy: { role: 'temporary' }
  })

  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:created', agent))

  const requester = agentManager.listAgents().find((a) => a.id === requestedBy)
  logActivity(
    'agent-created',
    agent.id,
    agent.name,
    `${requester?.name ?? 'User'}이 임시 에이전트 ${agent.name} 스폰`,
    { requestedBy, isTemporary: true }
  )

  return agent
}

// 만료된 임시 에이전트 정리
export function cleanupExpiredAgents(): number {
  const now = Date.now()
  const agents = agentManager.listAgents()
  let cleaned = 0

  for (const agent of agents) {
    if (agent.isTemporary && agent.expiresAt && agent.expiresAt <= now) {
      sessionManager.abortSession(agent.id)
      agentManager.deleteAgent(agent.id)
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:deleted', agent.id))
      logActivity(
        'agent-deleted',
        agent.id,
        agent.name,
        `임시 에이전트 ${agent.name} 만료로 제거됨`
      )
      cleaned++
    }
  }

  return cleaned
}

// 특정 임시 에이전트 제거
export function removeTemporaryAgent(id: string): boolean {
  const agent = agentManager.listAgents().find((a) => a.id === id)
  if (!agent || !agent.isTemporary) return false

  sessionManager.abortSession(id)
  agentManager.deleteAgent(id)
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:deleted', id))
  logActivity('agent-deleted', id, agent.name, `임시 에이전트 ${agent.name} 수동 제거됨`)
  return true
}
