import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useAgentStore } from '../stores/agent-store'
import { ChatMessage } from '../../../shared/types'

export function useChat(agentId: string | null) {
  const {
    messages,
    streaming,
    streamingContent,
    loadHistory,
    addMessage,
    appendStreamDelta,
    finalizeStream,
    setStreaming,
    clearMessages
  } = useSessionStore()

  const { setAgentStatus } = useAgentStore()

  useEffect(() => {
    if (!agentId) return

    loadHistory(agentId)

    // Listen for IPC events
    const unsubs: (() => void)[] = []

    unsubs.push(
      window.api.on('session:message', (msgAgentId: unknown, msg: unknown) => {
        if (msgAgentId === agentId) {
          addMessage(msg as ChatMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-start', (msgAgentId: unknown, _msg: unknown) => {
        if (msgAgentId === agentId) {
          setStreaming(true)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-delta', (msgAgentId: unknown, data: unknown) => {
        if (msgAgentId === agentId) {
          const d = data as { id: string; delta: string }
          appendStreamDelta(d.id, d.delta)
        }
      })
    )

    unsubs.push(
      window.api.on('session:stream-end', (msgAgentId: unknown, msg: unknown) => {
        if (msgAgentId === agentId) {
          finalizeStream(msg as ChatMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('session:cleared', (clearedId: unknown) => {
        if (clearedId === agentId) {
          clearMessages()
        }
      })
    )

    unsubs.push(
      window.api.on('agent:status-changed', (_agentId: unknown, data: unknown) => {
        const d = data as { id: string; status: 'idle' | 'working' | 'error' }
        if (d.id === agentId) {
          setAgentStatus(d.id, d.status)
        }
      })
    )

    return () => unsubs.forEach((fn) => fn())
  }, [agentId])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!agentId || !message.trim()) return
      await window.api.session.send(agentId, message.trim())
    },
    [agentId]
  )

  const abort = useCallback(async () => {
    if (!agentId) return
    await window.api.session.abort(agentId)
  }, [agentId])

  const clear = useCallback(async () => {
    if (!agentId) return
    await window.api.session.clear(agentId)
  }, [agentId])

  return {
    messages,
    streaming,
    streamingContent,
    sendMessage,
    abort,
    clear
  }
}
