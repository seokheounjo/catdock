// 승인 게이트 — 위임/에이전트 생성 시 사용자 승인 대기
// permission-server.ts의 패턴을 재사용
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { ApprovalRequest, ApprovalType } from '../../shared/types'
import * as store from './store'
import { logActivity } from './activity-logger'

interface PendingApproval {
  request: ApprovalRequest
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

const pendingApprovals = new Map<string, PendingApproval>()
const APPROVAL_TIMEOUT_MS = 120_000 // 120초 (위임은 복잡하므로 2분)

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

/**
 * 승인 요청을 생성하고 사용자 응답을 기다린다.
 * 설정에서 승인이 비활성화되어 있으면 즉시 true 반환.
 */
export async function requestApproval(
  type: ApprovalType,
  requestedBy: string,
  requestedByName: string,
  description: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const settings = store.getSettings()

  // 설정에서 비활성화된 경우 즉시 승인
  if (type === 'delegation' && !settings.requireDelegationApproval) return true
  if (type === 'agent-spawn' && !settings.requireAgentSpawnApproval) return true
  if (type === 'budget-override') {
    // 예산 오버라이드는 항상 승인 필요
  }

  const request: ApprovalRequest = {
    id: uuid(),
    type,
    requestedBy,
    requestedByName,
    description,
    metadata,
    timestamp: Date.now(),
    status: 'pending'
  }

  console.log(`[approval-gate] 승인 요청: ${type} by ${requestedByName} — ${description}`)
  logActivity('approval-requested', requestedBy, requestedByName, `승인 요청: ${description}`)

  // 렌더러에 브로드캐스트
  broadcast('approval:request', request)

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(request.id)
      request.status = 'timeout'
      broadcast('approval:resolved', request)
      console.log(`[approval-gate] 타임아웃: ${request.id}`)
      resolve(false) // 타임아웃 시 거부
    }, APPROVAL_TIMEOUT_MS)

    pendingApprovals.set(request.id, { request, resolve, timer })
  })
}

/**
 * 사용자가 승인/거부 응답
 */
export function respondToApproval(requestId: string, approved: boolean): void {
  const pending = pendingApprovals.get(requestId)
  if (!pending) {
    console.warn(`[approval-gate] 알 수 없는 requestId: ${requestId}`)
    return
  }
  clearTimeout(pending.timer)
  pendingApprovals.delete(requestId)
  pending.request.status = approved ? 'approved' : 'rejected'

  logActivity(
    'approval-resolved',
    pending.request.requestedBy,
    pending.request.requestedByName,
    `${approved ? '승인' : '거부'}: ${pending.request.description}`
  )
  broadcast('approval:resolved', pending.request)
  console.log(`[approval-gate] ${approved ? '승인' : '거부'}: ${pending.request.id}`)
  pending.resolve(approved)
}

/**
 * 대기 중인 승인 목록
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return Array.from(pendingApprovals.values()).map((p) => p.request)
}

/**
 * 모든 대기 중 승인 거부 (앱 종료 시)
 */
export function rejectAllPending(): void {
  for (const [id, pending] of pendingApprovals) {
    clearTimeout(pending.timer)
    pending.resolve(false)
    pendingApprovals.delete(id)
  }
}
