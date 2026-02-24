import { useEffect, useState, useMemo, useCallback } from 'react'
import { AgentConfig, AgentStatus, McpHealthResult } from '../../../shared/types'
import { useMultiChat } from '../hooks/useMultiChat'
import { MiniChatPane } from '../components/command-center/MiniChatPane'
import { HierarchyTabs } from '../components/command-center/HierarchyTabs'
import { CommandCenterInput } from '../components/command-center/CommandCenterInput'

export function CommandCenterPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [statuses, setStatuses] = useState<Map<string, AgentStatus>>(new Map())
  const [activeLeaderId, setActiveLeaderId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [mcpHealth, setMcpHealth] = useState<Record<string, McpHealthResult[]>>({})

  // 에이전트 로드
  useEffect(() => {
    const load = async () => {
      const allAgents = await window.api.agent.list()
      setAgents(allAgents)

      const allStates = await window.api.agent.getAllStates()
      const statusMap = new Map<string, AgentStatus>()
      allStates.forEach((s) => statusMap.set(s.config.id, s.status))
      setStatuses(statusMap)

      // 첫 번째 리더 자동 선택
      const leaders = allAgents.filter((a) => a.hierarchy?.role === 'leader')
      if (leaders.length > 0 && !activeLeaderId) {
        setActiveLeaderId(leaders[0].id)
      }
    }
    load()

    // MCP 헬스 로드
    window.api.mcp.getHealth().then(setMcpHealth).catch(() => {})

    const unsubs = [
      window.api.on('agent:created', () => load()),
      window.api.on('agent:updated', () => load()),
      window.api.on('agent:deleted', () => load()),
      window.api.on('agent:status-changed', (_id: unknown, data: unknown) => {
        const d = data as { id: string; status: AgentStatus }
        setStatuses((prev) => new Map(prev).set(d.id, d.status))
      }),
      window.api.on('mcp:health-updated', (data: unknown) => {
        setMcpHealth(data as Record<string, McpHealthResult[]>)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  // 조직도 분류
  const director = useMemo(() => agents.find((a) => a.hierarchy?.role === 'director'), [agents])
  const leaders = useMemo(() => agents.filter((a) => a.hierarchy?.role === 'leader'), [agents])
  const activeLeader = useMemo(() => leaders.find((l) => l.id === activeLeaderId), [leaders, activeLeaderId])

  // 활성 팀장의 부하 찾기
  const subordinates = useMemo(() => {
    if (!activeLeaderId) return []
    return agents.filter((a) => {
      // reportsTo가 명시적으로 이 팀장인 경우
      if (a.hierarchy?.reportsTo === activeLeaderId) return true
      // 같은 그룹의 멤버인 경우
      if (activeLeader?.group && a.group === activeLeader.group &&
          (!a.hierarchy || a.hierarchy.role === 'member') && a.id !== activeLeaderId) return true
      return false
    })
  }, [agents, activeLeaderId, activeLeader])

  // 화면에 표시할 에이전트 ID 목록
  const visibleAgentIds = useMemo(() => {
    const ids: string[] = []
    if (director) ids.push(director.id)
    if (activeLeader) ids.push(activeLeader.id)
    subordinates.forEach((s) => ids.push(s.id))
    return ids
  }, [director, activeLeader, subordinates])

  // 멀티 채팅 훅
  const { getSession, sendMessage, abort } = useMultiChat(visibleAgentIds)

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId),
    [agents, selectedAgentId]
  )

  const selectedSession = selectedAgentId ? getSession(selectedAgentId) : null

  const handleSend = useCallback(
    (message: string) => {
      if (selectedAgentId) sendMessage(selectedAgentId, message)
    },
    [selectedAgentId, sendMessage]
  )

  const handleAbort = useCallback(() => {
    if (selectedAgentId) abort(selectedAgentId)
  }, [selectedAgentId, abort])

  return (
    <div className="h-screen bg-chat-bg flex flex-col">
      {/* 타이틀바 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0 app-drag-region">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">Command Center</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
            {agents.length} agents
          </span>
        </div>
        <div className="flex items-center gap-1 app-no-drag">
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-text-muted
                       hover:bg-white/10 border-none cursor-pointer bg-transparent transition-colors"
            onClick={() => window.api.window.minimize()}
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
          </button>
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-text-muted
                       hover:bg-red-500/30 hover:text-red-400 border-none cursor-pointer bg-transparent transition-colors"
            onClick={() => window.api.window.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 팀장 탭 */}
      <HierarchyTabs
        leaders={leaders}
        activeLeaderId={activeLeaderId}
        statuses={statuses}
        onSelect={(id) => {
          setActiveLeaderId(id)
          setSelectedAgentId(id)
        }}
      />

      {/* 3-column 그리드 */}
      <div className="flex-1 grid grid-cols-[1fr_1.5fr_1.5fr] gap-2 p-2 min-h-0 overflow-hidden">
        {/* 왼쪽: 총괄 채팅 */}
        <div className="min-h-0">
          {director ? (
            <MiniChatPane
              agent={director}
              status={statuses.get(director.id) || 'idle'}
              messages={getSession(director.id).messages}
              streaming={getSession(director.id).streaming}
              streamingContent={getSession(director.id).streamingContent}
              isSelected={selectedAgentId === director.id}
              onClick={() => setSelectedAgentId(director.id)}
              mcpHealth={mcpHealth[director.id]}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-xs border border-white/10 rounded-lg">
              총괄 없음
            </div>
          )}
        </div>

        {/* 가운데: 선택된 팀장 채팅 */}
        <div className="min-h-0">
          {activeLeader ? (
            <MiniChatPane
              agent={activeLeader}
              status={statuses.get(activeLeader.id) || 'idle'}
              messages={getSession(activeLeader.id).messages}
              streaming={getSession(activeLeader.id).streaming}
              streamingContent={getSession(activeLeader.id).streamingContent}
              isSelected={selectedAgentId === activeLeader.id}
              onClick={() => setSelectedAgentId(activeLeader.id)}
              mcpHealth={mcpHealth[activeLeader.id]}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-xs border border-white/10 rounded-lg">
              팀장을 선택하세요
            </div>
          )}
        </div>

        {/* 오른쪽: 팀원들 (세로 분할, 스크롤) */}
        <div className="min-h-0 overflow-y-auto flex flex-col gap-2">
          {subordinates.length > 0 ? (
            subordinates.map((sub) => (
              <div key={sub.id} className="min-h-[200px] shrink-0" style={{ height: subordinates.length <= 2 ? `${100 / subordinates.length}%` : '200px' }}>
                <MiniChatPane
                  agent={sub}
                  status={statuses.get(sub.id) || 'idle'}
                  messages={getSession(sub.id).messages}
                  streaming={getSession(sub.id).streaming}
                  streamingContent={getSession(sub.id).streamingContent}
                  isSelected={selectedAgentId === sub.id}
                  onClick={() => setSelectedAgentId(sub.id)}
                  mcpHealth={mcpHealth[sub.id]}
                />
              </div>
            ))
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-xs border border-white/10 rounded-lg">
              팀원 없음
            </div>
          )}
        </div>
      </div>

      {/* 하단 공용 입력창 */}
      <CommandCenterInput
        targetAgentName={selectedAgent?.name ?? null}
        streaming={selectedSession?.streaming ?? false}
        onSend={handleSend}
        onAbort={handleAbort}
      />
    </div>
  )
}
