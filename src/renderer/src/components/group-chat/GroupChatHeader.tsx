import { AgentConfig, ConversationMode, ConversationStatus } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'

interface GroupChatHeaderProps {
  name: string
  participants: AgentConfig[]
  status: ConversationStatus
  mode: ConversationMode
  onToggleMode: () => void
  onMinimize: () => void
  onClose: () => void
  onClear: () => void
}

export function GroupChatHeader({
  name,
  participants,
  status,
  mode,
  onToggleMode,
  onMinimize,
  onClose,
  onClear
}: GroupChatHeaderProps) {
  const statusLabel =
    status === 'chaining' ? 'Chaining...' :
    status === 'paused' ? 'Paused' :
    status === 'waiting-agent' ? 'Agent working...' :
    'Idle'

  const statusColor =
    status === 'chaining' || status === 'waiting-agent' ? 'text-accent' :
    status === 'paused' ? 'text-yellow-400' :
    'text-success'

  return (
    <div className="flex flex-col bg-chat-sidebar border-b border-white/5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* 상단: 제목 + 컨트롤 */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{name}</div>
          <div className={`text-xs ${statusColor}`}>{statusLabel}</div>
        </div>

        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* 모드 토글 */}
          <button
            onClick={onToggleMode}
            className={`px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer border-none transition-all ${
              mode === 'auto-chain'
                ? 'bg-accent/20 text-accent'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
            title={mode === 'auto-chain' ? 'Auto Chain Mode' : 'Manual Mode'}
          >
            {mode === 'auto-chain' ? 'Auto' : 'Manual'}
          </button>

          <button
            onClick={onClear}
            className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center cursor-pointer bg-transparent border-none text-xs"
            title="Clear"
          >&#x1f5d1;</button>
          <button
            onClick={onMinimize}
            className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center cursor-pointer bg-transparent border-none"
            title="Minimize"
          >&#x2500;</button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-danger/20 text-white/40 hover:text-danger flex items-center justify-center cursor-pointer bg-transparent border-none"
            title="Close"
          >&#x2715;</button>
        </div>
      </div>

      {/* 하단: 참여자 아바타 */}
      <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {participants.map((agent) => (
          <div key={agent.id} className="flex items-center gap-1 shrink-0">
            <img
              src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
              alt={agent.name}
              className="w-5 h-5 rounded-full"
            />
            <span className="text-[10px] text-white/50">{agent.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
