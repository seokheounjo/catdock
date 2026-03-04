import { useState, useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'
import { QuestionBlock } from './QuestionBlock'
import { ActionBlock } from './ActionBlock'

interface MessageBubbleProps {
  message: ChatMessage
  onSend?: (text: string) => void
}

// [QUESTION]...[/QUESTION] 및 [ACTION:TYPE|라벨|대상] 블록을 분리
type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'question'; value: string }
  | { type: 'action'; actionType: 'OPEN_URL' | 'RUN_CMD' | 'OPEN_FILE'; label: string; target: string }

function splitSpecialBlocks(content: string): ContentSegment[] {
  // QUESTION과 ACTION을 모두 매칭하는 통합 정규식
  const regex = /\[QUESTION\]([\s\S]*?)\[\/QUESTION\]|\[ACTION:(OPEN_URL|RUN_CMD|OPEN_FILE)\|([^|]+)\|([^\]]+)\]/gi
  const segments: ContentSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }

    if (match[1] !== undefined) {
      // QUESTION 블록
      segments.push({ type: 'question', value: match[1] })
    } else if (match[2] !== undefined) {
      // ACTION 블록
      segments.push({
        type: 'action',
        actionType: match[2].toUpperCase() as 'OPEN_URL' | 'RUN_CMD' | 'OPEN_FILE',
        label: match[3].trim(),
        target: match[4].trim()
      })
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) })
  }

  return segments
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 w-6 h-6 rounded flex items-center justify-center
                 bg-white/5 hover:bg-white/15 border-none cursor-pointer
                 text-text-muted hover:text-text transition-all opacity-0 group-hover:opacity-100"
      title="복사"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

export function MessageBubble({ message, onSend }: MessageBubbleProps) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  // 에이전트 메시지의 QUESTION/ACTION 블록 파싱 (메모이즈)
  const segments = useMemo(
    () => (!isUser && !isSystem ? splitSpecialBlocks(message.content) : null),
    [message.content, isUser, isSystem]
  )

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
      <div className="message-enter flex justify-center px-4 py-1 group" role="alert">
        <div
          className={`relative text-xs px-3 py-1 rounded-full max-w-[80%] text-center flex items-center gap-1 ${
            isDelegation
              ? 'text-amber-300/80 bg-amber-500/10 border border-amber-500/20'
              : 'text-text-muted bg-white/5'
          }`}
          aria-label={t('chat.systemAlert', { content: message.content })}
        >
          <span className="flex-1">{message.content}</span>
          <CopyButton text={message.content} />
        </div>
      </div>
    )
  }

  // 상향 보고 메시지 — 파란색 배지 스타일
  if (message.isAutoReport) {
    return (
      <div className="message-enter flex justify-start px-4 py-1 group" role="article">
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
            <CopyButton text={message.content} />
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
      className={`message-enter flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-1 group`}
      role="article"
      aria-label={`${isUser ? t('chat.userMessage') : t('chat.agentMessage')}, ${formatTime(message.timestamp)}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-5 py-3 leading-relaxed ${
          isUser
            ? 'bg-bubble-user text-white rounded-br-md text-sm'
            : 'bg-bubble-assistant text-text rounded-bl-md border border-white/5'
        }`}
      >
        {isUser ? (
          <p className="m-0 whitespace-pre-wrap break-words" role="text">
            {message.content}
          </p>
        ) : (
          <div role="text">
            {segments && segments.length > 0 ? (
              segments.map((seg, i) =>
                seg.type === 'question' ? (
                  <QuestionBlock key={i} raw={seg.value} onSend={onSend} />
                ) : seg.type === 'action' ? (
                  <ActionBlock key={i} type={seg.actionType} label={seg.label} target={seg.target} />
                ) : (
                  <div
                    key={i}
                    className="prose prose-invert prose-base max-w-none
                      [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                      [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                      [&_code]:text-accent [&_code]:text-sm
                      [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2
                      [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
                      [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5
                      [&_li]:my-0.5
                      [&_table]:text-sm"
                  >
                    <Markdown remarkPlugins={[remarkGfm]}>{seg.value}</Markdown>
                  </div>
                )
              )
            ) : (
              <div
                className="prose prose-invert prose-base max-w-none
                  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                  [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto
                  [&_code]:text-accent [&_code]:text-sm
                  [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2
                  [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2
                  [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5
                  [&_li]:my-0.5
                  [&_table]:text-sm"
              >
                <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1">
          <time
            className={`text-[10px] flex-1 ${isUser ? 'text-white/40' : 'text-text-muted'}`}
            dateTime={new Date(message.timestamp).toISOString()}
            aria-label={t('chat.sentAt', { time: formatTime(message.timestamp) })}
          >
            {formatTime(message.timestamp)}
          </time>
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  )
}
