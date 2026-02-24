import { AgentConfig, AgentStatus, DockSize } from '../../../../shared/types'
import { FishingCat } from './FishingCat'
import { generateAvatar } from '../../utils/avatar'
import { useI18n } from '../../hooks/useI18n'

interface Props {
  agent: AgentConfig
  status: AgentStatus
  recovering?: boolean
  dockSize?: DockSize
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function AgentSlot({
  agent,
  status,
  recovering = false,
  dockSize = 'medium',
  onClick,
  onContextMenu
}: Props) {
  const { t } = useI18n()
  const isDirector = agent.hierarchy?.role === 'director'
  const isLeader = agent.hierarchy?.role === 'leader'
  const isTemporary = agent.isTemporary || agent.hierarchy?.role === 'temporary'

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

  const statusDescription = recovering
    ? t('dock.statusRecovering')
    : {
        idle: t('dock.statusIdle'),
        working: t('dock.statusWorking'),
        error: t('dock.statusError')
      }[status] || t('dock.statusUnknown')

  return (
    <button
      className={`fishing-slot flex flex-col items-center gap-0 cursor-pointer bg-transparent border-none p-0 flex-shrink-0
                 focus:outline-2 focus:outline-accent focus:outline-offset-2 focus:ring-2 focus:ring-accent/50
                 transition-all duration-200 ${isTemporary ? 'opacity-70' : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      aria-label={t('dock.chatWith', { name: agent.name })}
      aria-describedby={`agent-${agent.id}-status`}
      title={`${agent.name} — ${agent.role}${isDirector ? ` (${t('agentCard.teamDirector')})` : ''}${isLeader ? ` (${t('agentCard.teamLeader')})` : ''}${isTemporary ? ` (${t('agentCard.temporary')})` : ''}`}
    >
      {/* 디렉터 배지 — 총괄 ★★ */}
      {isDirector && (
        <span className="text-yellow-400 text-[10px] leading-none mb-[-2px]" aria-hidden="true">
          ★★
        </span>
      )}
      {/* 리더 왕관 */}
      {isLeader && (
        <span className="text-yellow-400 text-[10px] leading-none mb-[-2px]" aria-hidden="true">
          &#9733;
        </span>
      )}
      <div className="relative">
        <FishingCat
          status={status}
          recovering={recovering}
          size={isDirector || isLeader ? 'large' : 'normal'}
          dockSize={dockSize}
        />
        {/* 품종별 아바타 뱃지 */}
        <div
          className={`absolute -bottom-1 -right-1 rounded-full border-2 border-chat-bg overflow-hidden bg-white/10 ${
            dockSize === 'small' ? 'w-4 h-4' : 'w-6 h-6'
          }`}
        >
          <img
            src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span
          className={`text-[9px] truncate leading-none ${
            isDirector
              ? 'text-yellow-300/80 max-w-[64px]'
              : isLeader
                ? 'text-yellow-300/80 max-w-[64px]'
                : 'text-text-secondary max-w-[56px]'
          }`}
        >
          {agent.name}
        </span>
        {/* 리더/디렉터 역할 표시 */}
        {(isDirector || isLeader) && agent.role && (
          <span className="text-[7px] text-blue-300/70 leading-none truncate max-w-[72px]">
            {agent.role}
          </span>
        )}
        {/* 복구 중 표시 */}
        {recovering && (
          <span className="text-[7px] text-amber-400/80 leading-none animate-pulse">
            {t('dock.statusRecovering')}
          </span>
        )}
        {/* 임시 에이전트 표시 */}
        {isTemporary && !recovering && (
          <span className="text-[7px] text-orange-400/60 leading-none">
            {t('agentCard.temporary')}
          </span>
        )}
        <span id={`agent-${agent.id}-status`} className="text-[8px] text-text-muted sr-only">
          {t('dock.statusLabel')}: {statusDescription}
        </span>
      </div>
    </button>
  )
}
