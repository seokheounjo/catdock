import { AgentConfig, AgentStatus } from '../../../../shared/types'
import { FishingCat } from './FishingCat'

interface Props {
  agent: AgentConfig
  status: AgentStatus
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function AgentSlot({ agent, status, onClick, onContextMenu }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    } else if (e.key === 'ContextMenu' && onContextMenu) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const mockEvent = {
        preventDefault: () => {},
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      } as React.MouseEvent
      onContextMenu(mockEvent)
    }
  }

  // 상태에 따른 적절한 ARIA 설명
  const statusDescription = {
    'idle': '대기 중',
    'working': '작업 중',
    'error': '오류 상태'
  }[status] || '알 수 없음'

  return (
    <button
      className="fishing-slot flex flex-col items-center gap-0 cursor-pointer bg-transparent border-none p-0
                 focus:outline-2 focus:outline-accent focus:outline-offset-2 focus:ring-2 focus:ring-accent/50
                 transition-all duration-200"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      aria-label={`${agent.name} 에이전트와 채팅하기`}
      aria-describedby={`agent-${agent.id}-status`}
      title={`${agent.name} — ${agent.role}`}
    >
      <FishingCat status={status} />
      <div className="flex flex-col items-center">
        <span className="text-[9px] text-white/70 truncate max-w-[56px] leading-none">{agent.name}</span>
        <span
          id={`agent-${agent.id}-status`}
          className="text-[8px] text-white/50 sr-only"
        >
          상태: {statusDescription}
        </span>
      </div>
    </button>
  )
}
