// 프로세스 워치독 — 하트비트 감시, 타임아웃 처리, 총괄 장애조치
import { ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import * as agentManager from './agent-manager'
import * as store from './store'
import { logActivity } from './activity-logger'

// ── 순환 의존 방지: session-manager가 콜백 주입 ──
type SendMessageFn = (agentId: string, message: string) => Promise<void>
let _sendMessage: SendMessageFn | null = null

export function setSendMessage(fn: SendMessageFn): void {
  _sendMessage = fn
}

// 감시 대상 프로세스
interface WatchedProcess {
  agentId: string
  process: ChildProcess
  startedAt: number
  lastOutputAt: number // stdout 출력 시마다 갱신
}

const watchedProcesses = new Map<string, WatchedProcess>()

// 타임아웃 설정
const HEARTBEAT_TIMEOUT = 120_000 // 2분 무출력 → stuck 판정
const MAX_PROCESS_RUNTIME = 300_000 // 5분 절대 타임아웃
const DIRECTOR_FAILOVER_MS = 180_000 // 3분 → 장애조치
const CHECK_INTERVAL = 15_000 // 15초마다 체크

let watchdogInterval: ReturnType<typeof setInterval> | null = null

// 프로세스 등록 — runClaudeSession에서 spawn 직후 호출
export function registerProcess(agentId: string, proc: ChildProcess): void {
  const now = Date.now()
  watchedProcesses.set(agentId, {
    agentId,
    process: proc,
    startedAt: now,
    lastOutputAt: now
  })
  console.log(`[watchdog] 프로세스 등록: ${agentId} (pid: ${proc.pid})`)
}

// 프로세스 해제 — finishSession/에러에서 호출
export function unregisterProcess(agentId: string): void {
  if (watchedProcesses.has(agentId)) {
    watchedProcesses.delete(agentId)
    console.log(`[watchdog] 프로세스 해제: ${agentId}`)
  }
}

// 하트비트 갱신 — stdout data 이벤트에서 호출
export function updateHeartbeat(agentId: string): void {
  const watched = watchedProcesses.get(agentId)
  if (watched) {
    watched.lastOutputAt = Date.now()
  }
}

// 백업 디렉터 찾기 — 장애 발생한 디렉터를 제외한 다른 디렉터
export function findBackupDirector(
  failedDirectorId: string
): import('../../shared/types').AgentConfig | null {
  const agents = agentManager.listAgents()
  return agents.find((a) => a.hierarchy?.role === 'director' && a.id !== failedDirectorId) ?? null
}

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

// 모든 감시 프로세스 점검
function checkAllProcesses(): void {
  const now = Date.now()

  for (const [agentId, watched] of watchedProcesses) {
    const config = store.getAgent(agentId)
    const agentName = config?.name ?? agentId
    const role = config?.hierarchy?.role

    // 1. 하트비트 타임아웃 (2분 무출력)
    if (now - watched.lastOutputAt > HEARTBEAT_TIMEOUT) {
      console.warn(
        `[watchdog] ${agentName} stuck 판정 (${Math.round((now - watched.lastOutputAt) / 1000)}초 무출력)`
      )
      logActivity(
        'error',
        agentId,
        agentName,
        `프로세스 무응답 (${Math.round((now - watched.lastOutputAt) / 1000)}초)`
      )

      killStuckProcess(agentId, watched, '하트비트 타임아웃')

      // 디렉터면 장애조치
      if (role === 'director') {
        triggerDirectorFailover(agentId, agentName)
      }
      continue
    }

    // 2. 절대 타임아웃 (5분)
    if (now - watched.startedAt > MAX_PROCESS_RUNTIME) {
      console.warn(
        `[watchdog] ${agentName} 절대 타임아웃 (${Math.round((now - watched.startedAt) / 1000)}초)`
      )
      logActivity('error', agentId, agentName, `프로세스 절대 타임아웃 (5분 초과)`)

      killStuckProcess(agentId, watched, '절대 타임아웃')

      if (role === 'director') {
        triggerDirectorFailover(agentId, agentName)
      }
      continue
    }

    // 3. 디렉터 장기 실행 (3분) → 경고
    if (role === 'director' && now - watched.startedAt > DIRECTOR_FAILOVER_MS) {
      console.warn(
        `[watchdog] Director ${agentName} 장시간 실행 중 (${Math.round((now - watched.startedAt) / 1000)}초)`
      )
    }
  }
}

// stuck 프로세스 강제 종료
function killStuckProcess(agentId: string, watched: WatchedProcess, reason: string): void {
  const proc = watched.process
  watchedProcesses.delete(agentId)

  try {
    if (!proc.killed) {
      proc.kill('SIGKILL')
    }
  } catch {
    // 이미 종료됨
  }

  agentManager.setAgentStatus(agentId, 'error')
  broadcast('agent:status-changed', agentId, { id: agentId, status: 'error' })

  const config = store.getAgent(agentId)
  if (config) {
    broadcast('watchdog:process-killed', {
      agentId,
      agentName: config.name,
      reason
    })
  }
}

// 디렉터 장애조치 — 백업 디렉터에게 인수 요청 또는 자가복구
function triggerDirectorFailover(failedDirectorId: string, failedDirectorName: string): void {
  const backup = findBackupDirector(failedDirectorId)

  if (backup) {
    // 백업 디렉터가 있으면 인수 요청
    console.log(`[watchdog] 디렉터 장애조치: ${failedDirectorName} → ${backup.name} 인수`)
    logActivity(
      'error',
      failedDirectorId,
      failedDirectorName,
      `디렉터 장애 → ${backup.name}이 인수`
    )

    broadcast('watchdog:director-failover', {
      failedDirectorId,
      failedDirectorName,
      backupDirectorId: backup.id,
      backupDirectorName: backup.name
    })

    // 백업 디렉터에게 자동 메시지 전송
    if (_sendMessage) {
      const sendMsg = _sendMessage
      setImmediate(async () => {
        try {
          await sendMsg(
            backup.id,
            `[자동 장애조치] Director "${failedDirectorName}"이 응답 불능 상태입니다. ` +
              `진행 중이던 작업을 인수하여 계속 진행해주세요. ` +
              `현재 팀 상태를 확인하고 미완료 작업이 있으면 이어서 처리하세요.`
          )
        } catch (err) {
          console.error(`[watchdog] 백업 디렉터 ${backup.name}에게 인수 요청 실패:`, err)
        }
      })
    }
  } else {
    // ★ 백업 디렉터 없음 → 총괄 자가복구
    console.log(`[watchdog] 백업 디렉터 없음 → ${failedDirectorName} 자가복구 모드`)
    logActivity('error', failedDirectorId, failedDirectorName, `디렉터 장애 → 자가복구 모드`)

    // 1. 에이전트 상태를 idle로 리셋
    agentManager.setAgentStatus(failedDirectorId, 'idle')
    broadcast('agent:status-changed', failedDirectorId, { id: failedDirectorId, status: 'idle' })

    // 2. 총괄 에이전트가 아예 없어진 경우 → 재생성
    const agents = agentManager.listAgents()
    const hasDirector = agents.some((a) => a.hierarchy?.role === 'director' && !a.group)
    if (!hasDirector) {
      console.log(`[watchdog] 총괄 에이전트 없음 → 새 총괄 재생성`)
      setImmediate(async () => {
        try {
          const { resetAndSeedHierarchy } = await import('./default-agents')
          resetAndSeedHierarchy()
          broadcast('watchdog:director-respawned', {
            failedDirectorId,
            failedDirectorName,
            message: `총괄이 완전히 재생성되었습니다.`
          })
          logActivity(
            'agent-created',
            failedDirectorId,
            failedDirectorName,
            `총괄 완전 재생성 (워치독)`
          )
        } catch (err) {
          console.error('[watchdog] 총괄 재생성 실패:', err)
        }
      })
    } else {
      // 3. 기존 총괄 살아있으면 단순 알림
      broadcast('watchdog:director-self-recovery', {
        failedDirectorId,
        failedDirectorName,
        message: `총괄 ${failedDirectorName}이(가) 재시작되었습니다.`
      })
    }

    logActivity(
      'status-change',
      failedDirectorId,
      failedDirectorName,
      `총괄 자가복구 완료 (워치독)`
    )
  }
}

// 워치독 시작
export function startWatchdog(): void {
  if (watchdogInterval) return
  watchdogInterval = setInterval(checkAllProcesses, CHECK_INTERVAL)
  console.log('[watchdog] 프로세스 워치독 시작 (15초 인터벌)')
}

// 워치독 중지
export function stopWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval)
    watchdogInterval = null
    console.log('[watchdog] 프로세스 워치독 중지')
  }
}

// 현재 감시 중인 프로세스 수
export function getWatchedCount(): number {
  return watchedProcesses.size
}

// 특정 에이전트의 감시 정보 조회
export function getWatchedInfo(
  agentId: string
): { startedAt: number; lastOutputAt: number } | null {
  const watched = watchedProcesses.get(agentId)
  if (!watched) return null
  return { startedAt: watched.startedAt, lastOutputAt: watched.lastOutputAt }
}
