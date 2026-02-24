import { useEffect, useState, useRef } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { AgentSlot } from './AgentSlot'
import { AgentStatus, DockSize } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

export function Dock() {
  const { t } = useI18n()
  const { agents, states, fetchAgents, fetchStates, openChat, deleteAgent } = useAgentStore()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    agentId: string
  } | null>(null)
  const [dockSize, setDockSize] = useState<DockSize>('medium')
  const [dynamicGap, setDynamicGap] = useState<number | null>(null)
  const [recoveringAgents, setRecoveringAgents] = useState<Set<string>>(new Set())
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
        setDynamicGap(null)
      }),
      window.api.on('dock:density-changed', (info: unknown) => {
        const { size, gap } = info as { size: DockSize; gap: number; agentCount: number }
        setDockSize(size)
        setDynamicGap(gap)
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
  }, [])

  return (
    <>
      <div
        className="flex items-end gap-1 flex-nowrap overflow-visible pt-4"
        style={
          dynamicGap && dynamicGap < 60 ? { gap: `${Math.max(0, dynamicGap - 40)}px` } : undefined
        }
      >
        {agents.map((agent) => {
          const state = states.get(agent.id)
          return (
            <AgentSlot
              key={agent.id}
              agent={agent}
              status={(state?.status as AgentStatus) || 'idle'}
              recovering={recoveringAgents.has(agent.id)}
              dockSize={dockSize}
              onClick={() => openChat(agent.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, agentId: agent.id })
              }}
            />
          )
        })}

        {/* +/⚙ 버튼 — 수직 중앙 정렬 */}
        <div className="flex items-center gap-2 self-center">
          {/* + 버튼: 에이전트 추가 */}
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

          {/* 커맨드 센터 버튼 */}
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

          {/* 설정 버튼 (톱니바퀴) → 별도 설정 창 열기 */}
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
        {/* +/⚙ 버튼 wrapper 끝 */}
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
