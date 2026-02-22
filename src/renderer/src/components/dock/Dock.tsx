import { useEffect, useState, useRef } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { AgentSlot } from './AgentSlot'
import { AgentStatus } from '../../../../shared/types'

export function Dock() {
  const { agents, states, fetchAgents, fetchStates, openChat, deleteAgent } = useAgentStore()
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; agentId: string
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 키보드로 컨텍스트 메뉴 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null)
      }
    }

    if (contextMenu) {
      document.addEventListener('keydown', handleKeyDown)
      // 포커스를 첫 번째 메뉴 아이템으로 이동
      setTimeout(() => {
        const firstButton = contextMenuRef.current?.querySelector('button')
        firstButton?.focus()
      }, 0)
    }

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [contextMenu])

  useEffect(() => {
    fetchAgents()
    fetchStates()
    const interval = setInterval(fetchStates, 2000)
    const unsubs = [
      window.api.on('agent:created', () => fetchAgents()),
      window.api.on('agent:updated', () => fetchAgents()),
      window.api.on('agent:deleted', () => fetchAgents()),
      window.api.on('agent:status-changed', () => fetchStates())
    ]
    return () => { clearInterval(interval); unsubs.forEach(fn => fn()) }
  }, [])

  return (
    <>
      {/* 배경 없이 캐릭터만 나열 */}
      <div className="flex items-end gap-2">
        {agents.map(agent => {
          const state = states.get(agent.id)
          return (
            <AgentSlot
              key={agent.id}
              agent={agent}
              status={(state?.status as AgentStatus) || 'idle'}
              onClick={() => openChat(agent.id)}
              onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, agentId: agent.id }) }}
            />
          )
        })}

        {/* + 버튼: 에이전트 추가 */}
        <button
          className="w-12 h-12 rounded-lg bg-blue-900/60 text-white/80 text-2xl font-medium
                     border-none cursor-pointer flex items-center justify-center
                     hover:bg-blue-800/70 focus:outline-2 focus:outline-accent focus:outline-offset-2
                     focus:ring-2 focus:ring-accent/50 transition-all duration-200"
          onClick={() => window.api.window.openEditor()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              window.api.window.openEditor()
            }
          }}
          aria-label="새 에이전트 추가"
          title="새 에이전트 추가"
        >+</button>

        {/* 그룹 채팅 버튼 */}
        <button
          className="w-12 h-12 rounded-lg bg-purple-900/60 text-white/80
                     border-none cursor-pointer flex items-center justify-center
                     hover:bg-purple-800/70 focus:outline-2 focus:outline-accent focus:outline-offset-2
                     focus:ring-2 focus:ring-accent/50 transition-all duration-200"
          onClick={() => window.api.window.openNewConversation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              window.api.window.openNewConversation()
            }
          }}
          aria-label="새 그룹 채팅 시작"
          title="새 그룹 채팅 시작"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 14v1a2 2 0 002 2h8l4 3v-3a2 2 0 002-2V7a2 2 0 00-2-2h-3" />
            <rect x="1" y="1" width="12" height="10" rx="2" />
          </svg>
        </button>
      </div>

      {/* 컨텍스트 메뉴 */}
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
            aria-label="에이전트 메뉴"
          >
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-white/90 hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => { openChat(contextMenu.agentId); setContextMenu(null) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const nextButton = e.currentTarget.nextElementSibling as HTMLButtonElement
                  if (nextButton?.tagName === 'BUTTON') nextButton.focus()
                }
              }}
              role="menuitem"
            >
              채팅하기
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-white/90 hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => { window.api.window.openEditor(contextMenu.agentId); setContextMenu(null) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prevButton = e.currentTarget.previousElementSibling as HTMLButtonElement
                  prevButton?.focus()
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const nextButton = e.currentTarget.nextElementSibling?.nextElementSibling as HTMLButtonElement
                  if (nextButton?.tagName === 'BUTTON') nextButton.focus()
                }
              }}
              role="menuitem"
            >
              편집하기
            </button>
            <div className="h-px bg-white/10 my-0.5" role="separator" />
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-white/10
                         focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                         transition-colors duration-150"
              onClick={() => { deleteAgent(contextMenu.agentId); setContextMenu(null) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const prevButton = e.currentTarget.previousElementSibling?.previousElementSibling as HTMLButtonElement
                  if (prevButton?.tagName === 'BUTTON') prevButton.focus()
                }
              }}
              role="menuitem"
              aria-describedby="delete-warning"
            >
              삭제하기
            </button>
            <span
              id="delete-warning"
              className="sr-only"
            >
              경고: 이 작업은 되돌릴 수 없습니다
            </span>
          </div>
        </>
      )}
    </>
  )
}
