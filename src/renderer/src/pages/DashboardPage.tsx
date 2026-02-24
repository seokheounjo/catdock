import { useState, useEffect, useCallback } from 'react'
import { ActivityEvent, TaskDelegation } from '../../../shared/types'
import { useAgentStore } from '../stores/agent-store'
import { useActivityStore } from '../stores/activity-store'
import { useTaskStore } from '../stores/task-store'
import { useSettingsStore } from '../stores/settings-store'
import { useI18n } from '../hooks/useI18n'
import { AgentCard } from '../components/dashboard/AgentCard'
import { OrgChart } from '../components/dashboard/OrgChart'
import { ActivityFeed } from '../components/dashboard/ActivityFeed'
import { TaskBoard } from '../components/dashboard/TaskBoard'
import { GlobalSettingsPanel } from '../components/dashboard/GlobalSettingsPanel'
import { McpServerEditor } from '../components/dashboard/McpServerEditor'
import { NotificationCenter } from '../components/dashboard/NotificationCenter'
import { ThemeToggle } from '../components/theme/ThemeToggle'

type DashboardTab = 'team' | 'activity' | 'tasks' | 'settings' | 'mcp'

export function DashboardPage() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<DashboardTab>('team')

  const TABS: { key: DashboardTab; label: string }[] = [
    { key: 'team', label: t('dashboard.teamOverview') },
    { key: 'activity', label: t('dashboard.activityFeed') },
    { key: 'tasks', label: t('dashboard.taskBoard') },
    { key: 'settings', label: t('dashboard.settings') },
    { key: 'mcp', label: t('dashboard.mcpServers') }
  ]
  const [cliStatus, setCliStatus] = useState<{ installed: boolean; version: string | null; error: string | null } | null>(null)
  const { agents, states, fetchAgents, fetchStates } = useAgentStore()
  const { fetchActivities } = useActivityStore()
  const { fetchTasks } = useTaskStore()
  const { fetchSettings } = useSettingsStore()

  const checkCli = useCallback(async () => {
    const result = await window.api.cli.check()
    setCliStatus(result)
  }, [])

  useEffect(() => {
    fetchAgents()
    fetchStates()
    fetchActivities()
    fetchTasks()
    fetchSettings()
    checkCli()

    const unsubs = [
      window.api.on('agent:created', () => fetchAgents()),
      window.api.on('agent:updated', () => fetchAgents()),
      window.api.on('agent:deleted', () => fetchAgents()),
      window.api.on('agent:status-changed', () => fetchStates()),
      window.api.on('activity:new', (event: unknown) => {
        useActivityStore.getState().addActivity(event as ActivityEvent)
      }),
      window.api.on('task:created', (task: unknown) => {
        useTaskStore.getState().addTask(task as TaskDelegation)
      }),
      window.api.on('task:updated', (task: unknown) => {
        useTaskStore.getState().updateTask(task as TaskDelegation)
      }),
      window.api.on('task:deleted', (id: unknown) => {
        useTaskStore.getState().removeTask(id as string)
      }),
      window.api.on('settings:changed', () => fetchSettings())
    ]

    const stateInterval = setInterval(fetchStates, 5000)
    return () => {
      clearInterval(stateInterval)
      unsubs.forEach((fn) => fn())
    }
  }, [])

  return (
    <div className="flex h-screen bg-chat-bg">
      {/* 타이틀 바 (드래그 영역) */}
      <div
        className="fixed top-0 left-0 right-0 h-8 z-50 flex items-center px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs text-text-muted font-medium">{t('dashboard.title')}</span>
        <div className="ml-auto flex gap-2 items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ThemeToggle className="scale-75" />
          <button
            onClick={() => window.api.window.minimize()}
            className="w-6 h-6 rounded hover:bg-white/10 text-text-muted hover:text-text-secondary flex items-center justify-center cursor-pointer bg-transparent border-none text-xs"
          >─</button>
          <button
            onClick={() => window.api.window.close()}
            className="w-6 h-6 rounded hover:bg-red-500/50 text-text-muted hover:text-white flex items-center justify-center cursor-pointer bg-transparent border-none text-xs"
          >✕</button>
        </div>
      </div>

      {/* 사이드바 */}
      <nav className="w-48 bg-chat-sidebar border-r border-white/10 pt-10 flex flex-col shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-left text-sm border-none cursor-pointer transition-colors ${
              activeTab === tab.key
                ? 'bg-accent/20 text-accent border-r-2 border-r-accent'
                : 'bg-transparent text-text-muted hover:bg-white/5 hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 pt-10 overflow-auto">
        <div className="p-6">
          {activeTab === 'team' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-text">{t('dashboard.teamOverview')}</h2>
                {cliStatus && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    cliStatus.installed
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {cliStatus.installed
                      ? t('dashboard.cliInstalled', { version: cliStatus.version ?? '' })
                      : t('dashboard.cliNotInstalled')}
                  </span>
                )}
              </div>
              {cliStatus && !cliStatus.installed && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm text-red-300 font-medium">{t('dashboard.cliNotInstalled')}</p>
                  <p className="text-xs text-red-300/70 mt-1">
                    {t('dashboard.cliNotInstalledDesc')}{' '}
                    {t('dashboard.cliInstallHint')}
                  </p>
                </div>
              )}
              <OrgChart agents={agents} states={states} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    state={states.get(agent.id) ?? null}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'activity' && <ActivityFeed />}
          {activeTab === 'tasks' && <TaskBoard />}
          {activeTab === 'settings' && <GlobalSettingsPanel />}
          {activeTab === 'mcp' && <McpServerEditor />}
        </div>
      </main>

      {/* 알림 토스트 */}
      <NotificationCenter />
    </div>
  )
}
