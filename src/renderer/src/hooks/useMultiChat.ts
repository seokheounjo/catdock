import { useEffect, useCallback, useRef } from 'react'
import { useMultiSessionStore } from '../stores/multi-session-store'
import { ChatMessage } from '../../../shared/types'

export function useMultiChat(agentIds: string[]) {
  const store = useMultiSessionStore()
  const prevIdsRef = useRef<string[]>([])

  // agentIds 변경 시 히스토리 로드/언로드
  useEffect(() => {
    const prevIds = prevIdsRef.current
    const newIds = agentIds.filter((id) => !prevIds.includes(id))
    const removedIds = prevIds.filter((id) => !agentIds.includes(id))

    newIds.forEach((id) => store.loadHistory(id))
    removedIds.forEach((id) => store.unloadSession(id))

    prevIdsRef.current = agentIds
  }, [agentIds.join(',')])

  // IPC 리스너 — 1세트로 N개 에이전트 이벤트 라우팅
  useEffect(() => {
    const unsubs: (() => void)[] = []

    unsubs.push(
      window.api.on('session:message', (msgAgentId: unknown, msg: unknown) => {
        const id = msgAgentId as string
        if (agentIds.includes(id)) {
          store.addMessage(id, msg as ChatMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-start', (msgAgentId: unknown, msg: unknown) => {
        const id = msgAgentId as string
        if (agentIds.includes(id)) {
          const m = msg as ChatMessage
          store.startStream(id, m.id)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-delta', (msgAgentId: unknown, data: unknown) => {
        const id = msgAgentId as string
        if (agentIds.includes(id)) {
          const d = data as { id: string; delta: string }
          store.appendStreamDelta(id, d.id, d.delta)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-end', (msgAgentId: unknown, msg: unknown) => {
        const id = msgAgentId as string
        if (agentIds.includes(id)) {
          store.finalizeStream(id, msg as ChatMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('session:cleared', (clearedId: unknown) => {
        const id = clearedId as string
        if (agentIds.includes(id)) {
          store.clearMessages(id)
        }
      })
    )

    return () => unsubs.forEach((fn) => fn())
  }, [agentIds.join(',')])

  const sendMessage = useCallback(async (agentId: string, message: string) => {
    if (!agentId || !message.trim()) return
    await window.api.session.send(agentId, message.trim())
  }, [])

  const abort = useCallback(async (agentId: string) => {
    await window.api.session.abort(agentId)
  }, [])

  const clear = useCallback(async (agentId: string) => {
    await window.api.session.clear(agentId)
  }, [])

  return {
    getSession: store.getSession,
    sessions: store.sessions,
    sendMessage,
    abort,
    clear
  }
}
