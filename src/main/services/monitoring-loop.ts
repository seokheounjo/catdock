// 지속 모니터링 루프 — 에이전트 상태 체크, 에러 자동 복구, 태스크 타임아웃
import { BrowserWindow } from 'electron'
import * as agentManager from './agent-manager'
import * as store from './store'
import { handleAgentError } from './error-recovery'
import { logActivity } from './activity-logger'
import { checkAllMcpServers } from './mcp-health'

const MONITORING_INTERVAL = 30_000 // 30초마다
const TASK_TIMEOUT_MS = 600_000    // 10분 초과 태스크 알림

let monitoringInterval: ReturnType<typeof setInterval> | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

// 에이전트 상태 모니터링
function checkAgentStates(): void {
  const agents = agentManager.listAgents()

  for (const agent of agents) {
    const state = agentManager.getAgentState(agent.id)
    if (!state) continue

    // error 상태 에이전트 → 자동 에러 복구 트리거
    if (state.status === 'error') {
      console.log(`[monitoring] ${agent.name} error 상태 감지 → 자동 복구 시도`)
      handleAgentError(agent.id, `에이전트 ${agent.name} error 상태 감지 (모니터링 루프)`).catch((err) => {
        console.error(`[monitoring] ${agent.name} 자동 복구 실패:`, err)
      })
    }
  }
}

// 장기 실행 태스크 체크
function checkLongRunningTasks(): void {
  const tasks = store.getTasks()
  const now = Date.now()

  for (const task of tasks) {
    if (task.status !== 'in-progress') continue

    const elapsed = now - task.createdAt
    if (elapsed > TASK_TIMEOUT_MS) {
      const minutes = Math.round(elapsed / 60_000)
      console.warn(`[monitoring] 태스크 "${task.title}" ${minutes}분 경과`)

      // 위임자에게 알림
      const delegator = store.getAgent(task.fromAgentId)
      if (delegator) {
        logActivity('error', task.toAgentId, delegator.name,
          `위임 태스크 ${minutes}분 경과: ${task.title.slice(0, 50)}`)

        broadcast('monitoring:task-timeout', {
          taskId: task.id,
          taskTitle: task.title,
          delegatorId: task.fromAgentId,
          delegatorName: delegator.name,
          elapsedMinutes: minutes
        })
      }
    }
  }
}

// MCP 헬스체크
function checkMcpHealth(): void {
  checkAllMcpServers().catch((err) => {
    console.error('[monitoring] MCP 헬스체크 오류:', err)
  })
}

// 전체 모니터링 사이클
function runMonitoringCycle(): void {
  try {
    checkAgentStates()
    checkLongRunningTasks()
    checkMcpHealth()
  } catch (err) {
    console.error('[monitoring] 모니터링 사이클 오류:', err)
  }
}

// 모니터링 시작
export function startMonitoring(): void {
  if (monitoringInterval) return
  monitoringInterval = setInterval(runMonitoringCycle, MONITORING_INTERVAL)
  console.log('[monitoring] 상태 모니터링 루프 시작 (30초 인터벌)')

  // 앱 시작 시 즉시 MCP 헬스체크 실행 (3초 딜레이)
  setTimeout(() => checkMcpHealth(), 3000)
}

// 모니터링 중지
export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
    monitoringInterval = null
    console.log('[monitoring] 상태 모니터링 루프 중지')
  }
}
