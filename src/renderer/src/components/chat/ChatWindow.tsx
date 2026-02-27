import { useEffect, useState } from 'react'
import { AgentConfig, AgentState } from '../../../../shared/types'
import { AgentHeader } from './AgentHeader'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { PermissionDialog } from './PermissionDialog'
import { useChat } from '../../hooks/useChat'
import { useI18n } from '../../hooks/useI18n'

interface ChatWindowProps {
  agentId: string
}

export function ChatWindow({ agentId }: ChatWindowProps) {
  const { t } = useI18n()
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [status, setStatus] = useState<AgentState['status']>('idle')
  const {
    messages,
    streaming,
    streamingContent,
    sendMessage,
    abort,
    clear,
    permissionRequest,
    respondToPermission
  } = useChat(agentId)

  useEffect(() => {
    // Load agent config
    window.api.agent.getState(agentId).then((state) => {
      if (state) {
        setAgent(state.config)
        setStatus(state.status)
      }
    })

    // Listen for status changes
    const unsub = window.api.on('agent:status-changed', (_id: unknown, data: unknown) => {
      const d = data as { id: string; status: AgentState['status'] }
      if (d.id === agentId) {
        setStatus(d.status)
      }
    })

    return unsub
  }, [agentId])

  if (!agent) {
    return (
      <div className="h-screen bg-chat-bg flex items-center justify-center text-text-muted">
        {t('chat.loading')}
      </div>
    )
  }

  return (
    <div className="h-screen bg-chat-bg flex flex-col">
      <AgentHeader
        agent={agent}
        status={status}
        onMinimize={() => window.api.window.minimize()}
        onClose={() => window.api.window.close()}
        onClear={clear}
      />
      <MessageList messages={messages} streaming={streaming} streamingContent={streamingContent} />
      {permissionRequest && (
        <PermissionDialog request={permissionRequest} onRespond={respondToPermission} />
      )}
      <ChatInput
        onSend={sendMessage}
        onAbort={abort}
        streaming={streaming}
        agentRole={agent.hierarchy?.role}
        onSendWithMode={(msg, mode) => {
          const prefix = mode === 'plan-first'
            ? '[MODE:plan-first]\n'
            : '[MODE:execute-now]\n'
          sendMessage(prefix + msg)
        }}
      />
    </div>
  )
}
