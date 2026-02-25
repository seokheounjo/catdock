// 에러 복구 오케스트레이터 — 다단계 에스컬레이션 (member→leader→director→자가복구)
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { ErrorRecoveryEvent, ErrorRecoveryStatus } from '../../shared/types'
import * as agentManager from './agent-manager'
import * as sessionManager from './session-manager'
import { logActivity } from './activity-logger'
import { findBackupDirector } from './process-watchdog'

// 진행 중인 복구 이벤트
const activeRecoveries = new Map<string, ErrorRecoveryEvent>()

// 동일 에이전트에 대한 연속 복구 방지 (쿨다운 15초)
const lastRecoveryTime = new Map<string, number>()
const RECOVERY_COOLDOWN_MS = 15_000

// 총괄 자가복구 최대 재시도 횟수
const MAX_SELF_RECOVERY_ATTEMPTS = 3
const selfRecoveryAttempts = new Map<string, number>()

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

/**
 * 에이전트 에러 발생 시 호출 — 다단계 에스컬레이션
 * member → leader → director → 자가복구
 */
export async function handleAgentError(agentId: string, error: string): Promise<void> {
  // 쿨다운 체크
  const lastTime = lastRecoveryTime.get(agentId)
  if (lastTime && Date.now() - lastTime < RECOVERY_COOLDOWN_MS) {
    console.log(`[error-recovery] ${agentId} 쿨다운 중 (15초), 복구 스킵`)
    return
  }

  const agentState = agentManager.getAgentState(agentId)
  if (!agentState) return

  const role = agentState.config.hierarchy?.role

  // 이미 해당 에이전트에 대한 복구가 진행 중이면 스킵
  for (const [, recovery] of activeRecoveries) {
    if (
      recovery.agentId === agentId &&
      (recovery.status === 'recovering' || recovery.status === 'leader-notified')
    ) {
      console.log(`[error-recovery] ${agentId} 이미 복구 진행 중`)
      return
    }
  }

  // Director 에러 → 백업 디렉터 또는 자가복구
  if (role === 'director') {
    await escalateDirectorError(agentId, agentState.config.name, error)
    return
  }

  // 상위자 찾기 (member→leader, leader→director)
  const superior = agentManager.findSuperiorForAgent(agentId)
  if (!superior) {
    console.log(`[error-recovery] ${agentId}의 상위자를 찾을 수 없음, 복구 스킵`)
    return
  }

  // 복구 이벤트 생성
  const recoveryEvent: ErrorRecoveryEvent = {
    id: uuid(),
    agentId,
    agentName: agentState.config.name,
    leaderId: superior.id,
    leaderName: superior.name,
    error,
    status: 'detected',
    startedAt: Date.now()
  }
  activeRecoveries.set(recoveryEvent.id, recoveryEvent)
  lastRecoveryTime.set(agentId, Date.now())

  // 브로드캐스트: 복구 시작
  updateRecoveryStatus(recoveryEvent.id, 'leader-notified')
  broadcast('error-recovery:started', recoveryEvent)

  // 에러 로그 수집
  const errorLog = sessionManager.getErrorLog(agentId).slice(-20).join('\n')

  // 상위자에게 자동 메시지
  const superiorRole = superior.hierarchy?.role === 'director' ? 'Director' : 'Team Lead'
  const message = `[자동 보고] "${agentState.config.name}" (${agentState.config.role}) 에러 발생.
에러: ${error}
최근 로그:
\`\`\`
${errorLog}
\`\`\`
이 문제를 분석하고, 필요하면 해당 팀원에게 수정 작업을 지시해주세요.`

  logActivity(
    'error',
    agentId,
    agentState.config.name,
    `에러 복구 시도 — ${superiorRole} ${superior.name}에게 보고`,
    {
      recoveryId: recoveryEvent.id,
      leaderId: superior.id
    }
  )

  try {
    updateRecoveryStatus(recoveryEvent.id, 'recovering')
    await sessionManager.sendMessage(superior.id, message)
    updateRecoveryStatus(recoveryEvent.id, 'resolved')
    logActivity(
      'status-change',
      agentId,
      agentState.config.name,
      `에러 복구 완료 — ${superiorRole} ${superior.name} 개입`
    )
  } catch (err) {
    console.error(`[error-recovery] ${superiorRole} ${superior.name}에게 보고 실패:`, err)
    updateRecoveryStatus(recoveryEvent.id, 'failed')

    // 상위자에게 보고 실패 시 한 단계 더 에스컬레이션
    try {
      if (superior.hierarchy?.role === 'leader') {
        console.log(`[error-recovery] 리더 ${superior.name} 보고 실패 → 디렉터로 에스컬레이션`)
        await handleAgentError(
          superior.id,
          `리더 ${superior.name} 응답 불능: ${(err as Error).message}`
        )
      } else if (superior.hierarchy?.role === 'director') {
        console.log(`[error-recovery] 디렉터 ${superior.name} 보고 실패 → 자가복구 시도`)
        await escalateDirectorError(superior.id, superior.name, `디렉터 ${superior.name} 응답 불능`)
      }
    } catch (escalateErr) {
      console.error(`[error-recovery] 에스컬레이션 실패:`, escalateErr)
    }
  }
}

// 총괄 에러 에스컬레이션 — 백업 디렉터 또는 자가복구
async function escalateDirectorError(
  failedDirectorId: string,
  failedDirectorName: string,
  error: string
): Promise<void> {
  // 1. 백업 디렉터가 있으면 인수 (기존 로직)
  const backup = findBackupDirector(failedDirectorId)
  if (backup) {
    await escalateToBackupDirector(failedDirectorId, failedDirectorName, error, backup)
    return
  }

  // 2. 백업 없으면 자가복구
  await selfRecoverDirector(failedDirectorId, failedDirectorName, error)
}

// 백업 디렉터로 에스컬레이션
async function escalateToBackupDirector(
  failedDirectorId: string,
  failedDirectorName: string,
  error: string,
  backup: import('../../shared/types').AgentConfig
): Promise<void> {
  lastRecoveryTime.set(failedDirectorId, Date.now())

  const recoveryEvent: ErrorRecoveryEvent = {
    id: uuid(),
    agentId: failedDirectorId,
    agentName: failedDirectorName,
    leaderId: backup.id,
    leaderName: backup.name,
    error,
    status: 'detected',
    startedAt: Date.now()
  }
  activeRecoveries.set(recoveryEvent.id, recoveryEvent)

  updateRecoveryStatus(recoveryEvent.id, 'leader-notified')
  broadcast('error-recovery:started', recoveryEvent)

  const message = `[자동 장애조치] Director "${failedDirectorName}" 에러 발생.
에러: ${error}
해당 디렉터의 작업을 인수하여 계속 진행해주세요. 현재 팀 상태를 확인하고 미완료 작업을 이어서 처리하세요.`

  logActivity(
    'error',
    failedDirectorId,
    failedDirectorName,
    `디렉터 에러 → 백업 ${backup.name}에게 인수 요청`
  )

  try {
    updateRecoveryStatus(recoveryEvent.id, 'recovering')
    await sessionManager.sendMessage(backup.id, message)
    updateRecoveryStatus(recoveryEvent.id, 'resolved')
    logActivity(
      'status-change',
      failedDirectorId,
      failedDirectorName,
      `디렉터 에러 복구 완료 — ${backup.name} 인수`
    )
  } catch (err) {
    console.error(`[error-recovery] 백업 디렉터 ${backup.name}에게 인수 요청 실패:`, err)
    updateRecoveryStatus(recoveryEvent.id, 'failed')
  }
}

// ★ 총괄 자가복구 — 백업 디렉터가 없을 때
async function selfRecoverDirector(
  failedDirectorId: string,
  failedDirectorName: string,
  error: string
): Promise<void> {
  const attempts = (selfRecoveryAttempts.get(failedDirectorId) || 0) + 1
  selfRecoveryAttempts.set(failedDirectorId, attempts)

  if (attempts > MAX_SELF_RECOVERY_ATTEMPTS) {
    console.error(
      `[error-recovery] 총괄 ${failedDirectorName} 자가복구 한도 초과 (${MAX_SELF_RECOVERY_ATTEMPTS}회) — 총괄 재생성`
    )

    // ★ 총괄 완전 재생성 — 기존 총괄 삭제 후 새로 시드
    try {
      const { resetAndSeedHierarchy } = await import('./default-agents')
      agentManager.deleteAgent(failedDirectorId)
      const count = resetAndSeedHierarchy()
      broadcast('error-recovery:director-respawned', {
        oldAgentId: failedDirectorId,
        oldAgentName: failedDirectorName,
        error,
        attempts,
        newAgentCount: count
      })
      logActivity(
        'agent-created',
        failedDirectorId,
        failedDirectorName,
        `총괄 자가복구 한도 초과 → 새 총괄 재생성`
      )
      selfRecoveryAttempts.delete(failedDirectorId)
      return
    } catch (respawnErr) {
      console.error('[error-recovery] 총괄 재생성 실패:', respawnErr)
      broadcast('error-recovery:director-unrecoverable', {
        agentId: failedDirectorId,
        agentName: failedDirectorName,
        error,
        attempts
      })
      logActivity(
        'error',
        failedDirectorId,
        failedDirectorName,
        `총괄 재생성 실패 — 사용자 개입 필요`
      )
      return
    }
  }

  console.log(
    `[error-recovery] 총괄 ${failedDirectorName} 자가복구 시도 ${attempts}/${MAX_SELF_RECOVERY_ATTEMPTS}`
  )
  lastRecoveryTime.set(failedDirectorId, Date.now())

  const recoveryEvent: ErrorRecoveryEvent = {
    id: uuid(),
    agentId: failedDirectorId,
    agentName: failedDirectorName,
    leaderId: failedDirectorId, // 자기 자신
    leaderName: failedDirectorName,
    error,
    status: 'detected',
    startedAt: Date.now()
  }
  activeRecoveries.set(recoveryEvent.id, recoveryEvent)

  updateRecoveryStatus(recoveryEvent.id, 'recovering')
  broadcast('error-recovery:started', recoveryEvent)
  broadcast('error-recovery:self-recovery', {
    agentId: failedDirectorId,
    agentName: failedDirectorName,
    attempt: attempts,
    maxAttempts: MAX_SELF_RECOVERY_ATTEMPTS
  })

  try {
    // 1. 에이전트 상태를 idle로 리셋
    agentManager.setAgentStatus(failedDirectorId, 'idle')
    broadcast('agent:status-changed', failedDirectorId, { id: failedDirectorId, status: 'idle' })

    // 2. 세션 초기화 (기존 세션 종료)
    sessionManager.abortSession(failedDirectorId)

    // 3. 사용자에게 알림
    broadcast('error-recovery:director-restarted', {
      agentId: failedDirectorId,
      agentName: failedDirectorName,
      attempt: attempts
    })

    updateRecoveryStatus(recoveryEvent.id, 'resolved')
    logActivity(
      'status-change',
      failedDirectorId,
      failedDirectorName,
      `총괄 자가복구 완료 (시도 ${attempts}회)`
    )

    // 자가복구 성공 시 카운터 리셋
    selfRecoveryAttempts.set(failedDirectorId, 0)
  } catch (err) {
    console.error(`[error-recovery] 총괄 자가복구 실패:`, err)
    updateRecoveryStatus(recoveryEvent.id, 'failed')
    logActivity(
      'error',
      failedDirectorId,
      failedDirectorName,
      `총괄 자가복구 실패 (시도 ${attempts}회): ${(err as Error).message}`
    )
  }
}

function updateRecoveryStatus(recoveryId: string, status: ErrorRecoveryStatus): void {
  const event = activeRecoveries.get(recoveryId)
  if (!event) return
  event.status = status
  if (status === 'resolved' || status === 'failed') {
    event.resolvedAt = Date.now()
  }
  broadcast('error-recovery:status-changed', event)
}

/**
 * 현재 진행 중인 모든 복구 이벤트 반환
 */
export function getActiveRecoveries(): ErrorRecoveryEvent[] {
  return Array.from(activeRecoveries.values()).filter(
    (e) => e.status === 'leader-notified' || e.status === 'recovering'
  )
}

/**
 * 특정 에이전트에 대한 복구가 진행 중인지 확인
 */
export function isRecovering(agentId: string): boolean {
  for (const [, event] of activeRecoveries) {
    if (
      event.agentId === agentId &&
      (event.status === 'leader-notified' || event.status === 'recovering')
    ) {
      return true
    }
  }
  return false
}

/**
 * 완료된 복구 이벤트 정리 (1시간 이상 지난 것)
 */
export function cleanupOldRecoveries(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [id, event] of activeRecoveries) {
    if (event.resolvedAt && event.resolvedAt < oneHourAgo) {
      activeRecoveries.delete(id)
    }
  }
}
