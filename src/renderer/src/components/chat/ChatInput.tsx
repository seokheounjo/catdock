import { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  onAbort: () => void
  streaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onAbort, streaming, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!streaming) {
      textareaRef.current?.focus()
    }
  }, [streaming])

  const handleSubmit = () => {
    if (streaming) {
      onAbort()
      return
    }
    if (!input.trim() || disabled) return
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
    // Auto resize
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
          placeholder={streaming ? "응답 생성 중..." : "메시지를 입력하세요..."}
          rows={1}
          disabled={disabled}
          aria-label="채팅 메시지 입력"
          aria-describedby={streaming ? "chat-status" : undefined}
          className="flex-1 bg-transparent text-white text-sm resize-none max-h-[150px] py-1
                     placeholder:text-white/40 focus:outline-2 focus:outline-accent
                     focus:outline-offset-2 transition-all duration-200"
        />
        {streaming && (
          <span id="chat-status" className="sr-only" aria-live="polite">
            에이전트가 응답을 생성하고 있습니다
          </span>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled && !streaming}
          aria-label={
            streaming
              ? "응답 생성 중단하기"
              : input.trim()
                ? "메시지 전송하기"
                : "메시지를 입력한 후 전송하세요"
          }
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none
                      cursor-pointer transition-all duration-200
                      focus:outline-2 focus:outline-accent focus:outline-offset-2 focus:ring-2 focus:ring-accent/50
                      ${streaming
                        ? 'bg-danger hover:bg-danger/80 text-white focus:bg-danger/70'
                        : input.trim()
                          ? 'bg-accent hover:bg-accent-hover text-white focus:bg-accent-hover'
                          : 'bg-white/10 text-white/40 cursor-not-allowed'
                      }`}
          title={streaming ? '중단' : '전송'}
        >
          {streaming ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="10" height="10" rx="1.5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 8h12M9 3l5 5-5 5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
