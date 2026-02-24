import { useState, useRef, useEffect } from 'react'

interface CommandCenterInputProps {
  targetAgentName: string | null
  streaming: boolean
  onSend: (message: string) => void
  onAbort: () => void
}

export function CommandCenterInput({ targetAgentName, streaming, onSend, onAbort }: CommandCenterInputProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [targetAgentName])

  const handleSubmit = () => {
    if (!text.trim() || !targetAgentName) return
    onSend(text.trim())
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-white/10 bg-white/[0.02] shrink-0">
      {/* 대상 에이전트 표시 */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-text-muted">To:</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          targetAgentName ? 'bg-accent/20 text-accent' : 'bg-white/10 text-text-muted'
        }`}>
          {targetAgentName || '패널 클릭'}
        </span>
      </div>

      {/* 입력창 */}
      <textarea
        ref={inputRef}
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text
                   placeholder:text-text-muted resize-none outline-none
                   focus:border-accent/50 transition-colors duration-200"
        rows={1}
        placeholder={targetAgentName ? `${targetAgentName}에게 메시지...` : '패널을 클릭하여 대상을 선택하세요'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!targetAgentName || streaming}
      />

      {/* 전송/중단 버튼 */}
      {streaming ? (
        <button
          className="shrink-0 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium
                     border border-red-500/30 cursor-pointer hover:bg-red-500/30 transition-colors duration-200"
          onClick={onAbort}
        >
          중단
        </button>
      ) : (
        <button
          className="shrink-0 px-4 py-2 rounded-lg bg-accent/20 text-accent text-xs font-medium
                     border border-accent/30 cursor-pointer hover:bg-accent/30 transition-colors duration-200
                     disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleSubmit}
          disabled={!text.trim() || !targetAgentName}
        >
          전송
        </button>
      )}
    </div>
  )
}
