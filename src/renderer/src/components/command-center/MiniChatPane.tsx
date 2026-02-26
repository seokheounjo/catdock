import { useRef, useEffect } from 'react'
import { AgentConfig, AgentStatus, ChatMessage, McpHealthResult } from '../../../../shared/types'
import { MessageBubble } from '../chat/MessageBubble'
import { StreamingText } from '../chat/StreamingText'
import { generateAvatar } from '../../utils/avatar'

interface MiniChatPaneProps {
  agent: AgentConfig
  status: AgentStatus
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  isSelected: boolean
  onClick: () => void
  mcpHealth?: McpHealthResult[]
}

export function MiniChatPane({
  agent,
  status,
  messages,
  streaming,
  streamingContent,
  isSelected,
  onClick,
  mcpHealth
}: MiniChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 메시지 변경 시 스크롤 — requestAnimationFrame으로 렌더 후 실행
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 스트리밍 중에는 즉시 스크롤 (smooth하면 따라가지 못함)
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, streamingContent])

  const avatarUrl = generateAvatar(agent.avatar.style, agent.avatar.seed)
  const statusColor =
    status === 'working' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-400'
  const roleLabel =
    agent.hierarchy?.role === 'director'
      ? '총괄'
      : agent.hierarchy?.role === 'leader'
        ? '팀장'
        : '팀원'

  return (
    <div
      className={`flex flex-col h-full rounded-lg border overflow-hidden cursor-pointer transition-all duration-200
        ${
          isSelected
            ? 'border-accent/60 bg-white/[0.03] shadow-[0_0_8px_rgba(99,102,241,0.15)]'
            : 'border-white/10 bg-white/[0.02] hover:border-white/20'
        }`}
      onClick={onClick}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <img className="w-6 h-6 rounded-full shrink-0" src={avatarUrl} alt={agent.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text truncate">{agent.name}</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-text-muted shrink-0">
              {roleLabel}
            </span>
          </div>
        </div>
        {/* MCP 헬스 뱃지 */}
        {mcpHealth &&
          mcpHealth.length > 0 &&
          (() => {
            const hasDisconnected = mcpHealth.some((h) => h.status === 'disconnected')
            const hasNotFound = mcpHealth.some((h) => h.status === 'not-found')
            const allConnected = mcpHealth.every((h) => h.status === 'connected')
            const mcpColor = hasDisconnected
              ? 'bg-red-400'
              : hasNotFound
                ? 'bg-gray-400'
                : allConnected
                  ? 'bg-green-400'
                  : 'bg-yellow-400'
            const mcpLabel = hasDisconnected
              ? 'MCP 장애'
              : hasNotFound
                ? 'MCP 없음'
                : allConnected
                  ? 'MCP 연결됨'
                  : 'MCP 확인 중'
            return (
              <span
                className={`text-[8px] px-1 py-0.5 rounded ${mcpColor} text-black shrink-0`}
                title={mcpLabel}
              >
                MCP
              </span>
            )
          })()}
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} title={status} />
      </div>

      {/* 메시지 영역 — justify-end로 하단 정렬 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col justify-end min-h-full py-2 space-y-0.5">
          {messages.length === 0 && !streaming && (
            <div className="flex-1 flex items-center justify-center text-text-muted text-[10px]">
              대화 없음
            </div>
          )}
          {messages.slice(-20).map((msg) => (
            <div key={msg.id} className="scale-[0.85] origin-top-left w-[118%]">
              <MessageBubble message={msg} />
            </div>
          ))}
          {streaming && (
            <div className="scale-[0.85] origin-top-left w-[118%]">
              <StreamingText content={streamingContent} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
