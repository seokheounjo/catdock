import { useState, useEffect } from 'react'
import { AgentConfig } from '../../../../shared/types'
import { generateAvatar } from '../../utils/avatar'
import { useI18n } from '../../hooks/useI18n'

export function ConversationCreator() {
  const { t } = useI18n()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [maxRounds, setMaxRounds] = useState(3)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    window.api.agent.list().then(setAgents)
  }, [])

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleCreate = async () => {
    if (!name.trim() || selectedIds.length < 2) return
    setCreating(true)
    try {
      const conv = await window.api.conversation.create({
        name: name.trim(),
        participantIds: selectedIds,
        mode: 'auto-chain',
        maxRoundsPerChain: maxRounds
      })
      // 생성 후 그룹 채팅 윈도우 열기
      await window.api.window.openGroupChat(conv.id)
      // 생성 창 닫기
      await window.api.window.close()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-screen bg-chat-bg flex flex-col">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-chat-sidebar border-b border-white/5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="text-sm font-medium text-text">{t('groupChat.newGroupChat')}</div>
        <button
          onClick={() => window.api.window.close()}
          className="w-7 h-7 rounded-md hover:bg-danger/20 text-text-muted hover:text-danger flex items-center justify-center cursor-pointer bg-transparent border-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          &#x2715;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 이름 */}
        <div>
          <label className="text-xs text-text-muted block mb-1">{t('groupChat.roomName')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('groupChat.roomNamePlaceholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent/50 placeholder:text-text-muted"
          />
        </div>

        {/* 참여자 선택 */}
        <div>
          <label className="text-xs text-text-muted block mb-1">
            {t('groupChat.participants')} ({t('groupChat.participantsCount', { count: String(selectedIds.length) })})
          </label>
          <div className="space-y-1">
            {agents.map((agent) => {
              const selected = selectedIds.includes(agent.id)
              return (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all bg-transparent text-left ${
                    selected
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-white/5 hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  <img
                    src={generateAvatar(agent.avatar.style, agent.avatar.seed)}
                    alt={agent.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text truncate">{agent.name}</div>
                    <div className="text-xs text-text-muted">{agent.role}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selected ? 'border-accent bg-accent' : 'border-white/20'
                  }`}>
                    {selected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 최대 라운드 */}
        <div>
          <label className="text-xs text-text-muted block mb-1">{t('groupChat.maxRounds')}</label>
          <div className="flex gap-2">
            {[1, 2, 3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => setMaxRounds(n)}
                className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer transition-all ${
                  maxRounds === n
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-white/5 border-white/10 text-text-muted hover:bg-white/10'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="px-4 py-3 bg-chat-sidebar border-t border-white/5">
        <button
          onClick={handleCreate}
          disabled={!name.trim() || selectedIds.length < 2 || creating}
          className={`w-full py-2.5 rounded-lg text-sm font-medium border-none cursor-pointer transition-all ${
            name.trim() && selectedIds.length >= 2 && !creating
              ? 'bg-accent hover:bg-accent-hover text-white'
              : 'bg-white/10 text-text-muted cursor-not-allowed'
          }`}
        >
          {creating ? t('groupChat.creating') : t('groupChat.createGroupChat')}
        </button>
      </div>
    </div>
  )
}
