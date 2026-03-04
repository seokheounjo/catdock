import { useState, useRef, useEffect, useCallback } from 'react'
import { ConversationStatus } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

type SendMode = 'shift-enter' | 'button-only'
const SEND_MODE_KEY = 'chatInput:sendMode'

function useSendMode(): [SendMode, (mode: SendMode) => void] {
  const [mode, setModeState] = useState<SendMode>(() => {
    try {
      return (localStorage.getItem(SEND_MODE_KEY) as SendMode) || 'shift-enter'
    } catch {
      return 'shift-enter'
    }
  })
  const setMode = useCallback((m: SendMode) => {
    setModeState(m)
    try { localStorage.setItem(SEND_MODE_KEY, m) } catch { /* ignore */ }
  }, [])
  return [mode, setMode]
}

interface GroupChatInputProps {
  onSend: (message: string) => void
  onPause: () => void
  onResume: () => void
  onAbort: () => void
  status: ConversationStatus
}

export function GroupChatInput({
  onSend,
  onPause,
  onResume,
  onAbort,
  status
}: GroupChatInputProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [sendMode, setSendMode] = useSendMode()
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
    if (e.key === 'Enter') {
      if (sendMode === 'button-only') return
      if (e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
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
        {/* 🔒 전송 모드 토글 */}
        <button
          onClick={() => setSendMode(sendMode === 'shift-enter' ? 'button-only' : 'shift-enter')}
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none
                     cursor-pointer transition-all duration-200
                     ${sendMode === 'button-only'
                       ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                       : 'bg-transparent text-text-muted hover:text-text hover:bg-white/10'
                     }`}
          title={sendMode === 'button-only'
            ? '🔒 버튼 클릭으로만 전송 (클릭하여 해제)'
            : '🔓 Shift+Enter로 전송 (클릭하여 잠금)'}
        >
          {sendMode === 'button-only' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 019.9-1" />
            </svg>
          )}
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={sendMode === 'button-only'
            ? '메시지 입력... (버튼으로만 전송)'
            : '메시지 입력... (Shift+Enter로 전송)'}
          rows={1}
          className="flex-1 bg-transparent text-text text-sm outline-none resize-none max-h-[150px] py-1 placeholder:text-text-muted"
        />

        <div className="flex items-center gap-1">
          {/* 일시정지/재개 버튼 */}
          {isActive && (
            <button
              onClick={onPause}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-all"
              title={t('groupChat.pause')}
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
              title={t('groupChat.resume')}
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
              title={t('groupChat.stop')}
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
                  : 'bg-white/10 text-text-muted'
              }`}
              title={t('groupChat.sendMessage')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M2 8h12M9 3l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
