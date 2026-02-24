import { useState, useEffect } from 'react'
import { McpServerConfig } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'

export function McpServerEditor() {
  const { t } = useI18n()
  const [globalServers, setGlobalServers] = useState<McpServerConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.mcp.getGlobal().then((servers) => {
      setGlobalServers(servers)
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    await window.api.mcp.setGlobal(globalServers)
  }

  const addServer = () => {
    setGlobalServers([
      ...globalServers,
      { name: '', command: '', args: [], env: {}, enabled: true }
    ])
  }

  const removeServer = (idx: number) => {
    setGlobalServers(globalServers.filter((_, i) => i !== idx))
  }

  const updateServer = (idx: number, updates: Partial<McpServerConfig>) => {
    setGlobalServers(globalServers.map((s, i) => (i === idx ? { ...s, ...updates } : s)))
  }

  if (loading) {
    return <div className="text-sm text-[var(--color-text-muted)]">{t('mcp.loading')}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">{t('mcp.title')}</h2>
        <div className="flex gap-2">
          <button
            onClick={addServer}
            className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs hover:bg-accent/30 cursor-pointer border-none transition-colors"
          >{t('mcp.addServer')}</button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs hover:bg-accent-hover cursor-pointer border-none transition-colors"
          >{t('mcp.save')}</button>
        </div>
      </div>

      {globalServers.length === 0 ? (
        <div className="text-sm text-[var(--color-text-muted)] text-center py-8">
          {t('mcp.noServers')}
        </div>
      ) : (
        <div className="space-y-3">
          {globalServers.map((server, idx) => (
            <ServerEntry
              key={idx}
              server={server}
              onChange={(updates) => updateServer(idx, updates)}
              onRemove={() => removeServer(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ServerEntry({
  server,
  onChange,
  onRemove
}: {
  server: McpServerConfig
  onChange: (updates: Partial<McpServerConfig>) => void
  onRemove: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* 활성/비활성 토글 */}
          <button
            onClick={() => onChange({ enabled: !server.enabled })}
            className={`w-8 h-4 rounded-full transition-colors cursor-pointer border-none ${
              server.enabled ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
              server.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">{server.name || t('mcp.newServer')}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
        >{t('mcp.remove')}</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] text-[var(--color-text-muted)] mb-0.5 block">{t('mcp.name')}</span>
          <input
            type="text"
            value={server.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="server-name"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[var(--color-text)] text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-[var(--color-text-muted)] mb-0.5 block">{t('mcp.command')}</span>
          <input
            type="text"
            value={server.command}
            onChange={(e) => onChange({ command: e.target.value })}
            placeholder="npx"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[var(--color-text)] text-xs outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] text-[var(--color-text-muted)] mb-0.5 block">{t('mcp.args')}</span>
        <input
          type="text"
          value={(server.args ?? []).join(', ')}
          onChange={(e) => onChange({ args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder="-y, @modelcontextprotocol/server-filesystem, /path/to/dir"
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[var(--color-text)] text-xs outline-none focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="text-[10px] text-[var(--color-text-muted)] mb-0.5 block">{t('mcp.workingDir')}</span>
        <input
          type="text"
          value={server.cwd ?? ''}
          onChange={(e) => onChange({ cwd: e.target.value || undefined })}
          placeholder={t('mcp.optional')}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[var(--color-text)] text-xs outline-none focus:border-accent"
        />
      </label>
    </div>
  )
}
