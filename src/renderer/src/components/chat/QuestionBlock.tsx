import { useState } from 'react'

interface QuestionBlockProps {
  /** Raw text inside [QUESTION]...[/QUESTION] */
  raw: string
  /** Send the composed answer back to the chat */
  onSend?: (text: string) => void
  /** Already answered — render read-only */
  readOnly?: boolean
}

interface ParsedQuestion {
  title: string
  options: string[]
}

function parseQuestion(raw: string): ParsedQuestion {
  const lines = raw.trim().split('\n')
  const titleLines: string[] = []
  const options: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // "- [ ] 옵션" 형식
    const match = trimmed.match(/^-\s*\[[\sx]?\]\s*(.+)$/i)
    if (match) {
      options.push(match[1].trim())
    } else if (trimmed) {
      titleLines.push(trimmed)
    }
  }

  return {
    title: titleLines.join('\n'),
    options
  }
}

export function QuestionBlock({ raw, onSend, readOnly = false }: QuestionBlockProps) {
  const { title, options } = parseQuestion(raw)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(readOnly)

  const toggle = (idx: number) => {
    if (submitted) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleSubmit = () => {
    if (submitted || !onSend) return
    const parts: string[] = []

    if (selected.size > 0) {
      const chosen = options.filter((_, i) => selected.has(i))
      parts.push(chosen.map((o) => `- [x] ${o}`).join('\n'))
    }
    if (comment.trim()) {
      parts.push(`추가 의견: ${comment.trim()}`)
    }
    if (parts.length === 0) return

    onSend(parts.join('\n\n'))
    setSubmitted(true)
  }

  const isDisabled = submitted

  return (
    <div className="my-3 rounded-lg border border-accent/30 bg-accent/5 overflow-hidden">
      {/* 질문 제목 — 좌측 accent 보더 */}
      <div className="border-l-[3px] border-accent px-4 py-3">
        <p className="text-[15px] font-semibold text-text whitespace-pre-wrap leading-snug">
          {title}
        </p>
      </div>

      {/* 체크박스 목록 */}
      {options.length > 0 && (
        <div className="px-4 pb-2 space-y-1.5">
          {options.map((opt, i) => (
            <label
              key={i}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors
                ${isDisabled ? 'opacity-60 cursor-default' : 'hover:bg-white/5'}
                ${selected.has(i) ? 'bg-accent/10' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                disabled={isDisabled}
                className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5
                           accent-accent cursor-pointer disabled:cursor-default"
              />
              <span className="text-sm text-text leading-relaxed">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* 추가 의견 + 전송 버튼 */}
      {!isDisabled && (
        <div className="px-4 pb-3 space-y-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="추가 의견 (선택)"
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10
                       text-sm text-text placeholder:text-text-muted
                       focus:outline-none focus:border-accent/50 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 && !comment.trim()}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                       bg-accent text-white hover:bg-accent/80
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            답변 전송
          </button>
        </div>
      )}

      {/* 제출 완료 표시 */}
      {isDisabled && !readOnly && (
        <div className="px-4 pb-3">
          <span className="text-xs text-text-muted">답변 완료</span>
        </div>
      )}
    </div>
  )
}
