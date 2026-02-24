import { useEffect, useState, useMemo } from 'react'
import { AgentConfig, ConversationConfig } from '../../../../shared/types'
import { GroupChatHeader } from './GroupChatHeader'
import { GroupMessageList } from './GroupMessageList'
import { GroupChatInput } from './GroupChatInput'
import { ParticipantBar } from './ParticipantBar'
import { useGroupChat } from '../../hooks/useGroupChat'
import { useI18n } from '../../hooks/useI18n'

interface GroupChatWindowProps {
  conversationId: string
}

export function GroupChatWindow({ conversationId }: GroupChatWindowProps) {
  const { t } = useI18n()
  const [config, setConfig] = useState<ConversationConfig | null>(null)
  const [participants, setParticipants] = useState<AgentConfig[]>([])

  const {
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
  } = useGroupChat(conversationId)

  useEffect(() => {
    // 대화방 설정 로드
    window.api.conversation.get(conversationId).then((c) => {
      if (c) setConfig(c)
    })

    // 참여자 에이전트 정보 로드
    window.api.agent.list().then((agents) => {
      window.api.conversation.get(conversationId).then((c) => {
        if (c) {
          const parts = c.participantIds
            .map((id) => agents.find((a) => a.id === id))
            .filter(Boolean) as AgentConfig[]
          setParticipants(parts)
        }
      })
    })
  }, [conversationId])

  const agentsMap = useMemo(() => {
    const map = new Map<string, AgentConfig>()
    participants.forEach((a) => map.set(a.id, a))
    return map
  }, [participants])

  if (!config) {
    return (
      <div className="h-screen bg-chat-bg flex items-center justify-center text-text-muted">
        {t('groupChat.loading')}
      </div>
    )
  }

  return (
    <div className="h-screen bg-chat-bg flex flex-col">
      <GroupChatHeader
        name={config.name}
        participants={participants}
        status={status}
        mode={mode}
        onToggleMode={() => changeMode(mode === 'auto-chain' ? 'manual' : 'auto-chain')}
        onMinimize={() => window.api.window.minimize()}
        onClose={() => window.api.window.close()}
        onClear={clear}
        onDelete={async () => {
          await window.api.conversation.delete(conversationId)
          window.api.window.close()
        }}
      />

      <GroupMessageList
        messages={messages}
        agents={agentsMap}
        streaming={streaming}
        streamingContent={streamingContent}
        streamingAgentId={streamingAgentId}
        streamingAgentName={streamingAgentName}
      />

      {/* 수동 모드에서 참여자 트리거 바 */}
      {mode === 'manual' && (
        <ParticipantBar
          participants={participants}
          currentAgentId={currentAgentId}
          status={status}
          onTriggerAgent={triggerAgent}
        />
      )}

      <GroupChatInput
        onSend={sendMessage}
        onPause={pause}
        onResume={resume}
        onAbort={abort}
        status={status}
      />
    </div>
  )
}
