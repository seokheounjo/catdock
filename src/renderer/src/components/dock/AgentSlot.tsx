import { AgentConfig, AgentStatus } from '../../../../shared/types'
import { FishingCat } from './FishingCat'

interface Props {
  agent: AgentConfig
  status: AgentStatus
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function AgentSlot({ agent, status, onClick, onContextMenu }: Props) {
  return (
    <button
      className="fishing-slot flex flex-col items-center gap-0 cursor-pointer bg-transparent border-none outline-none p-0"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={`${agent.name} — ${agent.role}`}
    >
      <FishingCat status={status} />
      <span className="text-[9px] text-white/40 truncate max-w-[56px] leading-none">{agent.name}</span>
    </button>
  )
}
