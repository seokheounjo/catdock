import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../hooks/useI18n'

interface SunIconProps {
  className?: string
}

function SunIcon({ className }: SunIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
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
  )
}

interface MoonIconProps {
  className?: string
}

function MoonIcon({ className }: MoonIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

interface ComputerIconProps {
  className?: string
}

function ComputerIcon({ className }: ComputerIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

interface ThemeToggleProps {
  variant?: 'simple' | 'with-dropdown'
  className?: string
}

export function ThemeToggle({ variant = 'simple', className = '' }: ThemeToggleProps) {
  const { t } = useI18n()
  const { theme, setTheme, toggleTheme, isDark } = useTheme()

  if (variant === 'with-dropdown') {
    return (
      <div className={`relative ${className}`}>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-8 py-2 pr-8 text-text hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
        >
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
        <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
          {theme === 'light' && <SunIcon className="w-4 h-4 text-yellow-500" />}
          {theme === 'dark' && <MoonIcon className="w-4 h-4 text-blue-400" />}
          {theme === 'system' && <ComputerIcon className="w-4 h-4 text-gray-500" />}
        </div>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative inline-flex items-center justify-center
        w-10 h-10 rounded-lg
        bg-white dark:bg-gray-800
        border border-gray-200 dark:border-gray-700
        hover:border-gray-300 dark:hover:border-gray-600
        hover:bg-gray-50 dark:hover:bg-gray-700
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        transition-all duration-200 ease-in-out
        group
        ${className}
      `}
      title={t('theme.currentTheme', { theme: theme === 'light' ? t('theme.light') : theme === 'dark' ? t('theme.dark') : t('theme.system') })}
    >
      <div className="relative w-5 h-5">
        <SunIcon
          className={`
            absolute inset-0 w-5 h-5 text-yellow-500
            transition-all duration-300 ease-in-out
            ${isDark ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'}
          `}
        />
        <MoonIcon
          className={`
            absolute inset-0 w-5 h-5 text-blue-400
            transition-all duration-300 ease-in-out
            ${isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'}
          `}
        />
      </div>

      {/* 호버 시 툴팁 효과 */}
      <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="bg-gray-800 dark:bg-gray-600 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
          {isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
        </div>
      </div>
    </button>
  )
}