import { useMemo } from 'react'
import { AgentConfig, AgentState } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'
import { useI18n } from '../../hooks/useI18n'

interface Props {
  agents: AgentConfig[]
  states: Map<string, AgentState>
}

export function OrgChart({ agents, states }: Props) {
  const { t } = useI18n()
  const { directors, leaders, members, temporary } = useMemo(() => {
    const directors = agents.filter((a) => a.hierarchy?.role === 'director')
    const leaders = agents.filter((a) => a.hierarchy?.role === 'leader')
    const members = agents.filter((a) => !a.hierarchy || a.hierarchy.role === 'member')
    const temporary = agents.filter((a) => a.hierarchy?.role === 'temporary' || a.isTemporary)
    return { directors, leaders, members, temporary }
  }, [agents])

  if (agents.length === 0) {
    return <div className="text-sm text-text-muted">{t('orgChart.noAgents')}</div>
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 디렉터들 */}
      {directors.length > 0 && (
        <div className="flex items-start gap-6 flex-wrap justify-center">
          {directors.map((director) => {
            const subLeaders = leaders.filter((l) => l.hierarchy?.reportsTo === director.id)
            return (
              <div key={director.id} className="flex flex-col items-center">
                <OrgNode
                  agent={director}
                  status={states.get(director.id)?.status ?? 'idle'}
                  nodeRole="director"
                />
                {subLeaders.length > 0 && (
                  <>
                    <div className="w-px h-4 bg-purple-400/30" />
                    <div className="flex items-start gap-4 flex-wrap justify-center">
                      {subLeaders.map((leader) => {
                        const subordinates = members.filter(
                          (m) => m.hierarchy?.reportsTo === leader.id
                        )
                        return (
                          <div key={leader.id} className="flex flex-col items-center">
                            <OrgNode
                              agent={leader}
                              status={states.get(leader.id)?.status ?? 'idle'}
                              nodeRole="leader"
                            />
                            {subordinates.length > 0 && (
                              <>
                                <div className="w-px h-4 bg-yellow-400/30" />
                                <div className="flex items-start gap-3 flex-wrap justify-center">
                                  {subordinates.map((agent) => (
                                    <OrgNode
                                      key={agent.id}
                                      agent={agent}
                                      status={states.get(agent.id)?.status ?? 'idle'}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 디렉터에 연결되지 않은 리더들 */}
      {(() => {
        const freeLeaders = leaders.filter(
          (l) => !l.hierarchy?.reportsTo || !directors.some((d) => d.id === l.hierarchy?.reportsTo)
        )
        if (freeLeaders.length === 0) return null
        return (
          <div className="flex items-start gap-6 flex-wrap justify-center">
            {freeLeaders.map((leader) => {
              const subordinates = members.filter((m) => m.hierarchy?.reportsTo === leader.id)
              return (
                <div key={leader.id} className="flex flex-col items-center">
                  <OrgNode
                    agent={leader}
                    status={states.get(leader.id)?.status ?? 'idle'}
                    nodeRole="leader"
                  />
                  {subordinates.length > 0 && (
                    <>
                      <div className="w-px h-4 bg-yellow-400/30" />
                      <div className="flex items-start gap-3 flex-wrap justify-center">
                        {subordinates.map((agent) => (
                          <OrgNode
                            key={agent.id}
                            agent={agent}
                            status={states.get(agent.id)?.status ?? 'idle'}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* 리더에 연결되지 않은 멤버 */}
      {(() => {
        const allSuperiors = [...directors, ...leaders]
        const unassigned = members.filter(
          (m) =>
            !m.hierarchy?.reportsTo || !allSuperiors.some((s) => s.id === m.hierarchy?.reportsTo)
        )
        if (unassigned.length === 0) return null
        return (
          <div className="flex items-start gap-4 flex-wrap justify-center">
            {unassigned.map((agent) => (
              <OrgNode
                key={agent.id}
                agent={agent}
                status={states.get(agent.id)?.status ?? 'idle'}
              />
            ))}
          </div>
        )
      })()}

      {/* 임시 에이전트 */}
      {temporary.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10 w-full">
          <div className="text-xs text-text-muted mb-2 text-center">
            {t('orgChart.temporaryAgents')}
          </div>
          <div className="flex items-start gap-3 flex-wrap justify-center">
            {temporary.map((agent) => (
              <OrgNode
                key={agent.id}
                agent={agent}
                status={states.get(agent.id)?.status ?? 'idle'}
                isTemporary
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OrgNode({
  agent,
  status,
  nodeRole,
  isTemporary
}: {
  agent: AgentConfig
  status: string
  nodeRole?: 'director' | 'leader'
  isTemporary?: boolean
}) {
  const avatarUri = useMemo(
    () => generateAvatar(agent.avatar.style, agent.avatar.seed),
    [agent.avatar.style, agent.avatar.seed]
  )

  const borderClass =
    nodeRole === 'director'
      ? 'border-purple-400/50 ring-1 ring-purple-400/20'
      : nodeRole === 'leader'
        ? 'border-yellow-400/50 ring-1 ring-yellow-400/20'
        : isTemporary
          ? 'border-orange-400/30 opacity-70'
          : 'border-white/10'

  const isLarge = nodeRole === 'director' || nodeRole === 'leader'

  return (
    <button
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border bg-white/5 hover:bg-white/10 cursor-pointer transition-colors ${borderClass}`}
      onClick={() => window.api.window.openChat(agent.id)}
    >
      {nodeRole === 'director' && (
        <span className="text-purple-400 text-[10px] leading-none">&#9670;</span>
      )}
      {nodeRole === 'leader' && (
        <span className="text-yellow-400 text-[10px] leading-none">&#9733;</span>
      )}
      <div className="relative">
        <div
          className={`${isLarge ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg overflow-hidden bg-white/10`}
        >
          <img src={avatarUri} alt={agent.name} className="w-full h-full object-cover" />
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-chat-bg ${
            status === 'working' ? 'bg-blue-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-500'
          }`}
        />
      </div>
      <span className="text-xs text-text-secondary max-w-[60px] truncate">{agent.name}</span>
      <span className="text-[10px] text-text-muted max-w-[70px] truncate">{agent.role}</span>
    </button>
  )
}
