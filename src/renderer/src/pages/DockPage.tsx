import { Dock } from '../components/dock/Dock'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'

export function DockPage() {
  useKeyboardShortcuts()

  return (
    <div className="dock-area" style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'transparent', paddingBottom: 4, overflow: 'visible' }}>
      <Dock />
    </div>
  )
}
