import { AgentConfig, ConversationStatus } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'

interface ParticipantBarProps {
  participants: AgentConfig[]
  currentAgentId: string | null
  status: ConversationStatus
  onTriggerAgent: (agentId: string) => void
}

export function ParticipantBar({ participants, currentAgentId, status, onTriggerAgent }: ParticipantBarProps) {
  const isActive = status === 'chaining' || status === 'waiting-agent'

  return (
    <div className="px-4 py-2 bg-chat-sidebar border-t border-white/5">
      <div className="text-[10px] text-white/30 mb-1.5">Trigger agent manually</div>
      <div className="flex gap-2 overflow-x-auto">
        {participants.map((agent) => {
          const isCurrent = agent.id === currentAgentId
          return (
            <button
              key={agent.id}
              onClick={() => onTriggerAgent(agent.id)}
              disabled={isActive}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-all shrink-0 ${
                isCurrent
                  ? 'bg-accent/20 border-accent/40 text-accent'
                  : isActive
                    ? 'bg-white/5 border-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <img
                src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
                alt={agent.name}
                className="w-4 h-4 rounded-full"
              />
              {agent.name}
              {!isActive && (
                <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor" className="opacity-60">
                  <path d="M3 1.5v11l9-5.5z" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
