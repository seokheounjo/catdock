import { useState, useRef, useEffect, useCallback } from 'react'
import { useI18n } from '../../hooks/useI18n'

interface FileAttachment {
  fileName: string
  fileSize: number
  content: string
}

interface ChatInputProps {
  onSend: (message: string) => void
  onAbort: () => void
  streaming: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onAbort, streaming, disabled }: ChatInputProps) {
  const { t } = useI18n()
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<FileAttachment | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!streaming) {
      textareaRef.current?.focus()
    }
  }, [streaming])

  // 파일 읽기 공통 함수
  const attachFile = useCallback(async (filePath: string) => {
    const result = await window.api.file.readContent(filePath)
    if (result.success && result.content && result.fileName) {
      setAttachment({
        fileName: result.fileName,
        fileSize: result.fileSize,
        content: result.content
      })
    } else {
      console.error('[ChatInput] 파일 읽기 실패:', result.error)
    }
  }, [])

  // 📎 버튼 클릭
  const handleAttachClick = useCallback(async () => {
    const filePath = await window.api.window.selectFile()
    if (filePath) await attachFile(filePath)
  }, [attachFile])

  // 드래그 앤 드롭
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      // Electron에서 file.path로 실제 경로 접근
      const filePath = (file as File & { path?: string }).path
      if (filePath) {
        await attachFile(filePath)
      }
    }
  }, [attachFile])

  // 경로 붙여넣기 감지
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain').trim()
    // 파일 경로 패턴 감지 (Windows / Unix)
    const isFilePath = /^([A-Za-z]:\\|\/|~\/)/.test(text) && !text.includes('\n') && text.length < 500
    if (isFilePath) {
      e.preventDefault()
      await attachFile(text)
    }
  }, [attachFile])

  const handleSubmit = () => {
    if (streaming) {
      onAbort()
      return
    }
    if (!input.trim() && !attachment) return
    if (disabled) return

    let finalMessage = ''
    if (attachment) {
      finalMessage += `[${t('chat.filePrefix')}: ${attachment.fileName}]\n\`\`\`\n${attachment.content}\n\`\`\`\n\n`
    }
    finalMessage += input.trim()

    onSend(finalMessage)
    setInput('')
    setAttachment(null)
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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    return `${(bytes / 1024).toFixed(1)}KB`
  }

  return (
    <div
      className={`px-4 py-3 bg-chat-sidebar border-t border-white/5 ${dragOver ? 'ring-2 ring-accent ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 첨부 파일 프리뷰 */}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5 text-xs text-text-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="truncate">{attachment.fileName}</span>
          <span className="text-text-muted shrink-0">({formatSize(attachment.fileSize)})</span>
          <button
            onClick={() => setAttachment(null)}
            className="ml-auto shrink-0 w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-white/10 bg-transparent border-none cursor-pointer"
            aria-label={t('chat.removeAttachment')}
          >
            &times;
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2">
        {/* 📎 첨부 버튼 */}
        <button
          onClick={handleAttachClick}
          disabled={streaming || disabled}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none
                     cursor-pointer bg-transparent text-text-muted hover:text-text hover:bg-white/10
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
          aria-label={t('chat.attachFile')}
          title={t('chat.attachHint')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={streaming ? t('chat.placeholderStreaming') : t('chat.placeholder')}
          rows={1}
          disabled={disabled}
          aria-label={t('chat.ariaInput')}
          aria-describedby={streaming ? "chat-status" : undefined}
          className="flex-1 bg-transparent text-text text-sm resize-none max-h-[150px] py-1
                     placeholder:text-text-muted focus:outline-2 focus:outline-accent
                     focus:outline-offset-2 transition-all duration-200"
        />
        {streaming && (
          <span id="chat-status" className="sr-only" aria-live="polite">
            {t('chat.ariaStreaming')}
          </span>
        )}
        <button
          onClick={handleSubmit}
          disabled={disabled && !streaming}
          aria-label={
            streaming
              ? t('chat.ariaAbort')
              : (input.trim() || attachment)
                ? t('chat.ariaSend')
                : t('chat.ariaEmptySend')
          }
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border-none
                      cursor-pointer transition-all duration-200
                      focus:outline-2 focus:outline-accent focus:outline-offset-2 focus:ring-2 focus:ring-accent/50
                      ${streaming
                        ? 'bg-danger hover:bg-danger/80 text-white focus:bg-danger/70'
                        : (input.trim() || attachment)
                          ? 'bg-accent hover:bg-accent-hover text-white focus:bg-accent-hover'
                          : 'bg-white/10 text-text-muted cursor-not-allowed'
                      }`}
          title={streaming ? t('chat.stop') : t('chat.send')}
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
