import { useState } from 'react'

type ActionType = 'OPEN_URL' | 'RUN_CMD' | 'OPEN_FILE'

interface ActionBlockProps {
  type: ActionType
  label: string
  target: string
}

export function ActionBlock({ type, label, target }: ActionBlockProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [output, setOutput] = useState<string | null>(null)

  const handleOpenUrl = async () => {
    setStatus('loading')
    const result = await window.api.shell.openExternal(target)
    setStatus(result.success ? 'done' : 'error')
    if (!result.success) setOutput(result.error || '열기 실패')
  }

  const handleRunCmd = async () => {
    setStatus('loading')
    setOutput(null)
    const result = await window.api.shell.runCommand(target)
    if (result.success) {
      setStatus('done')
      setOutput(result.stdout?.trim() || '(출력 없음)')
    } else {
      setStatus('error')
      setOutput(result.error || result.stderr || '실행 실패')
    }
  }

  const handleOpenFile = async () => {
    setStatus('loading')
    const result = await window.api.shell.openPath(target)
    setStatus(result.success ? 'done' : 'error')
    if (!result.success) setOutput(result.error || '열기 실패')
  }

  const handleClick = () => {
    if (status === 'loading') return
    if (type === 'OPEN_URL') handleOpenUrl()
    else if (type === 'RUN_CMD') handleRunCmd()
    else if (type === 'OPEN_FILE') handleOpenFile()
  }

  // 아이콘 + 스타일 — 타입별 차별화
  const config = {
    OPEN_URL: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      ),
      color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20'
    },
    RUN_CMD: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
      color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20'
    },
    OPEN_FILE: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      ),
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'
    }
  }

  const { icon, color } = config[type]

  return (
    <div className="my-2">
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm
                   font-medium transition-all cursor-pointer disabled:opacity-50
                   disabled:cursor-wait ${color}`}
      >
        {status === 'loading' ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        ) : (
          icon
        )}
        <span>{label}</span>
        {status === 'done' && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {status === 'error' && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
      </button>

      {/* 대상 경로/URL 작게 표시 */}
      <span className="ml-2 text-[11px] text-text-muted opacity-70">{target}</span>

      {/* RUN_CMD 실행 결과 출력 */}
      {output && type === 'RUN_CMD' && (
        <pre className="mt-1.5 px-3 py-2 rounded-md bg-black/30 text-xs text-text-muted
                       overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
          {output}
        </pre>
      )}

      {/* 에러 메시지 */}
      {output && status === 'error' && type !== 'RUN_CMD' && (
        <p className="mt-1 text-xs text-red-400">{output}</p>
      )}
    </div>
  )
}
