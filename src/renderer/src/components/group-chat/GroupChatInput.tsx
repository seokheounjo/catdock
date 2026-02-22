import { useState, useRef, useEffect } from 'react'
import { ConversationStatus } from '../../../../shared/types'

interface GroupChatInputProps {
  onSend: (message: string) => void
  onPause: () => void
  onResume: () => void
  onAbort: () => void
  status: ConversationStatus
}

export function GroupChatInput({ onSend, onPause, onResume, onAbort, status }: GroupChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isActive = status === 'chaining' || status === 'waiting-agent'
  const isPaused = status === 'paused'

  useEffect(() => {
    if (!isActive) {
      textareaRef.current?.focus()
    }
  }, [isActive])

  const handleSubmit = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  return (
    <div className="px-4 py-3 bg-chat-sidebar border-t border-white/5">
      <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 bg-transparent text-white text-sm outline-none resize-none max-h-[150px] py-1 placeholder:text-white/30"
        />

        <div className="flex items-center gap-1">
          {/* 일시정지/재개 버튼 */}
          {isActive && (
            <button
              onClick={onPause}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-all"
              title="Pause"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="3.5" height="10" rx="1" />
                <rect x="8.5" y="2" width="3.5" height="10" rx="1" />
              </svg>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-accent/20 hover:bg-accent/30 text-accent transition-all"
              title="Resume"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M3 1.5v11l9-5.5z" />
              </svg>
            </button>
          )}

          {/* 중단 버튼 (활성 또는 일시정지 중) */}
          {(isActive || isPaused) && (
            <button
              onClick={onAbort}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-danger hover:bg-danger/80 text-white transition-all"
              title="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="2" y="2" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          )}

          {/* 전송 버튼 */}
          {!isActive && !isPaused && (
            <button
              onClick={handleSubmit}
              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer transition-all ${
                input.trim()
                  ? 'bg-accent hover:bg-accent-hover text-white'
                  : 'bg-white/10 text-white/30'
              }`}
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 8h12M9 3l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
