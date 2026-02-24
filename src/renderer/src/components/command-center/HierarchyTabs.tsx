import { AgentConfig, AgentStatus } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'

interface HierarchyTabsProps {
  leaders: AgentConfig[]
  activeLeaderId: string | null
  statuses: Map<string, AgentStatus>
  onSelect: (leaderId: string) => void
}

export function HierarchyTabs({ leaders, activeLeaderId, statuses, onSelect }: HierarchyTabsProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 overflow-x-auto shrink-0">
      {leaders.map((leader) => {
        const isActive = leader.id === activeLeaderId
        const status = statuses.get(leader.id) || 'idle'
        const statusColor = status === 'working' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-400'
        const avatarUrl = generateAvatar(leader.avatar.style, leader.avatar.seed)

        return (
          <button
            key={leader.id}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
              border-none cursor-pointer shrink-0
              ${isActive
                ? 'bg-accent/20 text-accent border border-accent/30'
                : 'bg-white/5 text-text-secondary hover:bg-white/10'
              }`}
            onClick={() => onSelect(leader.id)}
          >
            <img
              className="w-5 h-5 rounded-full shrink-0"
              src={avatarUrl}
              alt={leader.name}
            />
            <span className="truncate max-w-[100px]">{leader.name}</span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
          </button>
        )
      })}
    </div>
  )
}
