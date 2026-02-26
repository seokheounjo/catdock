import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { CliProvider, DockSize, ConversationConfig } from '../../../shared/types'
import { CLI_PROVIDER_OPTIONS } from '../../../shared/constants'
import { useI18n } from '../hooks/useI18n'
import { useSettingsStore } from '../stores/settings-store'

export function SettingsPage() {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useTheme()
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const [dockSize, setDockSize] = useState<DockSize>('medium')
  const [cliUpdate, setCliUpdate] = useState<{ latestVersion: string } | null>(null)
  const [appUpdate, setAppUpdate] = useState<{
    state: string
    version?: string
    percent?: number
    message?: string
  } | null>(null)
  const [appUpdateChecked, setAppUpdateChecked] = useState(false)
  const [groupChatOpen, setGroupChatOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationConfig[]>([])
  const [ghTokenInfo, setGhTokenInfo] = useState<{ hasToken: boolean; token: string } | null>(null)
  const [ghTokenInput, setGhTokenInput] = useState('')
  const [ghTokenEditing, setGhTokenEditing] = useState(false)
  const [ghTokenMsg, setGhTokenMsg] = useState('')

  useEffect(() => {
    fetchSettings()
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
    // 앱 업데이트 자동 확인
    window.api.app.checkAppUpdate().catch(() => {})
    window.api.conversation.list().then(setConversations).catch(() => {})
    window.api.app.getGhToken().then(setGhTokenInfo).catch(() => {})

    const unsubs = [
      window.api.on('dock:size-changed', (size: unknown) => setDockSize(size as DockSize)),
      window.api.on('cli:update-available', (data: unknown) => {
        setCliUpdate(data as { latestVersion: string })
      }),
      window.api.on('app-update:status', (data: unknown) => {
        const status = data as { state: string; version?: string; percent?: number; message?: string }
        setAppUpdate(status)
        if (status.state === 'not-available') {
          setAppUpdateChecked(true)
          setTimeout(() => setAppUpdateChecked(false), 3000)
        } else {
          setAppUpdateChecked(false)
        }
      }),
      window.api.on('conversation:created', () => {
        window.api.conversation.list().then(setConversations).catch(() => {})
      }),
      window.api.on('conversation:deleted', () => {
        window.api.conversation.list().then(setConversations).catch(() => {})
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

        {/* 앱 업데이트 */}
        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-muted shrink-0"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {appUpdate?.state === 'checking' && (
              <span className="text-xs text-text-muted">{t('settings.appUpdateChecking')}</span>
            )}
            {appUpdate?.state === 'available' && (
              <>
                <span className="text-xs text-orange-400">
                  {t('settings.appUpdateAvailable', { version: appUpdate.version ?? '' })}
                </span>
                <button
                  className="ml-auto px-2 py-0.5 text-xs rounded bg-accent text-white border-none cursor-pointer hover:opacity-80"
                  onClick={() => window.api.app.downloadAppUpdate()}
                >
                  {t('settings.appUpdateDownload')}
                </button>
              </>
            )}
            {appUpdate?.state === 'downloading' && (
              <span className="text-xs text-blue-400">
                {t('settings.appUpdateDownloading', {
                  percent: String(Math.round(appUpdate.percent ?? 0))
                })}
              </span>
            )}
            {appUpdate?.state === 'downloaded' && (
              <>
                <span className="text-xs text-green-400">
                  {t('settings.appUpdateReady', { version: appUpdate.version ?? '' })}
                </span>
                <button
                  className="ml-auto px-2 py-0.5 text-xs rounded bg-green-600 text-white border-none cursor-pointer hover:opacity-80"
                  onClick={() => window.api.app.installAppUpdate()}
                >
                  {t('settings.appUpdateInstall')}
                </button>
              </>
            )}
            {appUpdate?.state === 'error' && (
              <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">{t('settings.appUpdateError')}</span>
                  <button
                    className="ml-auto px-2 py-0.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                    onClick={() => window.api.app.checkAppUpdate()}
                  >
                    {t('settings.appUpdateCheck')}
                  </button>
                </div>
                {appUpdate.message && (
                  <div className="flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20">
                    <span className="text-[10px] text-red-300 break-all flex-1 font-mono leading-relaxed select-text">
                      {appUpdate.message}
                    </span>
                    <button
                      className="shrink-0 px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20 hover:text-text"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(appUpdate.message || '')
                        } catch {
                          const ta = document.createElement('textarea')
                          ta.value = appUpdate.message || ''
                          ta.style.position = 'fixed'
                          ta.style.opacity = '0'
                          document.body.appendChild(ta)
                          ta.select()
                          document.execCommand('copy')
                          document.body.removeChild(ta)
                        }
                      }}
                      title="Copy error"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}
            {(!appUpdate || appUpdate.state === 'not-available') && (
              <>
                {appUpdateChecked ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-400 animate-fade-in">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('settings.appUpdateLatest')}
                  </span>
                ) : (
                  <span className="text-xs text-text-muted">{t('settings.appUpdateLatest')}</span>
                )}
                <button
                  className="ml-auto px-2 py-0.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                  onClick={() => window.api.app.checkAppUpdate()}
                >
                  {t('settings.appUpdateCheck')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* GitHub Token 설정 */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
            </svg>
            <span className="text-xs text-text-muted flex-1">{t('settings.ghToken')}</span>
            {ghTokenInfo?.hasToken && !ghTokenEditing && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                {t('settings.ghTokenSet')}
              </span>
            )}
            {!ghTokenInfo?.hasToken && !ghTokenEditing && (
              <span className="text-[10px] text-orange-400">
                {t('settings.ghTokenNotSet')}
              </span>
            )}
          </div>
          {ghTokenEditing ? (
            <div className="space-y-1.5">
              <input
                type="password"
                value={ghTokenInput}
                onChange={(e) => setGhTokenInput(e.target.value)}
                placeholder={t('settings.ghTokenPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <button
                  className="px-2 py-0.5 text-xs rounded bg-accent text-white border-none cursor-pointer hover:opacity-80"
                  onClick={async () => {
                    const result = await window.api.app.saveGhToken(ghTokenInput)
                    if (result.success) {
                      setGhTokenMsg(t('settings.ghTokenSaved'))
                      setGhTokenEditing(false)
                      setGhTokenInput('')
                      window.api.app.getGhToken().then(setGhTokenInfo).catch(() => {})
                    }
                    setTimeout(() => setGhTokenMsg(''), 3000)
                  }}
                >
                  {t('settings.ghTokenSave')}
                </button>
                {ghTokenInfo?.hasToken && (
                  <button
                    className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-400 border-none cursor-pointer hover:bg-red-500/30"
                    onClick={async () => {
                      await window.api.app.saveGhToken('')
                      setGhTokenMsg(t('settings.ghTokenCleared'))
                      setGhTokenEditing(false)
                      setGhTokenInput('')
                      window.api.app.getGhToken().then(setGhTokenInfo).catch(() => {})
                      setTimeout(() => setGhTokenMsg(''), 3000)
                    }}
                  >
                    {t('settings.ghTokenClear')}
                  </button>
                )}
                <button
                  className="px-2 py-0.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                  onClick={() => { setGhTokenEditing(false); setGhTokenInput('') }}
                >
                  Cancel
                </button>
              </div>
              <div className="text-[10px] text-text-muted">{t('settings.ghTokenHint')}</div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {ghTokenInfo?.hasToken && (
                <span className="text-[10px] text-text-muted font-mono">{ghTokenInfo.token}</span>
              )}
              <button
                className="ml-auto px-2 py-0.5 text-xs rounded bg-white/10 text-text-muted border-none cursor-pointer hover:bg-white/20"
                onClick={() => setGhTokenEditing(true)}
              >
                {ghTokenInfo?.hasToken ? t('settings.editTemplate') : t('settings.ghTokenSave')}
              </button>
            </div>
          )}
          {ghTokenMsg && (
            <div className="text-[10px] text-green-400 animate-fade-in">{ghTokenMsg}</div>
          )}
        </div>

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
