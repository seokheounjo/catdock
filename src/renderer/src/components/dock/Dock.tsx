import { useEffect, useState } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { AgentSlot } from './AgentSlot'
import { AgentStatus } from '../../../../shared/types'

export function Dock() {
  const { agents, states, fetchAgents, fetchStates, openChat, deleteAgent } = useAgentStore()
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; agentId: string
  } | null>(null)

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

        {/* + 버튼: 박스 색 + 십자가만 */}
        <button
          className="cursor-pointer border-none outline-none flex items-center justify-center"
          style={{
            width: 48, height: 48, borderRadius: 10,
            background: 'rgba(60, 60, 100, 0.6)',
            color: 'rgba(255,255,255,0.5)', fontSize: 24
          }}
          onClick={() => window.api.window.openEditor()}
          title="Add Agent"
        >+</button>
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[130px]"
               style={{ left: contextMenu.x, top: contextMenu.y - 110, background: 'rgba(30,30,55,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button className="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 cursor-pointer bg-transparent border-none"
                    onClick={() => { openChat(contextMenu.agentId); setContextMenu(null) }}>Chat</button>
            <button className="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 cursor-pointer bg-transparent border-none"
                    onClick={() => { window.api.window.openEditor(contextMenu.agentId); setContextMenu(null) }}>Edit</button>
            <div className="h-px bg-white/10 my-0.5" />
            <button className="w-full px-3 py-1.5 text-left text-xs text-danger hover:bg-white/10 cursor-pointer bg-transparent border-none"
                    onClick={() => { deleteAgent(contextMenu.agentId); setContextMenu(null) }}>Delete</button>
          </div>
        </>
      )}
    </>
  )
}
