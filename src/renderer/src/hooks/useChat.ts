import { useEffect, useCallback, useState } from 'react'
import { useSessionStore } from '../stores/session-store'
import { useAgentStore } from '../stores/agent-store'
import { ChatMessage, PermissionRequest } from '../../../shared/types'

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
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null)

  useEffect(() => {
    if (!agentId) return

    loadHistory(agentId)

    // 에이전트가 현재 작업 중이면 streaming 상태 복원
    window.api.agent.getState(agentId).then((state) => {
      if (state && state.status === 'working') {
        setStreaming(true)
      }
    })

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

    // 위임 이벤트 리스너
    unsubs.push(
      window.api.on('delegation:started', (data: unknown) => {
        const d = data as {
          leaderAgentId: string
          leaderName: string
          delegatedTo: { id: string; name: string }[]
          totalCount: number
        }
        if (d.leaderAgentId === agentId) {
          const names = d.delegatedTo.map((a) => a.name).join(', ')
          addMessage({
            id: `delegation-start-${Date.now()}`,
            agentId: d.leaderAgentId,
            role: 'system',
            content: `${names}에게 작업 위임 중... (${d.totalCount}건)`,
            timestamp: Date.now()
          })
        }
      })
    )

    unsubs.push(
      window.api.on('delegation:agent-completed', (data: unknown) => {
        const d = data as {
          leaderAgentId: string
          agentName: string
          completedCount: number
          totalCount: number
          remainingCount: number
        }
        if (d.leaderAgentId === agentId) {
          addMessage({
            id: `delegation-progress-${Date.now()}`,
            agentId: d.leaderAgentId,
            role: 'system',
            content: `${d.agentName} 완료 (${d.completedCount}/${d.totalCount})${d.remainingCount > 0 ? `, ${d.remainingCount}명 남음` : ''}`,
            timestamp: Date.now()
          })
        }
      })
    )

    unsubs.push(
      window.api.on('delegation:synthesizing', (data: unknown) => {
        const d = data as { leaderAgentId: string; leaderName: string }
        if (d.leaderAgentId === agentId) {
          addMessage({
            id: `delegation-synth-${Date.now()}`,
            agentId: d.leaderAgentId,
            role: 'system',
            content: `${d.leaderName}이 결과를 종합하고 있습니다...`,
            timestamp: Date.now()
          })
        }
      })
    )

    // MCP 설정 변경 이벤트
    unsubs.push(
      window.api.on('mcp:config-changed', (data: unknown) => {
        const d = data as { agentId?: string; serverName?: string; added?: number; removed?: number }
        if (d.agentId === agentId || !d.agentId) {
          addMessage({
            id: `mcp-change-${Date.now()}`,
            agentId: agentId || '',
            role: 'system',
            content: `MCP 설정 변경됨${d.added ? ` (+${d.added})` : ''}${d.removed ? ` (-${d.removed})` : ''}`,
            timestamp: Date.now()
          })
        }
      })
    )

    // 퍼미션 요청 이벤트
    unsubs.push(
      window.api.on('permission:request', (data: unknown) => {
        const req = data as PermissionRequest
        if (req.agentId === agentId) {
          setPermissionRequest(req)
        }
      })
    )

    unsubs.push(
      window.api.on('permission:timeout', (data: unknown) => {
        const req = data as PermissionRequest
        if (req.agentId === agentId) {
          setPermissionRequest(null)
          addMessage({
            id: `perm-timeout-${Date.now()}`,
            agentId: req.agentId,
            role: 'system',
            content: `퍼미션 요청 타임아웃: ${req.toolName} (자동 거부)`,
            timestamp: Date.now()
          })
        }
      })
    )

    return () => unsubs.forEach((fn) => fn())
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const respondToPermission = useCallback(
    async (requestId: string, allowed: boolean) => {
      await window.api.permission.respond(requestId, allowed)
      setPermissionRequest(null)
      addMessage({
        id: `perm-response-${Date.now()}`,
        agentId: agentId || '',
        role: 'system',
        content: `퍼미션 ${allowed ? '허용' : '거부'}됨`,
        timestamp: Date.now()
      })
    },
    [agentId, addMessage]
  )

  return {
    messages,
    streaming,
    streamingContent,
    sendMessage,
    abort,
    clear,
    permissionRequest,
    respondToPermission
  }
}
