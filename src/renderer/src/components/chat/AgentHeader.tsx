import { AgentConfig, AgentStatus } from '../../../../shared/types'
import fishingImg from '../../assets/cats/fishing.png'
import caughtImg from '../../assets/cats/caught.png'
import biteImg from '../../assets/cats/bite.png'

interface AgentHeaderProps {
  agent: AgentConfig
  status: AgentStatus
  onMinimize: () => void
  onClose: () => void
  onClear: () => void
}

const catImgMap: Record<string, string> = {
  working: fishingImg,
  idle: caughtImg,
  error: biteImg,
}

export function AgentHeader({ agent, status, onMinimize, onClose, onClear }: AgentHeaderProps) {
  const catSrc = catImgMap[status] || caughtImg

  const statusLabel =
    status === 'working' ? '작업 중...' : status === 'error' ? '오류' : '온라인'
  const statusColor =
    status === 'working'
      ? 'text-accent'
      : status === 'error'
        ? 'text-danger'
        : 'text-success'

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-chat-sidebar border-b border-white/5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 shrink-0">
        <img src={catSrc} alt={agent.name} className="w-full h-full object-contain" draggable={false} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{agent.name}</div>
        <div className={`text-xs ${statusColor}`}>{agent.role} · {statusLabel}</div>
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onClear}
          className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80
                     flex items-center justify-center cursor-pointer bg-transparent border-none text-xs
                     focus:outline-2 focus:outline-accent focus:outline-offset-1 transition-all duration-200"
          title="채팅 기록 지우기"
          aria-label="채팅 기록 지우기"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
        <button
          onClick={onMinimize}
          className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80
                     flex items-center justify-center cursor-pointer bg-transparent border-none
                     focus:outline-2 focus:outline-accent focus:outline-offset-1 transition-all duration-200"
          title="최소화"
          aria-label="창 최소화"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 12h12"/>
          </svg>
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-danger/20 text-white/40 hover:text-danger
                     flex items-center justify-center cursor-pointer bg-transparent border-none
                     focus:outline-2 focus:outline-danger focus:outline-offset-1 transition-all duration-200"
          title="창 닫기"
          aria-label="창 닫기"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
