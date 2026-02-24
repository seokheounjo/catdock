import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  if (isSystem) {
    // 위임 관련 시스템 메시지 구분
    const isDelegation = message.id.startsWith('delegation-')
    return (
      <div className="message-enter flex justify-center px-4 py-1" role="alert">
        <div
          className={`text-xs px-3 py-1 rounded-full max-w-[80%] text-center ${
            isDelegation
              ? 'text-amber-300/80 bg-amber-500/10 border border-amber-500/20'
              : 'text-text-muted bg-white/5'
          }`}
          aria-label={t('chat.systemAlert', { content: message.content })}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // 상향 보고 메시지 — 파란색 배지 스타일
  if (message.isAutoReport) {
    return (
      <div className="message-enter flex justify-start px-4 py-1" role="article">
        <div
          className="max-w-[90%] rounded-xl px-4 py-2.5 text-xs leading-relaxed
                        bg-blue-500/10 border border-blue-400/30 text-blue-200"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-300">
              📋 자동 보고
            </span>
            <time
              className="text-[10px] text-blue-300/50"
              dateTime={new Date(message.timestamp).toISOString()}
            >
              {formatTime(message.timestamp)}
            </time>
          </div>
          <p className="m-0 whitespace-pre-wrap break-words">
            {message.content.replace('[📋 자동 보고] ', '')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`message-enter flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1`}
      role="article"
      aria-label={`${isUser ? t('chat.userMessage') : t('chat.agentMessage')}, ${formatTime(message.timestamp)}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-bubble-user text-white rounded-br-md'
            : 'bg-bubble-assistant text-text rounded-bl-md border border-white/5'
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
          className={`text-[10px] mt-1 block ${isUser ? 'text-white/40' : 'text-text-muted'}`}
          dateTime={new Date(message.timestamp).toISOString()}
          aria-label={t('chat.sentAt', { time: formatTime(message.timestamp) })}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  )
}
