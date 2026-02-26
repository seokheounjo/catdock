import { useRef, useEffect } from 'react'
import { ChatMessage } from '../../../../shared/types'
import { MessageBubble } from './MessageBubble'
import { StreamingText } from './StreamingText'
import { useI18n } from '../../hooks/useI18n'

interface MessageListProps {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
}

export function MessageList({ messages, streaming, streamingContent }: MessageListProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [messages, streamingContent])

  return (
    <div ref={scrollRef} className="chat-content flex-1 overflow-y-auto py-4 space-y-1">
      {messages.length === 0 && !streaming && (
        <div className="flex flex-col items-center justify-center h-full text-text-muted">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-sm">{t('chat.startConversation')}</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {streaming && <StreamingText content={streamingContent} />}

      <div ref={bottomRef} />
    </div>
  )
}
