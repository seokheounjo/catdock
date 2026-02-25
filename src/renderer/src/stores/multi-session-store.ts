import { create } from 'zustand'
import { ChatMessage } from '../../../shared/types'

// 에이전트별 세션 상태
export interface AgentSessionState {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  streamingMsgId: string | null
}

interface MultiSessionStore {
  sessions: Record<string, AgentSessionState>

  // 히스토리 로드/언로드
  loadHistory: (agentId: string) => Promise<void>
  unloadSession: (agentId: string) => void

  // 메시지 관리
  addMessage: (agentId: string, msg: ChatMessage) => void
  clearMessages: (agentId: string) => void

  // 스트리밍
  startStream: (agentId: string, msgId: string) => void
  appendStreamDelta: (agentId: string, msgId: string, delta: string) => void
  finalizeStream: (agentId: string, msg: ChatMessage) => void

  // 특정 에이전트 세션 가져오기
  getSession: (agentId: string) => AgentSessionState
}

const emptySession: AgentSessionState = {
  messages: [],
  streaming: false,
  streamingContent: '',
  streamingMsgId: null
}

export const useMultiSessionStore = create<MultiSessionStore>((set, get) => ({
  sessions: {},

  loadHistory: async (agentId: string) => {
    const messages = await window.api.session.getHistory(agentId)
    set((state) => ({
      sessions: {
        ...state.sessions,
        [agentId]: {
          messages: messages || [],
          streaming: false,
          streamingContent: '',
          streamingMsgId: null
        }
      }
    }))
  },

  unloadSession: (agentId: string) => {
    set((state) => {
      const { [agentId]: _, ...rest } = state.sessions
      return { sessions: rest }
    })
  },

  addMessage: (agentId: string, msg: ChatMessage) => {
    set((state) => {
      const session = state.sessions[agentId] || { ...emptySession }
      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            messages: [...session.messages, msg]
          }
        }
      }
    })
  },

  clearMessages: (agentId: string) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [agentId]: { ...emptySession }
      }
    }))
  },

  startStream: (agentId: string, msgId: string) => {
    set((state) => {
      const session = state.sessions[agentId] || { ...emptySession }
      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            streaming: true,
            streamingContent: '',
            streamingMsgId: msgId
          }
        }
      }
    })
  },

  appendStreamDelta: (agentId: string, msgId: string, delta: string) => {
    set((state) => {
      const session = state.sessions[agentId] || { ...emptySession }
      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            streaming: true,
            streamingMsgId: msgId,
            streamingContent: session.streamingContent + delta
          }
        }
      }
    })
  },

  finalizeStream: (agentId: string, msg: ChatMessage) => {
    set((state) => {
      const session = state.sessions[agentId] || { ...emptySession }
      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            messages: [...session.messages, msg],
            streaming: false,
            streamingContent: '',
            streamingMsgId: null
          }
        }
      }
    })
  },

  getSession: (agentId: string) => {
    return get().sessions[agentId] || { ...emptySession }
  }
}))
