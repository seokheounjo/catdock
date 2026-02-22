import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../../../shared/types'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  if (isSystem) {
    return (
      <div className="message-enter flex justify-center px-4 py-1" role="alert">
        <div
          className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full max-w-[80%] text-center"
          aria-label={`시스템 알림: ${message.content}`}
        >
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`message-enter flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1`}
      role="article"
      aria-label={`${isUser ? '사용자' : '에이전트'} 메시지, ${formatTime(message.timestamp)}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-bubble-user text-white rounded-br-md'
            : 'bg-bubble-assistant text-white/90 rounded-bl-md border border-white/5'
        }`}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap break-words" role="text">
            {message.content}
          </p>
        ) : (
          <div
            className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-accent [&_code]:text-xs [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5"
            role="text"
          >
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
        )}
        <time
          className={`text-[10px] mt-1 block ${isUser ? 'text-white/40' : 'text-white/30'}`}
          dateTime={new Date(message.timestamp).toISOString()}
          aria-label={`${formatTime(message.timestamp)}에 전송됨`}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  )
}
