import { useEffect } from 'react'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd 수정자
      const isCtrl = e.ctrlKey || e.metaKey

      if (!isCtrl) return

      switch (e.key) {
        case 'n':
          e.preventDefault()
          window.api.window.openEditor()
          break
        case 'g':
          e.preventDefault()
          window.api.window.openNewConversation()
          break
        case 'd':
          e.preventDefault()
          window.api.window.openDashboard()
          break
        case ',':
          e.preventDefault()
          window.api.window.openDashboard()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}
