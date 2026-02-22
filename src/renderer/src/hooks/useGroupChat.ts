import { useEffect, useCallback } from 'react'
import { useConversationStore } from '../stores/conversation-store'
import { ConversationMessage, ConversationMode, ConversationStatus } from '../../../shared/types'

export function useGroupChat(conversationId: string | null) {
  const {
    messages,
    status,
    currentAgentId,
    mode,
    streaming,
    streamingContent,
    streamingAgentId,
    streamingAgentName,
    loadHistory,
    loadState,
    addMessage,
    setStatus,
    setMode,
    startStream,
    appendStreamDelta,
    finalizeStream,
    clearMessages
  } = useConversationStore()

  useEffect(() => {
    if (!conversationId) return

    loadHistory(conversationId)
    loadState(conversationId)

    // 현재 대화의 모드 로드
    window.api.conversation.get(conversationId).then((config) => {
      if (config) setMode(config.mode)
    })

    const unsubs: (() => void)[] = []

    unsubs.push(
      window.api.on('conversation:message', (convId: unknown, msg: unknown) => {
        if (convId === conversationId) {
          addMessage(msg as ConversationMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:stream-start', (convId: unknown, data: unknown) => {
        if (convId === conversationId) {
          const d = data as { id: string; agentId: string; agentName: string }
          startStream(d.id, d.agentId, d.agentName)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:stream-delta', (convId: unknown, data: unknown) => {
        if (convId === conversationId) {
          const d = data as { id: string; delta: string }
          appendStreamDelta(d.id, d.delta)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:stream-end', (convId: unknown, msg: unknown) => {
        if (convId === conversationId) {
          finalizeStream(msg as ConversationMessage)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:status-changed', (convId: unknown, data: unknown) => {
        if (convId === conversationId) {
          const d = data as { status: ConversationStatus; currentAgentId: string | null }
          setStatus(d.status, d.currentAgentId)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:mode-changed', (convId: unknown, newMode: unknown) => {
        if (convId === conversationId) {
          setMode(newMode as ConversationMode)
        }
      })
    )

    unsubs.push(
      window.api.on('conversation:cleared', (convId: unknown) => {
        if (convId === conversationId) {
          clearMessages()
        }
      })
    )

    return () => unsubs.forEach((fn) => fn())
  }, [conversationId])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!conversationId || !message.trim()) return
      await window.api.conversation.send(conversationId, message.trim())
    },
    [conversationId]
  )

  const triggerAgent = useCallback(
    async (agentId: string) => {
      if (!conversationId) return
      await window.api.conversation.triggerAgent(conversationId, agentId)
    },
    [conversationId]
  )

  const pause = useCallback(async () => {
    if (!conversationId) return
    await window.api.conversation.pause(conversationId)
  }, [conversationId])

  const resume = useCallback(async () => {
    if (!conversationId) return
    await window.api.conversation.resume(conversationId)
  }, [conversationId])

  const abort = useCallback(async () => {
    if (!conversationId) return
    await window.api.conversation.abort(conversationId)
  }, [conversationId])

  const clear = useCallback(async () => {
    if (!conversationId) return
    await window.api.conversation.clear(conversationId)
  }, [conversationId])

  const changeMode = useCallback(
    async (newMode: ConversationMode) => {
      if (!conversationId) return
      await window.api.conversation.setMode(conversationId, newMode)
    },
    [conversationId]
  )

  return {
    messages,
    status,
    currentAgentId,
    mode,
    streaming,
    streamingContent,
    streamingAgentId,
    streamingAgentName,
    sendMessage,
    triggerAgent,
    pause,
    resume,
    abort,
    clear,
    changeMode
  }
}
