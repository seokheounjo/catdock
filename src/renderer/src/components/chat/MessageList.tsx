import { useRef, useEffect } from 'react'
import { ChatMessage } from '../../../../shared/types'
import { MessageBubble } from './MessageBubble'
import { StreamingText } from './StreamingText'

interface MessageListProps {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
}

export function MessageList({ messages, streaming, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="chat-content flex-1 overflow-y-auto py-4 space-y-1">
      {messages.length === 0 && !streaming && (
        <div className="flex flex-col items-center justify-center h-full text-white/20">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-sm">Start a conversation...</p>
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
