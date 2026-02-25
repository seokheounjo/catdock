import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { AgentConfig, AgentState } from '../../../../shared/types'
import { MODEL_OPTIONS } from '../../../../shared/constants'
import { generateAvatar } from '../../utils/avatar'
import { useAgentStore } from '../../stores/agent-store'
import { useI18n } from '../../hooks/useI18n'

interface Props {
  agent: AgentConfig
  state: AgentState | null
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  working: 'bg-blue-500 animate-pulse',
  error: 'bg-red-500'
}

// 모델 ID → 짧은 표시명
function shortModelName(model: string): string {
  return model.replace('claude-', '').split('-202')[0]
}

export const AgentCard = memo(function AgentCard({ agent, state }: Props) {
  const { t } = useI18n()
  const { deleteAgent, updateAgent } = useAgentStore()
  const [showModelPicker, setShowModelPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const avatarUri = useMemo(
    () => generateAvatar(agent.avatar.style, agent.avatar.seed),
    [agent.avatar.style, agent.avatar.seed]
  )

  const hierarchyRole = agent.hierarchy?.role ?? 'member'
  const status = state?.status ?? 'idle'
  const cost = state?.costTotal ?? 0
  const processStatus = state?.processInfo?.processStatus ?? 'stopped'

  // 외부 클릭 시 모델 피커 닫기
  useEffect(() => {
    if (!showModelPicker) return
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showModelPicker])

  const handleModelChange = (newModel: string) => {
    updateAgent(agent.id, { model: newModel })
    setShowModelPicker(false)
  }

  return (
    <div
      className={`rounded-xl border p-4 bg-white/5 hover:bg-white/8 transition-colors cursor-pointer group relative ${
        hierarchyRole === 'director'
          ? 'border-purple-400/30'
          : hierarchyRole === 'leader'
            ? 'border-yellow-400/30'
            : 'border-white/10'
      }`}
      onClick={() => window.api.window.openChat(agent.id)}
    >
      {/* 호버 시 액션 버튼 */}
      <div
        className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => window.api.window.openEditor(agent.id)}
          className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-text-muted hover:text-text
                     flex items-center justify-center cursor-pointer bg-transparent border-none text-[10px]"
          title={t('agentCard.edit')}
        >
          &#x270E;
        </button>
        <button
          onClick={() => deleteAgent(agent.id)}
          className="w-6 h-6 rounded bg-white/10 hover:bg-red-500/30 text-text-muted hover:text-red-400
                     flex items-center justify-center cursor-pointer bg-transparent border-none text-[10px]"
          title={t('agentCard.delete')}
        >
          &#x2715;
        </button>
      </div>

      <div className="flex items-start gap-3">
        {/* 아바타 */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/10">
            <img src={avatarUri} alt={agent.name} className="w-full h-full object-cover" />
          </div>
          {/* 상태 인디케이터 */}
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-chat-bg ${statusColors[status]}`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text truncate">{agent.name}</span>
            {hierarchyRole === 'director' && (
              <span className="text-purple-400 text-xs" title={t('agentCard.teamDirector')}>
                &#9670;
              </span>
            )}
            {hierarchyRole === 'leader' && (
              <span className="text-yellow-400 text-xs" title={t('agentCard.teamLeader')}>
                &#9733;
              </span>
            )}
            {agent.isTemporary && (
              <span className="text-orange-400 text-xs" title={t('agentCard.temporary')}>
                &#9202;
              </span>
            )}
          </div>
          {agent.role !== agent.name && (
            <span className="text-xs text-text-muted">{agent.role}</span>
          )}
        </div>
      </div>

      {/* 세부 정보 */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="relative" ref={pickerRef} onClick={(e) => e.stopPropagation()}>
          <span className="text-text-muted">{t('agentCard.model')}</span>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="w-full text-left text-accent hover:text-accent-hover truncate bg-transparent border-none cursor-pointer p-0 text-xs"
            title={agent.model}
          >
            {shortModelName(agent.model)}
          </button>
          {/* 모델 선택 드롭다운 */}
          {showModelPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-chat-bg border border-white/20 rounded-lg shadow-xl py-1 min-w-[160px] max-h-[200px] overflow-auto">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleModelChange(opt.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 bg-transparent border-none cursor-pointer transition-colors ${
                    agent.model === opt.value ? 'text-accent' : 'text-text-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <span className="text-text-muted">{t('agentCard.cost')}</span>
          <div className="text-text-secondary">${cost.toFixed(4)}</div>
        </div>
        <div>
          <span className="text-text-muted">{t('agentCard.status')}</span>
          <div
            className={`${status === 'working' ? 'text-blue-400' : status === 'error' ? 'text-red-400' : 'text-text-secondary'}`}
          >
            {status}
          </div>
        </div>
        <div>
          <span className="text-text-muted">{t('agentCard.process')}</span>
          <div
            className={`${processStatus === 'running' ? 'text-green-400' : processStatus === 'crashed' ? 'text-red-400' : 'text-text-secondary'}`}
          >
            {processStatus}
          </div>
        </div>
      </div>

      {/* 현재 작업 */}
      {state?.currentTask && (
        <div className="mt-2 text-xs text-accent truncate">{state.currentTask}</div>
      )}

      {/* 마지막 메시지 */}
      {state?.lastMessage && (
        <div className="mt-2 text-xs text-text-muted truncate">{state.lastMessage}</div>
      )}
    </div>
  )
})
