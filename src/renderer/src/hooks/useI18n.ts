import { useEffect, useCallback } from 'react'
import { useSettingsStore } from '../stores/settings-store'
import { t, setLocale, getLocale, type Locale } from '../utils/i18n'

// useSettingsStore의 language 설정과 i18n을 동기화
export function useI18n() {
  const { settings } = useSettingsStore()

  useEffect(() => {
    const lang = settings?.language
    if (lang && lang !== getLocale()) {
      setLocale(lang)
    }
  }, [settings?.language])

  // forceUpdate를 위한 트릭 — locale 변경 시 리렌더링 유도
  const translate = useCallback(
    (key: string, params?: Record<string, string | number>) => t(key, params),
    // settings.language가 바뀌면 translate 함수도 새로 만들어져서 컴포넌트 리렌더링
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings?.language]
  )

  return { t: translate, locale: (settings?.language ?? 'ko') as Locale }
}
