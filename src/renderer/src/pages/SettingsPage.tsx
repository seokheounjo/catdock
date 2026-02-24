import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { DockSize } from '../../../shared/types'
import { useI18n } from '../hooks/useI18n'
import { useSettingsStore } from '../stores/settings-store'

export function SettingsPage() {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useTheme()
  const { settings, fetchSettings, updateSettings } = useSettingsStore()
  const [dockSize, setDockSize] = useState<DockSize>('medium')
  const [cliUpdate, setCliUpdate] = useState<{ latestVersion: string } | null>(null)

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

    const unsubs = [
      window.api.on('dock:size-changed', (size: unknown) => setDockSize(size as DockSize)),
      window.api.on('cli:update-available', (data: unknown) => {
        setCliUpdate(data as { latestVersion: string })
      })
    ]
    return () => {
      unsubs.forEach((fn) => fn())
    }
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
      <div className="flex-1 flex flex-col py-1">
        <button
          className={menuBtn}
          onClick={() => {
            window.api.window.openNewConversation()
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
            <path d="M4 14v1a2 2 0 002 2h8l4 3v-3a2 2 0 002-2V7a2 2 0 00-2-2h-3" />
            <rect x="1" y="1" width="12" height="10" rx="2" />
          </svg>
          {t('settings.groupChat')}
        </button>

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

        {/* 종료 — 하단 고정 */}
        <div className="flex-1" />
        <div className="h-px bg-white/10 mx-4" />
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
