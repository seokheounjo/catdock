import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { AgentSlot } from './AgentSlot'
import { AgentConfig, AgentStatus, DockSize } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'
import { VERSION_DISPLAY } from '../../../../shared/version'

// 접힌 director/leader의 하위 에이전트를 찾아 숨김 처리에 쓰는 유틸
function getSubordinateIds(
  agentId: string,
  agents: AgentConfig[]
): string[] {
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return []
  const role = agent.hierarchy?.role

  if (role === 'director') {
    const directLeaders = agents.filter(
      (a) => a.hierarchy?.reportsTo === agentId && a.hierarchy?.role === 'leader'
    )
    const directMembers = agents.filter(
      (a) => a.hierarchy?.reportsTo === agentId && a.hierarchy?.role !== 'leader'
    )
    const leaderSubs = directLeaders.flatMap((l) =>
      agents.filter((a) => a.hierarchy?.reportsTo === l.id).map((a) => a.id)
    )
    return [
      ...directLeaders.map((l) => l.id),
      ...directMembers.map((m) => m.id),
      ...leaderSubs
    ]
  }

  if (role === 'leader') {
    return agents
      .filter((a) => a.hierarchy?.reportsTo === agentId)
      .map((a) => a.id)
  }

  return []
}

// ── 계층 그룹 빌드: flat 배열 → 그룹 배열 ──
// 그룹 = { head: director/leader, members: 산하 에이전트[] }
// 소속 없는 에이전트는 단독 그룹
interface AgentGroup {
  head: AgentConfig
  members: AgentConfig[] // head 제외, 순서: leader → member
}

function buildGroups(agents: AgentConfig[]): AgentGroup[] {
  const assigned = new Set<string>()
  const groups: AgentGroup[] = []

  // 1) Director 그룹
  const directors = agents.filter((a) => a.hierarchy?.role === 'director')
  for (const dir of directors) {
    assigned.add(dir.id)
    const members: AgentConfig[] = []

    // director 직속 leader들
    const leaders = agents.filter(
      (a) => a.hierarchy?.reportsTo === dir.id && a.hierarchy?.role === 'leader'
    )
    for (const leader of leaders) {
      assigned.add(leader.id)
      members.push(leader)
      // leader 산하 member들
      const leaderMembers = agents.filter((a) => a.hierarchy?.reportsTo === leader.id)
      for (const m of leaderMembers) {
        assigned.add(m.id)
        members.push(m)
      }
    }

    // director 직속 member (leader 아닌)
    const directMembers = agents.filter(
      (a) => a.hierarchy?.reportsTo === dir.id && a.hierarchy?.role !== 'leader'
    )
    for (const m of directMembers) {
      if (!assigned.has(m.id)) {
        assigned.add(m.id)
        members.push(m)
      }
    }

    groups.push({ head: dir, members })
  }

  // 2) 독립 Leader 그룹 (director 아래가 아닌)
  const standaloneLeaders = agents.filter(
    (a) => a.hierarchy?.role === 'leader' && !assigned.has(a.id)
  )
  for (const leader of standaloneLeaders) {
    assigned.add(leader.id)
    const members: AgentConfig[] = []
    const leaderMembers = agents.filter((a) => a.hierarchy?.reportsTo === leader.id)
    for (const m of leaderMembers) {
      assigned.add(m.id)
      members.push(m)
    }
    groups.push({ head: leader, members })
  }

  // 3) 소속 없는 에이전트 — 각각 단독 그룹
  for (const a of agents) {
    if (!assigned.has(a.id)) {
      groups.push({ head: a, members: [] })
    }
  }

  return groups
}

export function Dock() {
  const { t } = useI18n()
  const { agents, states, fetchAgents, fetchStates, openChat, deleteAgent } = useAgentStore()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    agentId: string
  } | null>(null)
  const [dockSize, setDockSize] = useState<DockSize>('medium')
  const [recoveringAgents, setRecoveringAgents] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 키보드로 메뉴 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) setContextMenu(null)
    }

    if (contextMenu) {
      document.addEventListener('keydown', handleKeyDown)
      setTimeout(() => {
        contextMenuRef.current?.querySelector('button')?.focus()
      }, 0)
    }

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu])

  useEffect(() => {
    fetchAgents()
    fetchStates()
    const unsubs = [
      window.api.on('agent:created', () => {
        fetchAgents()
        fetchStates()
      }),
      window.api.on('agent:updated', () => {
        fetchAgents()
        fetchStates()
      }),
      window.api.on('agent:deleted', () => {
        fetchAgents()
        fetchStates()
      }),
      window.api.on('agent:status-changed', () => fetchStates()),
      window.api.on('agent:process-info-changed', () => fetchStates()),
      window.api.on('dock:size-changed', (size: unknown) => {
        setDockSize(size as DockSize)
      }),
      window.api.on('error-recovery:started', (event: unknown) => {
        const e = event as { agentId: string }
        setRecoveringAgents((prev) => new Set(prev).add(e.agentId))
      }),
      window.api.on('error-recovery:status-changed', (event: unknown) => {
        const e = event as { agentId: string; status: string }
        if (e.status === 'resolved' || e.status === 'failed') {
          setRecoveringAgents((prev) => {
            const next = new Set(prev)
            next.delete(e.agentId)
            return next
          })
        }
      })
    ]
    // 초기 독 크기 로드
    window.api.settings.get().then((s) => {
      if (s.dockSize) setDockSize(s.dockSize)
    })
    return () => {
      unsubs.forEach((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 접힌 그룹에 의해 숨겨지는 에이전트 ID 집합
  const hiddenAgentIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const groupId of collapsedGroups) {
      for (const subId of getSubordinateIds(groupId, agents)) {
        hidden.add(subId)
      }
    }
    return hidden
  }, [collapsedGroups, agents])

  // 계층 그룹 빌드 → 숨김 필터 적용
  const visibleGroups = useMemo(() => {
    const groups = buildGroups(agents)
    return groups
      .map((g) => ({
        ...g,
        members: g.members.filter((m) => !hiddenAgentIds.has(m.id))
      }))
      .filter((g) => !hiddenAgentIds.has(g.head.id))
  }, [agents, hiddenAgentIds])

  // 접기/펼치기 토글 → 독 너비 갱신
  const toggleCollapse = useCallback(
    (agentId: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev)
        if (next.has(agentId)) {
          next.delete(agentId)
        } else {
          next.add(agentId)
        }

        // 새 hidden 집합 계산 → 보이는 에이전트 수로 독 리사이즈
        const newHidden = new Set<string>()
        for (const gid of next) {
          for (const subId of getSubordinateIds(gid, agents)) {
            newHidden.add(subId)
          }
        }
        const visibleCount = agents.filter((a) => !newHidden.has(a.id)).length
        window.api.app.setDockVisibleCount(visibleCount)

        return next
      })
    },
    [agents]
  )

  // 각 director/leader의 하위 에이전트 수 (접기 배지용)
  const subordinateCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const agent of agents) {
      const role = agent.hierarchy?.role
      if (role === 'director' || role === 'leader') {
        counts.set(agent.id, getSubordinateIds(agent.id, agents).length)
      }
    }
    return counts
  }, [agents])

  return (
    <>
      {/* 독 최상위: 에이전트 + 버튼 중앙 정렬 */}
      <div className="flex items-end justify-center w-full pt-4 gap-1 flex-nowrap overflow-x-auto overflow-y-hidden scrollbar-thin">
        {visibleGroups.map((group, gi) => {
          const headRole = group.head.hierarchy?.role
          const isCollapsible = headRole === 'director' || headRole === 'leader'
          const hasMembers = group.members.length > 0
          const isCollapsed = collapsedGroups.has(group.head.id)
          const headState = states.get(group.head.id)

          // 단독 에이전트 (그룹 없음)
          if (!hasMembers && !isCollapsible) {
            return (
              <AgentSlot
                key={group.head.id}
                agent={group.head}
                status={(headState?.status as AgentStatus) || 'idle'}
                recovering={recoveringAgents.has(group.head.id)}
                dockSize={dockSize}
                onClick={() => openChat(group.head.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, agentId: group.head.id })
                }}
              />
            )
          }

          // 그룹 컨테이너 (director/leader + 산하)
          return (
            <div
              key={group.head.id}
              className={`flex items-end gap-0.5 relative flex-shrink-0
                ${hasMembers || isCollapsible ? 'rounded-lg bg-white/[0.03] px-1 pb-0.5 pt-0' : ''}
                ${gi > 0 && (hasMembers || isCollapsible) ? 'ml-1' : ''}`}
            >
              {/* 그룹 접기/펼치기 토글 — 호버 애니메이션 바깥 */}
              {isCollapsible && subordinateCounts.get(group.head.id)! > 0 && (
                <button
                  className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 px-2 h-4 flex items-center justify-center
                             rounded-full bg-slate-700/90 text-[8px] text-text-secondary
                             cursor-pointer hover:bg-slate-600 transition-colors border-none"
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(group.head.id) }}
                  title={isCollapsed ? t('dock.expand') : t('dock.collapse')}
                >
                  {isCollapsed ? '▶' : '▼'} {isCollapsed ? (subordinateCounts.get(group.head.id) ?? 0) : ''}
                </button>
              )}

              {/* Head (director/leader) */}
              <AgentSlot
                agent={group.head}
                status={(headState?.status as AgentStatus) || 'idle'}
                recovering={recoveringAgents.has(group.head.id)}
                dockSize={dockSize}
                collapsed={isCollapsible ? isCollapsed : undefined}
                subordinateCount={isCollapsible ? subordinateCounts.get(group.head.id) ?? 0 : undefined}
                groupRole="head"
                onClick={() => openChat(group.head.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, agentId: group.head.id })
                }}
              />

              {/* 산하 멤버들 */}
              {group.members.map((member) => {
                const memberState = states.get(member.id)
                const memberRole = member.hierarchy?.role
                const memberCollapsible = memberRole === 'director' || memberRole === 'leader'
                return (
                  <AgentSlot
                    key={member.id}
                    agent={member}
                    status={(memberState?.status as AgentStatus) || 'idle'}
                    recovering={recoveringAgents.has(member.id)}
                    dockSize={dockSize}
                    collapsed={memberCollapsible ? collapsedGroups.has(member.id) : undefined}
                    subordinateCount={memberCollapsible ? subordinateCounts.get(member.id) ?? 0 : undefined}
                    groupRole="sub"
                    onClick={() => openChat(member.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, agentId: member.id })
                    }}
                  />
                )
              })}
            </div>
          )
        })}

        {/* +/⚙ 버튼 — 에이전트와 같은 줄에 중앙 배치 */}
        <div className="flex items-center gap-2 self-center flex-shrink-0">
          <button
            className={`${dockSize === 'small' ? 'w-8 h-8 text-lg' : dockSize === 'large' ? 'w-14 h-14 text-3xl' : 'w-12 h-12 text-2xl'}
                     rounded-lg bg-blue-900/60 text-text-secondary font-medium
                     border-none cursor-pointer flex items-center justify-center
                     hover:bg-blue-800/70 focus:outline-2 focus:outline-accent focus:outline-offset-2
                     focus:ring-2 focus:ring-accent/50 transition-all duration-200`}
            onClick={() => window.api.window.openEditor()}
            aria-label={t('dock.addAgent')}
            title={t('dock.addAgent')}
          >
            +
          </button>
          <button
            className={`${dockSize === 'small' ? 'w-8 h-8' : dockSize === 'large' ? 'w-14 h-14' : 'w-12 h-12'}
                     rounded-lg bg-indigo-900/60 text-text-secondary
                     border-none cursor-pointer flex items-center justify-center
                     hover:bg-indigo-800/70 focus:outline-2 focus:outline-accent focus:outline-offset-2
                     focus:ring-2 focus:ring-accent/50 transition-all duration-200`}
            onClick={() => window.api.window.openCommandCenter()}
            aria-label="Command Center"
            title="Command Center"
          >
            <svg
              width={dockSize === 'small' ? 14 : dockSize === 'large' ? 22 : 18}
              height={dockSize === 'small' ? 14 : dockSize === 'large' ? 22 : 18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            className={`${dockSize === 'small' ? 'w-8 h-8' : dockSize === 'large' ? 'w-14 h-14' : 'w-12 h-12'}
                     rounded-lg bg-slate-700/60 text-text-secondary
                     border-none cursor-pointer flex items-center justify-center
                     hover:bg-slate-600/70 focus:outline-2 focus:outline-accent focus:outline-offset-2
                     focus:ring-2 focus:ring-accent/50 transition-all duration-200`}
            onClick={() => window.api.window.openSettings()}
            aria-label={t('dock.settings')}
            title={t('dock.settings')}
          >
            <svg
              width={dockSize === 'small' ? 14 : dockSize === 'large' ? 22 : 18}
              height={dockSize === 'small' ? 14 : dockSize === 'large' ? 22 : 18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>

        {/* 버전 표시 */}
        <div className="text-[9px] text-text-muted/40 text-center mt-1 select-none" title={VERSION_DISPLAY}>
          {VERSION_DISPLAY}
        </div>
      </div>

      {/* 에이전트 컨텍스트 메뉴 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            aria-hidden="true"
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[130px] bg-slate-800/95 border border-white/20"
            style={{ left: contextMenu.x, top: Math.max(10, contextMenu.y - 110) }}
            role="menu"
            aria-label={t('dock.agentMenu')}
          >
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-text hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => {
                openChat(contextMenu.agentId)
                setContextMenu(null)
              }}
              role="menuitem"
            >
              {t('dock.chat')}
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-text hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => {
                window.api.window.openEditor(contextMenu.agentId)
                setContextMenu(null)
              }}
              role="menuitem"
            >
              {t('dock.edit')}
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-yellow-400 hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={async () => {
                const agent = agents.find((a) => a.id === contextMenu.agentId)
                if (!agent) return
                const currentRole = agent.hierarchy?.role ?? 'member'
                // member → leader → director → member 순환
                const nextRole =
                  currentRole === 'member'
                    ? 'leader'
                    : currentRole === 'leader'
                      ? 'director'
                      : 'member'
                if (nextRole === 'director') {
                  await window.api.agent.update(contextMenu.agentId, {
                    hierarchy: { role: 'director', subordinates: [] }
                  })
                } else if (nextRole === 'leader') {
                  await window.api.agent.update(contextMenu.agentId, {
                    hierarchy: { role: 'leader', subordinates: [] }
                  })
                } else {
                  await window.api.agent.update(contextMenu.agentId, {
                    hierarchy: { role: 'member' }
                  })
                }
                fetchAgents()
                setContextMenu(null)
              }}
              role="menuitem"
            >
              {(() => {
                const agent = agents.find((a) => a.id === contextMenu.agentId)
                const currentRole = agent?.hierarchy?.role ?? 'member'
                if (currentRole === 'member') return t('dock.setLeader')
                if (currentRole === 'leader') return t('dock.setDirector')
                return t('dock.setMember')
              })()}
            </button>
            <div className="h-px bg-white/10 my-0.5" role="separator" />
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => {
                deleteAgent(contextMenu.agentId)
                setContextMenu(null)
              }}
              role="menuitem"
            >
              {t('dock.delete')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
