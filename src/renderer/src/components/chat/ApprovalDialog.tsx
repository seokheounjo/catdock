import { useState, useEffect, useCallback } from 'react'
import { ApprovalRequest } from '../../../../shared/types'

interface ApprovalDialogProps {
  request: ApprovalRequest
  onRespond: (requestId: string, approved: boolean) => void
}

const typeLabels: Record<string, string> = {
  delegation: '작업 위임',
  'agent-spawn': '에이전트 생성',
  'budget-override': '예산 오버라이드'
}

const TIMEOUT_SECONDS = 120

export function ApprovalDialog({ request, onRespond }: ApprovalDialogProps) {
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onRespond(request.id, false)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [request.id, onRespond])

  const handleApprove = useCallback(() => {
    onRespond(request.id, true)
  }, [request.id, onRespond])

  const handleReject = useCallback(() => {
    onRespond(request.id, false)
  }, [request.id, onRespond])

  return (
    <div className="mx-4 my-2 bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="text-indigo-300 text-sm font-medium">
          승인 요청 — {typeLabels[request.type] ?? request.type}
        </span>
        <span className="text-text-muted text-xs ml-auto">
          {request.requestedByName} &middot; {countdown}초
        </span>
      </div>

      <div className="bg-black/30 rounded-lg p-3 mb-3">
        <div className="text-text text-sm leading-relaxed">{request.description}</div>
        {request.metadata && Object.keys(request.metadata).length > 0 && (
          <pre className="text-text-secondary text-xs font-mono mt-2 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
            {JSON.stringify(request.metadata, null, 2)}
          </pre>
        )}
      </div>

      {/* 카운트다운 바 */}
      <div className="w-full h-1 bg-white/10 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-indigo-400/60 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${(countdown / TIMEOUT_SECONDS) * 100}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className="flex-1 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-sm font-medium rounded-lg transition-colors"
        >
          승인
        </button>
        <button
          onClick={handleReject}
          className="flex-1 px-4 py-2 bg-red-600/80 hover:bg-red-500/80 text-white text-sm font-medium rounded-lg transition-colors"
        >
          거부
        </button>
      </div>
    </div>
  )
}
