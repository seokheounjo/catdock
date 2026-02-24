import { useRef, useEffect } from 'react'
import { ConversationMessage, AgentConfig } from '../../../../shared/types'
import { GroupMessageBubble } from './GroupMessageBubble'
import { GroupStreamingText } from './GroupStreamingText'
import { useI18n } from '../../hooks/useI18n'

interface GroupMessageListProps {
  messages: ConversationMessage[]
  agents: Map<string, AgentConfig>
  streaming: boolean
  streamingContent: string
  streamingAgentId: string | null
  streamingAgentName: string | null
}

export function GroupMessageList({
  messages,
  agents,
  streaming,
  streamingContent,
  streamingAgentId,
  streamingAgentName
}: GroupMessageListProps) {
  const { t } = useI18n()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="chat-content flex-1 overflow-y-auto py-4 space-y-1">
      {messages.length === 0 && !streaming && (
        <div className="flex flex-col items-center justify-center h-full text-text-muted">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-sm">{t('groupChat.startGroupConversation')}</p>
        </div>
      )}

      {messages.map((msg) => (
        <GroupMessageBubble key={msg.id} message={msg} agents={agents} />
      ))}

      {streaming && (
        <GroupStreamingText
          content={streamingContent}
          agentId={streamingAgentId}
          agentName={streamingAgentName}
          agents={agents}
        />
      )}

      <div ref={bottomRef} />
    </div>
  )
}
