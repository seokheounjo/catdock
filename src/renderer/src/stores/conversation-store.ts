import { create } from 'zustand'
import {
  ConversationConfig,
  ConversationMessage,
  ConversationMode,
  ConversationStatus
} from '../../../shared/types'

interface ConversationStore {
  conversations: ConversationConfig[]
  messages: ConversationMessage[]
  status: ConversationStatus
  currentAgentId: string | null
  mode: ConversationMode
  streaming: boolean
  streamingContent: string
  streamingMsgId: string | null
  streamingAgentId: string | null
  streamingAgentName: string | null

  fetchConversations: () => Promise<void>
  loadHistory: (conversationId: string) => Promise<void>
  loadState: (conversationId: string) => Promise<void>
  addMessage: (msg: ConversationMessage) => void
  setStatus: (status: ConversationStatus, currentAgentId: string | null) => void
  setMode: (mode: ConversationMode) => void
  startStream: (id: string, agentId: string, agentName: string) => void
  appendStreamDelta: (id: string, delta: string) => void
  finalizeStream: (msg: ConversationMessage) => void
  clearMessages: () => void
  removeConversation: (id: string) => void
  deleteConversation: (id: string) => Promise<void>
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: [],
  messages: [],
  status: 'idle',
  currentAgentId: null,
  mode: 'auto-chain',
  streaming: false,
  streamingContent: '',
  streamingMsgId: null,
  streamingAgentId: null,
  streamingAgentName: null,

  fetchConversations: async () => {
    const conversations = await window.api.conversation.list()
    set({ conversations: conversations || [] })
  },

  loadHistory: async (conversationId: string) => {
    const messages = await window.api.conversation.getHistory(conversationId)
    set({ messages: messages || [] })
  },

  loadState: async (conversationId: string) => {
    const state = await window.api.conversation.getState(conversationId)
    if (state) {
      set({ status: state.status, currentAgentId: state.currentAgentId })
    }
  },

  addMessage: (msg: ConversationMessage) => {
    set({ messages: [...get().messages, msg] })
  },

  setStatus: (status: ConversationStatus, currentAgentId: string | null) => {
    set({ status, currentAgentId })
  },

  setMode: (mode: ConversationMode) => {
    set({ mode })
  },

  startStream: (id: string, agentId: string, agentName: string) => {
    set({
      streaming: true,
      streamingContent: '',
      streamingMsgId: id,
      streamingAgentId: agentId,
      streamingAgentName: agentName
    })
  },

  appendStreamDelta: (id: string, delta: string) => {
    if (get().streamingMsgId === id || !get().streamingMsgId) {
      set({
        streaming: true,
        streamingMsgId: id,
        streamingContent: get().streamingContent + delta
      })
    }
  },

  finalizeStream: (msg: ConversationMessage) => {
    // 빈 응답 건너뛰기
    if ((msg as unknown as Record<string, unknown>).skipped) {
      set({
        streaming: false,
        streamingContent: '',
        streamingMsgId: null,
        streamingAgentId: null,
        streamingAgentName: null
      })
      return
    }
    set({
      messages: [...get().messages, msg],
      streaming: false,
      streamingContent: '',
      streamingMsgId: null,
      streamingAgentId: null,
      streamingAgentName: null
    })
  },

  clearMessages: () => {
    set({
      messages: [],
      streaming: false,
      streamingContent: '',
      streamingMsgId: null,
      streamingAgentId: null,
      streamingAgentName: null,
      status: 'idle',
      currentAgentId: null
    })
  },

  removeConversation: (id: string) => {
    set({ conversations: get().conversations.filter((c) => c.id !== id) })
  },

  deleteConversation: async (id: string) => {
    await window.api.conversation.delete(id)
    set({ conversations: get().conversations.filter((c) => c.id !== id) })
  }
}))
