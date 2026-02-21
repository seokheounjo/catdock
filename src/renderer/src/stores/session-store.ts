import { create } from 'zustand'
import { ChatMessage } from '../../../shared/types'

interface SessionStore {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  streamingId: string | null

  loadHistory: (agentId: string) => Promise<void>
  addMessage: (msg: ChatMessage) => void
  setStreaming: (streaming: boolean) => void
  appendStreamDelta: (id: string, delta: string) => void
  finalizeStream: (msg: ChatMessage) => void
  clearMessages: () => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  messages: [],
  streaming: false,
  streamingContent: '',
  streamingId: null,

  loadHistory: async (agentId: string) => {
    const messages = await window.api.session.getHistory(agentId)
    set({ messages: messages || [] })
  },

  addMessage: (msg: ChatMessage) => {
    set({ messages: [...get().messages, msg] })
  },

  setStreaming: (streaming: boolean) => {
    set({ streaming })
    if (!streaming) {
      set({ streamingContent: '', streamingId: null })
    }
  },

  appendStreamDelta: (id: string, delta: string) => {
    set({
      streaming: true,
      streamingId: id,
      streamingContent: get().streamingContent + delta
    })
  },

  finalizeStream: (msg: ChatMessage) => {
    // Replace streaming with final message
    set({
      messages: [...get().messages, msg],
      streaming: false,
      streamingContent: '',
      streamingId: null
    })
  },

  clearMessages: () => {
    set({ messages: [], streaming: false, streamingContent: '', streamingId: null })
  }
}))
