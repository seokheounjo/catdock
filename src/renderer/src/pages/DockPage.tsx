import { Dock } from '../components/dock/Dock'

export function DockPage() {
  return (
    <div className="dock-area" style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'transparent', paddingBottom: 4 }}>
      <Dock />
    </div>
  )
}
