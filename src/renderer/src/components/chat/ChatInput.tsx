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
          placeholder="Type a message..."
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-white text-sm outline-none resize-none max-h-[150px] py-1 placeholder:text-white/30"
        />
        <button
          onClick={handleSubmit}
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer transition-all ${
            streaming
              ? 'bg-danger hover:bg-danger/80 text-white'
              : input.trim()
                ? 'bg-accent hover:bg-accent-hover text-white'
                : 'bg-white/10 text-white/30'
          }`}
          title={streaming ? 'Stop' : 'Send'}
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
