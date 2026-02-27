import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import {
  CliProvider,
  CliProfile,
  DockSize,
  ConversationConfig,
  DiscoveredMcpServer,
  DiscoveredLocalModel,
  LocalLlmSource,
  LlmDiscoveryResult
} from '../../../shared/types'
import { CLI_PROVIDER_OPTIONS } from '../../../shared/constants'
import { useI18n } from '../hooks/useI18n'
import { useSettingsStore } from '../stores/settings-store'

export function SettingsPage() {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useTheme()
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const [dockSize, setDockSize] = useState<DockSize>('medium')
  const [cliUpdate, setCliUpdate] = useState<{ latestVersion: string } | null>(null)
  const [groupChatOpen, setGroupChatOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationConfig[]>([])
  const [discoveredMcp, setDiscoveredMcp] = useState<DiscoveredMcpServer[]>([])
  const [mcpScanOpen, setMcpScanOpen] = useState(false)
  const [mcpScanning, setMcpScanning] = useState(false)

  // 로컬 LLM
  const [llmScanOpen, setLlmScanOpen] = useState(false)
  const [llmScanning, setLlmScanning] = useState(false)
  const [localModels, setLocalModels] = useState<DiscoveredLocalModel[]>([])
  const [llmSources, setLlmSources] = useState<
    { source: LocalLlmSource; available: boolean; version?: string; error?: string }[]
  >([])

  // CLI 프로필
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [profiles, setProfiles] = useState<CliProfile[]>([])
  const [profileUsage, setProfileUsage] = useState<Record<string, number>>({})
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileProvider, setNewProfileProvider] = useState<CliProvider>('claude')
  const [newProfileConfigDir, setNewProfileConfigDir] = useState('')
  const [showProfileForm, setShowProfileForm] = useState(false)

  useEffect(() => {
    fetchSettings()
    // 발견된 MCP 서버 로드
    window.api.mcp.getDiscovered().then(setDiscoveredMcp).catch(() => {})
    // 로컬 LLM 모델 로드
    window.api.llm.getDiscovered().then(setLocalModels).catch(() => {})
    // CLI 프로필 로드
    window.api.profile.list().then(setProfiles).catch(() => {})
    window.api.profile.getUsage().then(setProfileUsage).catch(() => {})
    window.api.settings.get().then((s) => {
      if (s.dockSize) setDockSize(s.dockSize)
    })
    window.api.cli
      .checkUpdate()
      .then((result) => {
        if (result.updateAvailable && result.latestVersion) {
          setCliUpdate({ latestVersion: result.latestVersion })
        }
      })
      .catch(() => {})
    window.api.conversation.list().then(setConversations).catch(() => {})

    const unsubs = [
      window.api.on('dock:size-changed', (size: unknown) => setDockSize(size as DockSize)),
      window.api.on('cli:update-available', (data: unknown) => {
        setCliUpdate(data as { latestVersion: string })
      }),
      window.api.on('conversation:created', () => {
        window.api.conversation.list().then(setConversations).catch(() => {})
      }),
      window.api.on('conversation:deleted', () => {
        window.api.conversation.list().then(setConversations).catch(() => {})
      }),
      window.api.on('llm:discovered', (data: unknown) => {
        const result = data as LlmDiscoveryResult
        setLocalModels(result.models)
        setLlmSources(result.sources)
      }),
      window.api.on('profile:changed', (data: unknown) => {
        setProfiles(data as CliProfile[])
        window.api.profile.getUsage().then(setProfileUsage).catch(() => {})
      })
    ]
    return () => {
      unsubs.forEach((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const menuBtn = `w-full px-4 py-3 text-left text-sm text-text hover:bg-white/10
                    focus:bg-white/10 focus:outline-none cursor-pointer bg-transparent border-none
                    flex items-center gap-3 transition-colors duration-150`

  return (
    <div className="w-full h-full bg-chat-bg flex flex-col select-none">
      {/* 타이틀 바 */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-text">{t('settings.title')}</span>
        <button
          className="w-6 h-6 rounded flex items-center justify-center text-text-muted
                     hover:bg-white/10 hover:text-text cursor-pointer bg-transparent border-none transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => window.api.window.close()}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 메뉴 목록 */}
      <div className="flex-1 overflow-y-auto flex flex-col py-1">
        {/* 그룹 채팅 — 토글 섹션 */}
        <button
          className={menuBtn}
          onClick={() => setGroupChatOpen((v) => !v)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 14v1a2 2 0 002 2h8l4 3v-3a2 2 0 002-2V7a2 2 0 00-2-2h-3" />
            <rect x="1" y="1" width="12" height="10" rx="2" />
          </svg>
          <span className="flex-1">{t('settings.groupChat')}</span>
          {conversations.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-text-muted">
              {conversations.length}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform duration-200 ${groupChatOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </svg>
        </button>
        {groupChatOpen && (
          <div className="px-4 pb-2 space-y-1">
            {/* 기존 방 목록 */}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5
                           border border-white/10 hover:border-accent/40 hover:bg-white/10
                           cursor-pointer transition-colors text-left"
                onClick={() => {
                  window.api.window.openGroupChat(conv.id)
                  window.api.window.close()
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-text-muted shrink-0"
                >
                  <path d="M4 14v1a2 2 0 002 2h8l4 3v-3a2 2 0 002-2V7a2 2 0 00-2-2h-3" />
                  <rect x="1" y="1" width="12" height="10" rx="2" />
                </svg>
                <span className="text-xs text-text truncate flex-1">{conv.name}</span>
                <span className="text-[10px] text-text-muted shrink-0">
                  {conv.participantIds.length}{t('settings.groupChatMembers')}
                </span>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="text-[11px] text-text-muted text-center py-2">
                {t('settings.noGroupChats')}
              </div>
            )}
            {/* 새 방 만들기 버튼 */}
            <button
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                         border border-dashed border-white/20 hover:border-accent/50 hover:bg-accent/10
                         cursor-pointer transition-colors bg-transparent"
              onClick={() => {
                window.api.window.openNewConversation()
                window.api.window.close()
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-accent"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-xs text-accent">{t('settings.newGroupChat')}</span>
            </button>
          </div>
        )}

        <button
          className={menuBtn}
          onClick={() => {
            window.api.window.openDashboard()
            window.api.window.close()
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="7" height="7" rx="1" />
            <rect x="11" y="2" width="7" height="4" rx="1" />
            <rect x="11" y="8" width="7" height="10" rx="1" />
            <rect x="2" y="11" width="7" height="7" rx="1" />
          </svg>
          {t('settings.dashboard')}
        </button>

        <button className={menuBtn} onClick={toggleTheme}>
          {isDark ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          {isDark ? t('settings.lightMode') : t('settings.darkMode')}
        </button>

        {/* 언어 설정 */}
        {settings && (
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-sm text-text-muted mr-auto">{t('settings.uiLanguage')}</span>
            {(['ko', 'en', 'ja', 'zh'] as const).map((lang) => (
              <button
                key={lang}
                className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors ${
                  (settings.language ?? 'ko') === lang
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white/5 text-text-muted border-white/10 hover:bg-white/10'
                }`}
                onClick={() => updateSettings({ language: lang })}
              >
                {lang === 'ko' ? '한' : lang === 'en' ? 'EN' : lang === 'ja' ? '日' : '中'}
              </button>
            ))}
          </div>
        )}

        {/* 기본 CLI 프로바이더 */}
        {settings && (
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-sm text-text-muted mr-auto">
              {t('settings.defaultCliProvider')}
            </span>
            <select
              value={settings.defaultCliProvider ?? 'claude'}
              onChange={(e) =>
                updateSettings({ defaultCliProvider: e.target.value as CliProvider })
              }
              className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-text outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {CLI_PROVIDER_OPTIONS.map((p) => (
                <option key={p.value} value={p.value} className="bg-surface">
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 독 크기 S/M/L */}
        <div className="px-4 py-3 flex items-center gap-2">
          <span className="text-sm text-text-muted mr-auto">{t('settings.dockSize')}</span>
          {(['small', 'medium', 'large'] as DockSize[]).map((size) => (
            <button
              key={size}
              className={`px-3 py-1 text-xs rounded border cursor-pointer transition-colors ${
                dockSize === size
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white/5 text-text-muted border-white/10 hover:bg-white/10'
              }`}
              onClick={() => {
                setDockSize(size)
                window.api.app.setDockSize(size)
              }}
            >
              {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
            </button>
          ))}
        </div>

        {/* 작업 디렉토리 설정 */}
        <div className="px-4 py-3 space-y-2">
          <span className="text-sm text-text-muted">{t('settings.defaultWorkingDir')}</span>
          <div
            className="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 cursor-pointer hover:border-accent/50 transition-colors"
            onClick={async () => {
              const dir = await window.api.window.selectDirectory()
              if (dir) {
                await updateSettings({ defaultWorkingDirectory: dir })
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted shrink-0"
            >
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <span className="text-xs text-text font-mono truncate flex-1">
              {settings?.defaultWorkingDirectory || '-'}
            </span>
            <span className="text-xs text-accent shrink-0">{t('settings.browse')}</span>
          </div>
        </div>

        {/* 로컬 LLM 섹션 */}
        <button
          className={menuBtn}
          onClick={() => setLlmScanOpen((v) => !v)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="12" y2="17" />
          </svg>
          <span className="flex-1">{t('settings.localLlm')}</span>
          {localModels.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
              {localModels.length}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform duration-200 ${llmScanOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </svg>
        </button>
        {llmScanOpen && (
          <div className="px-4 pb-2 space-y-2">
            {/* 소스 상태 */}
            <div className="flex items-center gap-3 text-[10px]">
              {llmSources.map((s) => (
                <span
                  key={s.source}
                  className={`flex items-center gap-1 ${s.available ? 'text-green-400' : 'text-text-muted'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.available ? 'bg-green-400' : 'bg-white/20'}`} />
                  {s.source === 'ollama' ? 'Ollama' : s.source === 'lmstudio' ? 'LM Studio' : 'OpenAI'}
                  {s.version && ` v${s.version}`}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">
                {t('settings.llmScan')}
              </span>
              <button
                className="px-2 py-0.5 text-[10px] rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                disabled={llmScanning}
                onClick={async () => {
                  setLlmScanning(true)
                  try {
                    const result = await window.api.llm.discoverAll()
                    setLocalModels(result.models)
                    setLlmSources(result.sources)
                  } catch { /* ignore */ }
                  setLlmScanning(false)
                }}
              >
                {llmScanning ? '...' : t('settings.llmRescan')}
              </button>
            </div>
            {localModels.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-2">
                {t('settings.noLocalLlm')}
              </div>
            ) : (
              localModels.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-text font-medium truncate">{m.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                        {m.source === 'ollama' ? 'Ollama' : m.source === 'lmstudio' ? 'LM Studio' : 'OpenAI'}
                      </span>
                      {m.size && (
                        <span className="text-[9px] text-text-muted shrink-0">{m.size}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted truncate font-mono">{m.id}</div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.isRunning ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-text-muted'}`}>
                    {m.isRunning ? t('settings.llmInstalled') : t('settings.llmNotInstalled')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* CLI 프로필 (다중 계정) 섹션 */}
        <button
          className={menuBtn}
          onClick={() => setProfilesOpen((v) => !v)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="flex-1">{t('settings.cliProfiles')}</span>
          {profiles.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-text-muted">
              {profiles.length}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform duration-200 ${profilesOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </svg>
        </button>
        {profilesOpen && (
          <div className="px-4 pb-2 space-y-2">
            {profiles.length === 0 && !showProfileForm && (
              <div className="text-[11px] text-text-muted text-center py-2">
                {t('settings.noProfiles')}
              </div>
            )}
            {/* 프로필 목록 */}
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text font-medium truncate">{p.name}</span>
                    {p.isDefault && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                        {t('settings.defaultProfile')}
                      </span>
                    )}
                    <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-text-muted shrink-0">
                      {CLI_PROVIDER_OPTIONS.find((o) => o.value === p.provider)?.label ?? p.provider}
                    </span>
                  </div>
                  {p.configDir && (
                    <div className="text-[10px] text-text-muted truncate font-mono">{p.configDir}</div>
                  )}
                  {profileUsage[p.id] !== undefined && (
                    <div className="text-[10px] text-text-muted">
                      {t('settings.profileUsage', { count: String(profileUsage[p.id]) })}
                    </div>
                  )}
                </div>
                <button
                  className="shrink-0 px-2 py-1 text-[10px] rounded bg-red-500/20 text-red-400 border-none cursor-pointer hover:bg-red-500/30"
                  onClick={async () => {
                    await window.api.profile.delete(p.id)
                    const updated = await window.api.profile.list()
                    setProfiles(updated)
                  }}
                >
                  {t('settings.deleteProfile')}
                </button>
              </div>
            ))}
            {/* 프로필 추가 폼 */}
            {showProfileForm ? (
              <div className="space-y-1.5 p-2 rounded-lg bg-white/5 border border-white/10">
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder={t('settings.profileName')}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
                  autoFocus
                />
                <select
                  value={newProfileProvider}
                  onChange={(e) => setNewProfileProvider(e.target.value as CliProvider)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  {CLI_PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value} className="bg-surface">
                      {p.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newProfileConfigDir}
                    onChange={(e) => setNewProfileConfigDir(e.target.value)}
                    placeholder={t('settings.profileConfigDir')}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                  />
                  <button
                    className="shrink-0 px-2 py-1.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                    onClick={async () => {
                      const dir = await window.api.window.selectDirectory()
                      if (dir) setNewProfileConfigDir(dir)
                    }}
                  >
                    {t('settings.browse')}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-accent text-white border-none cursor-pointer hover:opacity-80"
                    onClick={async () => {
                      if (!newProfileName.trim()) return
                      await window.api.profile.create({
                        name: newProfileName.trim(),
                        provider: newProfileProvider,
                        configDir: newProfileConfigDir || undefined,
                        isDefault: profiles.filter((p) => p.provider === newProfileProvider).length === 0
                      })
                      setNewProfileName('')
                      setNewProfileConfigDir('')
                      setShowProfileForm(false)
                      const updated = await window.api.profile.list()
                      setProfiles(updated)
                    }}
                  >
                    {t('agentEditor.save')}
                  </button>
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                    onClick={() => {
                      setShowProfileForm(false)
                      setNewProfileName('')
                      setNewProfileConfigDir('')
                    }}
                  >
                    {t('agentEditor.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                           border border-dashed border-white/20 hover:border-accent/50 hover:bg-accent/10
                           cursor-pointer transition-colors bg-transparent"
                onClick={() => setShowProfileForm(true)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="text-accent"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="text-xs text-accent">{t('settings.addProfile')}</span>
              </button>
            )}
          </div>
        )}

        {/* 발견된 MCP 서버 */}
        <button
          className={menuBtn}
          onClick={() => setMcpScanOpen((v) => !v)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          <span className="flex-1">{t('settings.discoveredMcp')}</span>
          {discoveredMcp.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
              {discoveredMcp.length}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform duration-200 ${mcpScanOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </svg>
        </button>
        {mcpScanOpen && (
          <div className="px-4 pb-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">
                {t('settings.discoveredMcp')}
              </span>
              <button
                className="px-2 py-0.5 text-[10px] rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                disabled={mcpScanning}
                onClick={async () => {
                  setMcpScanning(true)
                  try {
                    const result = await window.api.mcp.discoverAll()
                    setDiscoveredMcp(result.servers)
                  } catch { /* ignore */ }
                  setMcpScanning(false)
                }}
              >
                {mcpScanning ? '...' : t('settings.rescanMcp')}
              </button>
            </div>
            {discoveredMcp.length === 0 ? (
              <div className="text-[11px] text-text-muted text-center py-2">
                {t('settings.noDiscoveredMcp')}
              </div>
            ) : (
              discoveredMcp.map((server) => (
                <div
                  key={`${server.name}-${server.sourcePath}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-green-500/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-text font-medium truncate">{server.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">
                        {server.source === 'discovered-project' ? t('settings.mcpSourceProject') : t('settings.mcpSourceHome')}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted truncate">
                      {server.command} {(server.args || []).join(' ')}
                    </div>
                  </div>
                  <button
                    className="shrink-0 px-2 py-1 text-[10px] rounded bg-accent/20 text-accent border-none cursor-pointer hover:bg-accent/30"
                    onClick={async () => {
                      await window.api.mcp.importDiscovered(server.name, 'global')
                      // 새로고침
                      const updated = await window.api.mcp.getDiscovered()
                      setDiscoveredMcp(updated)
                    }}
                  >
                    {t('settings.enableMcp')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="h-px bg-white/10 mx-4" />

        {/* CLI 업데이트 */}
        {cliUpdate && (
          <>
            <button
              className={`${menuBtn} !text-orange-400`}
              onClick={async () => {
                await window.api.cli.install()
                setCliUpdate(null)
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t('settings.cliUpdate', { version: cliUpdate.latestVersion })}
            </button>
            <div className="h-px bg-white/10 mx-4" />
          </>
        )}

        {/* 하단 고정 영역 */}
        <div className="flex-1" />

        {/* 버전 정보 */}
        <div className="px-4 py-2 text-center">
          <span className="text-[10px] text-text-muted">
            Virtual Company v{__APP_VERSION__}
          </span>
        </div>

        <div className="h-px bg-white/10 mx-4" />

        {/* 종료 */}
        <button className={`${menuBtn} !text-red-400`} onClick={() => window.api.app.quit()}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
          {t('settings.quit')}
        </button>
      </div>
    </div>
  )
}
