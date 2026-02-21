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
    status === 'working' ? 'Working...' : status === 'error' ? 'Error' : 'Online'
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
          className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center cursor-pointer bg-transparent border-none text-xs"
          title="Clear chat"
        >
          &#x1f5d1;
        </button>
        <button
          onClick={onMinimize}
          className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center cursor-pointer bg-transparent border-none"
          title="Minimize"
        >
          &#x2500;
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-danger/20 text-white/40 hover:text-danger flex items-center justify-center cursor-pointer bg-transparent border-none"
          title="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  )
}
