import ko, { type LocaleMessages } from './locales/ko'
import en from './locales/en'
import ja from './locales/ja'
import zh from './locales/zh'

export type Locale = 'ko' | 'en' | 'ja' | 'zh'

const localeMap: Record<Locale, LocaleMessages> = { ko, en, ja, zh }

let currentLocale: Locale = 'ko'

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

// dot-notation 키로 번역 문자열 반환
// 예: t('dashboard.title') → '대시보드'
// 치환: t('settings.cliUpdate', { version: '1.0' }) → 'CLI 업데이트 (v1.0)'
export function t(key: string, params?: Record<string, string | number>): string {
  const messages = localeMap[currentLocale] || localeMap.ko
  const parts = key.split('.')
  let result: unknown = messages

  for (const part of parts) {
    if (result && typeof result === 'object' && part in (result as Record<string, unknown>)) {
      result = (result as Record<string, unknown>)[part]
    } else {
      return key // 키를 찾지 못하면 키 자체 반환
    }
  }

  if (typeof result !== 'string') return key

  if (params) {
    return result.replace(/\{(\w+)\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{${k}}`
    )
  }
  return result
}
