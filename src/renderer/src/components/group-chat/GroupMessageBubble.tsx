import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ConversationMessage, AgentConfig } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'

interface GroupMessageBubbleProps {
  message: ConversationMessage
  agents: Map<string, AgentConfig>
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 w-5 h-5 rounded flex items-center justify-center
                 bg-white/5 hover:bg-white/15 border-none cursor-pointer
                 text-text-muted hover:text-text transition-all opacity-0 group-hover:opacity-100"
      title="복사"
    >
      {copied ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

export function GroupMessageBubble({ message, agents }: GroupMessageBubbleProps) {
  const isUser = message.senderType === 'user'
  const isSystem = message.senderType === 'system'
  const agent = message.agentId ? agents.get(message.agentId) : null

  if (isSystem) {
    return (
      <div className="message-enter flex justify-center px-4 py-1 group">
        <div className="text-xs text-text-muted bg-white/5 px-3 py-1 rounded-full max-w-[80%] text-center flex items-center gap-1">
          <span>{message.content}</span>
          <CopyBtn text={message.content} />
        </div>
      </div>
    )
  }

  if (isUser) {
    return (
      <div className="message-enter flex justify-end px-4 py-1 group">
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-bubble-user text-white rounded-br-md">
          <p className="m-0 whitespace-pre-wrap break-words">{message.content}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-white/30 flex-1">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            <CopyBtn text={message.content} />
          </div>
        </div>
      </div>
    )
  }

  // 에이전트 메시지
  return (
    <div className="message-enter flex justify-start px-4 py-1 gap-2 group">
      {/* 아바타 */}
      <div className="shrink-0 mt-1">
        {agent ? (
          <img
            src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
            alt={message.agentName || ''}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-text-muted">
            ?
          </div>
        )}
      </div>

      <div className="max-w-[80%]">
        {/* 이름 */}
        <div className="text-[11px] text-text-muted mb-0.5 ml-1">
          {message.agentName || 'Unknown'}
          {agent && <span className="text-text-muted ml-1">({agent.role})</span>}
        </div>

        <div className="bg-bubble-assistant rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-text border border-white/5">
          <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-black/30 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-accent [&_code]:text-xs [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] text-text-muted flex-1">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
              {message.costDelta ? ` · $${message.costDelta.toFixed(4)}` : ''}
            </span>
            <CopyBtn text={message.content} />
          </div>
        </div>
      </div>
    </div>
  )
}
