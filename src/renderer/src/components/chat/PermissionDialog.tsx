import { useState, useEffect, useCallback } from 'react'
import { PermissionRequest } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

interface PermissionDialogProps {
  request: PermissionRequest
  onRespond: (requestId: string, allowed: boolean) => void
}

export function PermissionDialog({ request, onRespond }: PermissionDialogProps) {
  const { t } = useI18n()
  const [countdown, setCountdown] = useState(60)

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

  const handleAllow = useCallback(() => {
    onRespond(request.id, true)
  }, [request.id, onRespond])

  const handleDeny = useCallback(() => {
    onRespond(request.id, false)
  }, [request.id, onRespond])

  // 도구 입력을 읽기 쉽게 포맷
  const formatInput = (input: Record<string, unknown>): string => {
    if (!input || Object.keys(input).length === 0) return t('permission.noInput')
    try {
      return JSON.stringify(input, null, 2)
    } catch {
      return String(input)
    }
  }

  return (
    <div className="mx-4 my-2 bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-300 text-sm font-medium">{t('permission.title')}</span>
        <span className="text-text-muted text-xs ml-auto">
          {request.agentName} &middot; {t('permission.seconds', { count: String(countdown) })}
        </span>
      </div>

      <div className="bg-black/30 rounded-lg p-3 mb-3">
        <div className="text-text-secondary text-xs mb-1">{t('permission.tool')}</div>
        <div className="text-text text-sm font-mono">{request.toolName}</div>

        <div className="text-text-secondary text-xs mt-2 mb-1">{t('permission.input')}</div>
        <pre className="text-text-secondary text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {formatInput(request.toolInput)}
        </pre>
      </div>

      {/* 카운트다운 바 */}
      <div className="w-full h-1 bg-white/10 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-amber-400/60 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${(countdown / 60) * 100}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleAllow}
          className="flex-1 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t('permission.allow')}
        </button>
        <button
          onClick={handleDeny}
          className="flex-1 px-4 py-2 bg-red-600/80 hover:bg-red-500/80 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {t('permission.deny')}
        </button>
      </div>
    </div>
  )
}
