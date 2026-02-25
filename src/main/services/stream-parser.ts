import type { CliAdapter } from './cli-adapters/cli-adapter'
import type { UnifiedStreamEvent } from '../../shared/types'

// 스트림 파싱 콜백
export interface StreamParserCallbacks {
  onInit?: (sessionId: string) => void
  onText?: (text: string) => void
  onToolUse?: (toolName: string, toolInput: Record<string, unknown>) => void
  onToolResult?: (output: string) => void
  onCost?: (totalCostUsd: number) => void
  onResult?: (resultText: string) => void
  onError?: (message: string) => void
}

// 통합 스트림 파서 — 어댑터별 파싱 로직을 추상화
export class StreamParser {
  private lineBuffer = ''
  private adapter: CliAdapter

  constructor(adapter: CliAdapter) {
    this.adapter = adapter
  }

  // stdout chunk 처리 — 줄 단위로 분리 후 어댑터에 위임
  processChunk(chunk: string, callbacks: StreamParserCallbacks): void {
    this.lineBuffer += chunk
    const lines = this.lineBuffer.split('\n')
    this.lineBuffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      const events = this.adapter.parseStreamLine(line)
      if (events) {
        this._dispatchEvents(events, callbacks)
      }
    }
  }

  // 잔여 버퍼 처리 (프로세스 종료 시)
  flush(callbacks: StreamParserCallbacks): void {
    if (this.lineBuffer.trim()) {
      const events = this.adapter.parseStreamLine(this.lineBuffer)
      if (events) {
        this._dispatchEvents(events, callbacks)
      }
      this.lineBuffer = ''
    }
  }

  private _dispatchEvents(events: UnifiedStreamEvent[], callbacks: StreamParserCallbacks): void {
    for (const event of events) {
      switch (event.type) {
        case 'init':
          if (event.sessionId && callbacks.onInit) callbacks.onInit(event.sessionId)
          break
        case 'text':
          if (event.text && callbacks.onText) callbacks.onText(event.text)
          break
        case 'tool-use':
          if (event.toolName && callbacks.onToolUse)
            callbacks.onToolUse(event.toolName, event.toolInput ?? {})
          break
        case 'tool-result':
          if (event.toolOutput && callbacks.onToolResult) callbacks.onToolResult(event.toolOutput)
          break
        case 'cost':
          if (event.totalCostUsd !== undefined && callbacks.onCost)
            callbacks.onCost(event.totalCostUsd)
          break
        case 'result':
          if (event.resultText !== undefined && callbacks.onResult)
            callbacks.onResult(event.resultText)
          break
        case 'error':
          if (event.errorMessage && callbacks.onError) callbacks.onError(event.errorMessage)
          break
      }
    }
  }
}

// 도구 입력 포맷팅 (공용)
export function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    return (input.file_path as string) || JSON.stringify(input)
  }
  if (toolName === 'Bash') {
    return (input.command as string) || JSON.stringify(input)
  }
  if (toolName === 'Grep' || toolName === 'Glob') {
    return (input.pattern as string) || JSON.stringify(input)
  }
  return JSON.stringify(input)
}
