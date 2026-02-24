/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { ThemeMode, ThemeSettings } from '../../../shared/types'

interface ThemeContextValue {
  theme: ThemeMode
  settings: ThemeSettings
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

function getEffectiveTheme(mode: ThemeMode, systemPreference: 'light' | 'dark'): 'light' | 'dark' {
  if (mode === 'system') {
    return systemPreference
  }
  return mode
}

function loadThemeSettings(): ThemeSettings {
  try {
    const stored = localStorage.getItem('theme-settings')
    if (stored) {
      const settings = JSON.parse(stored)
      return {
        mode: settings.mode || 'system',
        systemPreference: getSystemTheme()
      }
    }
  } catch (error) {
    console.error('테마 설정 로드 실패:', error)
  }

  return {
    mode: 'system',
    systemPreference: getSystemTheme()
  }
}

function saveThemeSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem('theme-settings', JSON.stringify(settings))
  } catch (error) {
    console.error('테마 설정 저장 실패:', error)
  }
}

function updateBodyClass(isDark: boolean): void {
  const body = document.body
  if (isDark) {
    body.classList.add('dark')
    body.classList.remove('light')
  } else {
    body.classList.add('light')
    body.classList.remove('dark')
  }
}

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [settings, setSettings] = useState<ThemeSettings>(loadThemeSettings)
  const isFromIpc = useRef(false)

  const isDark = getEffectiveTheme(settings.mode, settings.systemPreference || 'light') === 'dark'

  // 시스템 테마 변경 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      const newSystemPreference = e.matches ? 'dark' : 'light'
      setSettings((prev) => ({
        ...prev,
        systemPreference: newSystemPreference
      }))
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // 다른 창에서 테마 변경 수신 (멀티 윈도우 동기화)
  useEffect(() => {
    if (!window.api?.on) return
    const unsub = window.api.on('settings:changed', (newSettings: unknown) => {
      const s = newSettings as { theme?: ThemeSettings }
      if (s?.theme?.mode) {
        isFromIpc.current = true
        setSettings((prev) => ({
          ...prev,
          mode: s.theme!.mode
        }))
      }
    })
    return unsub
  }, [])

  // 테마 변경시 body 클래스 업데이트
  useEffect(() => {
    updateBodyClass(isDark)
  }, [isDark])

  // 설정 변경시 localStorage 저장 + 백엔드 동기화
  useEffect(() => {
    saveThemeSettings(settings)
    // IPC에서 받은 변경은 다시 백엔드에 보내지 않음 (무한 루프 방지)
    if (isFromIpc.current) {
      isFromIpc.current = false
      return
    }
    // 백엔드에 테마 설정 저장 → 모든 창에 브로드캐스트
    window.api?.settings?.update?.({ theme: settings })?.catch(() => {})
  }, [settings])

  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings((prev) => ({
      ...prev,
      mode: theme
    }))
  }, [])

  const toggleTheme = useCallback(() => {
    setSettings((prev) => {
      const currentEffective = getEffectiveTheme(prev.mode, prev.systemPreference || 'light')
      const newMode: ThemeMode = currentEffective === 'dark' ? 'light' : 'dark'
      return {
        ...prev,
        mode: newMode
      }
    })
  }, [])

  const value: ThemeContextValue = {
    theme: settings.mode,
    settings,
    setTheme,
    toggleTheme,
    isDark
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme은 ThemeProvider 내부에서만 사용할 수 있습니다')
  }
  return context
}
