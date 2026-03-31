import { useState, useEffect, useCallback } from 'react'

interface QuestionBlockProps {
  /** Raw text inside [QUESTION]...[/QUESTION] */
  raw: string
  /** Send the composed answer back to the chat */
  onSend?: (text: string) => void
  /** Already answered — render read-only */
  readOnly?: boolean
  /** true → 개별 전송 버튼 숨김 (다중 질문 그룹 모드) */
  grouped?: boolean
  /** 그룹 내 질문 인덱스 */
  questionIndex?: number
  /** 그룹 모드에서 답변 변경 콜백 */
  onAnswerChange?: (index: number, answer: string | null) => void
  /** 부모가 전체 전송 완료 시 true */
  submittedExternally?: boolean
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

export function QuestionBlock({
  raw,
  onSend,
  readOnly = false,
  grouped = false,
  questionIndex = 0,
  onAnswerChange,
  submittedExternally = false
}: QuestionBlockProps) {
  const { title, options } = parseQuestion(raw)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(readOnly)

  // 그룹 모드에서 외부 전송 완료 시 read-only 전환
  useEffect(() => {
    if (grouped && submittedExternally) {
      setSubmitted(true)
    }
  }, [grouped, submittedExternally])

  // 그룹 모드에서 답변 변경 시 부모에게 알림
  const notifyParent = useCallback(
    (sel: Set<number>, cmt: string) => {
      if (!grouped || !onAnswerChange) return
      const parts: string[] = []
      if (sel.size > 0) {
        const chosen = options.filter((_, i) => sel.has(i))
        parts.push(chosen.map((o) => `- [x] ${o}`).join('\n'))
      }
      if (cmt.trim()) {
        parts.push(`추가 의견: ${cmt.trim()}`)
      }
      onAnswerChange(questionIndex, parts.length > 0 ? parts.join('\n') : null)
    },
    [grouped, onAnswerChange, questionIndex, options]
  )

  const toggle = (idx: number) => {
    if (submitted) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      notifyParent(next, comment)
      return next
    })
  }

  const handleCommentChange = (value: string) => {
    setComment(value)
    notifyParent(selected, value)
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
            onChange={(e) => handleCommentChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !grouped) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="추가 의견 (선택)"
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10
                       text-sm text-text placeholder:text-text-muted
                       focus:outline-none focus:border-accent/50 transition-colors"
          />
          {/* 그룹 모드가 아닐 때만 개별 전송 버튼 */}
          {!grouped && (
            <button
              onClick={handleSubmit}
              disabled={selected.size === 0 && !comment.trim()}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                         bg-accent text-white hover:bg-accent/80
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              답변 전송
            </button>
          )}
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
