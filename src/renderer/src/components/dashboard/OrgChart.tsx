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

  const { directors, leaderGroups, unassignedMembers, temporary } = useMemo(() => {
    const directors = agents.filter((a) => a.hierarchy?.role === 'director')
    const leaders = agents.filter((a) => a.hierarchy?.role === 'leader')
    const allMembers = agents.filter((a) => !a.hierarchy || a.hierarchy.role === 'member')
    const temporary = agents.filter((a) => a.hierarchy?.role === 'temporary' || a.isTemporary)

    // 리더별 팀원 그룹핑
    const leaderGroups = leaders.map((leader) => {
      const teamMembers = allMembers.filter((m) => m.hierarchy?.reportsTo === leader.id)
      return { leader, members: teamMembers }
    })

    // 어디에도 속하지 않는 멤버
    const allSuperiors = new Set([...directors, ...leaders].map((a) => a.id))
    const unassignedMembers = allMembers.filter(
      (m) => !m.hierarchy?.reportsTo || !allSuperiors.has(m.hierarchy.reportsTo)
    )

    return { directors, leaderGroups, unassignedMembers, temporary }
  }, [agents])

  if (agents.length === 0) {
    return <div className="text-sm text-text-muted">{t('orgChart.noAgents')}</div>
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* ── 총괄 (Director) ── */}
      {directors.map((director) => {
        const dirStatus = states.get(director.id)?.status ?? 'idle'
        const dirLeaderGroups = leaderGroups.filter(
          (g) => g.leader.hierarchy?.reportsTo === director.id
        )
        const freeLeaderGroups = leaderGroups.filter(
          (g) =>
            !g.leader.hierarchy?.reportsTo ||
            !directors.some((d) => d.id === g.leader.hierarchy?.reportsTo)
        )
        // 첫 디렉터만 미연결 리더 표시 (중복 방지)
        const showFreeLeaders = director === directors[0]
        const allGroups = [...dirLeaderGroups, ...(showFreeLeaders ? freeLeaderGroups : [])]

        return (
          <div key={director.id} className="flex flex-col items-center gap-0">
            {/* 총괄 노드 */}
            <button
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/10 hover:bg-purple-500/20 transition-colors cursor-pointer shadow-lg shadow-purple-500/5"
              onClick={() => window.api.window.openChat(director.id)}
            >
              <div className="relative">
                <AvatarImg agent={director} size="lg" />
                <StatusDot status={dirStatus} />
              </div>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <span className="text-purple-400 text-xs">&#9670;</span>
                  <span className="text-sm font-semibold text-text-primary">{director.name}</span>
                </div>
                <span className="text-xs text-purple-300/70">{director.role}</span>
              </div>
            </button>

            {/* 총괄 → 리더 연결선 */}
            {allGroups.length > 0 && (
              <>
                <div className="w-px h-5 bg-gradient-to-b from-purple-400/40 to-yellow-400/40" />
                <div className="relative flex items-start">
                  {/* 수평 연결선 */}
                  {allGroups.length > 1 && (
                    <div
                      className="absolute top-0 h-px bg-yellow-400/30"
                      style={{
                        left: `calc(${100 / (allGroups.length * 2)}% )`,
                        right: `calc(${100 / (allGroups.length * 2)}% )`
                      }}
                    />
                  )}
                  <div className="flex gap-3 flex-wrap justify-center">
                    {allGroups.map((group) => (
                      <TeamGroup
                        key={group.leader.id}
                        leader={group.leader}
                        members={group.members}
                        states={states}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })}

      {/* 미배정 멤버 */}
      {unassignedMembers.length > 0 && (
        <div className="mt-1 pt-3 border-t border-white/5 w-full">
          <div className="text-xs text-text-muted mb-2 font-medium">
            {t('orgChart.unassignedMembers') || '미배정 팀원'}
          </div>
          <div className="flex gap-2 flex-wrap">
            {unassignedMembers.map((agent) => (
              <MemberNode
                key={agent.id}
                agent={agent}
                status={states.get(agent.id)?.status ?? 'idle'}
              />
            ))}
          </div>
        </div>
      )}

      {/* 임시 에이전트 */}
      {temporary.length > 0 && (
        <div className="mt-1 pt-3 border-t border-white/5 w-full">
          <div className="text-xs text-text-muted mb-2 font-medium">
            {t('orgChart.temporaryAgents')}
          </div>
          <div className="flex gap-2 flex-wrap">
            {temporary.map((agent) => (
              <MemberNode
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

// ── 팀 그룹 (리더 + 팀원 카드) ──
function TeamGroup({
  leader,
  members,
  states
}: {
  leader: AgentConfig
  members: AgentConfig[]
  states: Map<string, AgentState>
}) {
  const leaderStatus = states.get(leader.id)?.status ?? 'idle'
  // 팀명 추출: leaderTeamName 또는 역할에서 유추
  const teamName = leader.hierarchy?.leaderTeamName || extractTeamName(leader.role, leader.name)

  return (
    <div className="flex flex-col items-center min-w-[140px]">
      {/* 수직 연결선 (상위) */}
      <div className="w-px h-3 bg-yellow-400/30" />

      {/* 팀 카드 */}
      <div className="flex flex-col rounded-xl border border-yellow-400/30 bg-yellow-500/5 overflow-hidden w-full">
        {/* 팀 헤더 — 리더 */}
        <button
          className="flex items-center gap-2.5 px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors cursor-pointer border-b border-yellow-400/20"
          onClick={() => window.api.window.openChat(leader.id)}
        >
          <div className="relative flex-shrink-0">
            <AvatarImg agent={leader} size="md" />
            <StatusDot status={leaderStatus} />
          </div>
          <div className="flex flex-col items-start min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-yellow-400 text-[9px]">&#9733;</span>
              <span className="text-xs font-semibold text-text-primary truncate">
                {leader.name}
              </span>
            </div>
            <span className="text-[10px] text-yellow-300/60 truncate w-full">{teamName}</span>
          </div>
        </button>

        {/* 팀원 목록 */}
        {members.length > 0 && (
          <div className="flex flex-col gap-px bg-white/[0.02]">
            {members.map((member) => {
              const mStatus = states.get(member.id)?.status ?? 'idle'
              return (
                <button
                  key={member.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => window.api.window.openChat(member.id)}
                >
                  <div className="relative flex-shrink-0">
                    <AvatarImg agent={member} size="sm" />
                    <StatusDot status={mStatus} size="sm" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-[11px] text-text-secondary truncate">{member.name}</span>
                    <span className="text-[9px] text-text-muted truncate">{member.role}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* 팀원 없음 표시 */}
        {members.length === 0 && (
          <div className="px-3 py-2 text-[10px] text-text-muted/50 text-center italic">
            팀원 미배정
          </div>
        )}
      </div>
    </div>
  )
}

// ── 독립 멤버 노드 ──
function MemberNode({
  agent,
  status,
  isTemporary
}: {
  agent: AgentConfig
  status: string
  isTemporary?: boolean
}) {
  return (
    <button
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-white/5 hover:bg-white/10 cursor-pointer transition-colors ${
        isTemporary ? 'border-orange-400/30 opacity-70' : 'border-white/10'
      }`}
      onClick={() => window.api.window.openChat(agent.id)}
    >
      <div className="relative flex-shrink-0">
        <AvatarImg agent={agent} size="sm" />
        <StatusDot status={status} size="sm" />
      </div>
      <div className="flex flex-col items-start min-w-0">
        <span className="text-[11px] text-text-secondary truncate">{agent.name}</span>
        <span className="text-[9px] text-text-muted truncate">{agent.role}</span>
      </div>
    </button>
  )
}

// ── 아바타 이미지 ──
function AvatarImg({ agent, size }: { agent: AgentConfig; size: 'sm' | 'md' | 'lg' }) {
  const avatarUri = useMemo(
    () => generateAvatar(agent.avatar.style, agent.avatar.seed),
    [agent.avatar.style, agent.avatar.seed]
  )
  const sizeClass = size === 'lg' ? 'w-11 h-11' : size === 'md' ? 'w-9 h-9' : 'w-7 h-7'
  return (
    <div className={`${sizeClass} rounded-lg overflow-hidden bg-white/10 flex-shrink-0`}>
      <img src={avatarUri} alt={agent.name} className="w-full h-full object-cover" />
    </div>
  )
}

// ── 상태 인디케이터 ──
function StatusDot({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5'
  const color =
    status === 'working'
      ? 'bg-blue-500 animate-pulse'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-gray-500'
  return (
    <div
      className={`absolute -bottom-0.5 -right-0.5 ${dotSize} rounded-full border-2 border-chat-bg ${color}`}
    />
  )
}

// ── 팀명 추출 유틸 ──
function extractTeamName(role: string, name: string): string {
  // "Frontend Lead" → "프론트엔드팀" / "Frontend Team"
  // 이름에서 팀장/Lead 키워드 제거
  if (role.includes('|')) {
    // "프론트엔드팀장|Frontend Lead" 형식
    return role.split('|')[0].replace('팀장', '팀')
  }
  if (role.includes('Lead')) {
    return role.replace(' Lead', ' Team')
  }
  if (role.includes('팀장')) {
    return role.replace('팀장', '팀')
  }
  return name
}
