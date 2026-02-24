import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useI18n } from '../../hooks/useI18n'

type SetupStep = 'welcome' | 'cli-check' | 'working-dir' | 'complete'

interface CliStatus {
  installed: boolean
  version: string | null
  path: string | null
  error: string | null
}

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { t } = useI18n()
  const [step, setStep] = useState<SetupStep>('welcome')
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null)
  const [nodeStatus, setNodeStatus] = useState<{
    installed: boolean
    version: string | null
  } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installMessage, setInstallMessage] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const { updateSettings } = useSettingsStore()

  const checkCli = useCallback(async () => {
    const result = await window.api.cli.check()
    setCliStatus(result)
  }, [])

  useEffect(() => {
    // CLI 설치 진행 이벤트 수신
    const unsub = window.api.on('cli:install-progress', (data: unknown) => {
      const d = data as { status: string; message: string }
      setInstallMessage(d.message)
      if (d.status === 'success' || d.status === 'error') {
        setInstalling(false)
        if (d.status === 'success') {
          checkCli()
        }
      }
    })
    return () => unsub()
  }, [checkCli])

  const checkNode = async () => {
    const result = await window.api.cli.checkNode()
    setNodeStatus(result)
  }

  const handleInstallCli = async () => {
    setInstalling(true)
    setInstallMessage(t('setup.cliInstallingMsg'))
    const result = await window.api.cli.install()
    setInstallMessage(result.message)
    setInstalling(false)
    if (result.success) {
      await checkCli()
    }
  }

  const handleSelectDir = async () => {
    const dir = await window.api.window.selectDirectory()
    if (dir) setWorkingDir(dir)
  }

  const handleFinish = async () => {
    if (workingDir) {
      await updateSettings({ defaultWorkingDirectory: workingDir })
    }
    // 셋업 완료 플래그 저장
    await updateSettings({ setupCompleted: true } as never)
    onComplete()
  }

  return (
    <div className="flex items-center justify-center h-screen bg-chat-bg">
      <div className="w-[560px] bg-chat-sidebar rounded-xl border border-white/10 shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-accent/20 to-purple-500/20 p-8 text-center">
          <h1 className="text-2xl font-bold text-text mb-2">{t('setup.appTitle')}</h1>
          <p className="text-text-muted text-sm">{t('setup.appDesc')}</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex items-center justify-center gap-2 py-4 border-b border-white/10">
          {(['welcome', 'cli-check', 'working-dir', 'complete'] as SetupStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s === step
                    ? 'bg-accent'
                    : ['welcome', 'cli-check', 'working-dir', 'complete'].indexOf(step) > i
                      ? 'bg-accent/50'
                      : 'bg-white/20'
                }`}
              />
              {i < 3 && <div className="w-8 h-px bg-white/10" />}
            </div>
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="p-8">
          {step === 'welcome' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-text mb-3">{t('setup.welcomeTitle')}</h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {t('setup.welcomeDesc')}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-accent text-lg mt-0.5">1</span>
                  <div>
                    <p className="text-sm text-text font-medium">{t('setup.step1Title')}</p>
                    <p className="text-xs text-text-muted">{t('setup.step1Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-accent text-lg mt-0.5">2</span>
                  <div>
                    <p className="text-sm text-text font-medium">{t('setup.step2Title')}</p>
                    <p className="text-xs text-text-muted">{t('setup.step2Desc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-accent text-lg mt-0.5">3</span>
                  <div>
                    <p className="text-sm text-text font-medium">{t('setup.step3Title')}</p>
                    <p className="text-xs text-text-muted">{t('setup.step3Desc')}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setStep('cli-check')
                  checkCli()
                  checkNode()
                }}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium cursor-pointer border-none transition-colors"
              >
                {t('setup.startSetup')}
              </button>
            </div>
          )}

          {step === 'cli-check' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-text mb-3">{t('setup.cliTitle')}</h2>
                <p className="text-sm text-text-secondary">{t('setup.cliDesc')}</p>
              </div>

              {cliStatus === null ? (
                <div className="text-center py-4">
                  <p className="text-sm text-text-muted">{t('setup.checking')}</p>
                </div>
              ) : cliStatus.installed ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="text-sm text-green-400 font-medium">
                    {t('setup.cliInstalled', { version: cliStatus.version ?? '' })}
                  </p>
                  {cliStatus.path && (
                    <p className="text-xs text-green-400/60 mt-1 font-mono">{cliStatus.path}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <p className="text-sm text-yellow-400 font-medium">
                      {t('setup.cliNotInstalled')}
                    </p>
                    <p className="text-xs text-yellow-400/60 mt-1">{cliStatus.error}</p>
                  </div>

                  {nodeStatus?.installed ? (
                    <div className="space-y-3">
                      <p className="text-xs text-text-muted">
                        {t('setup.nodeDetected', { version: nodeStatus.version ?? '' })}
                      </p>
                      <button
                        onClick={handleInstallCli}
                        disabled={installing}
                        className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/80 disabled:bg-accent/40 text-white text-sm font-medium cursor-pointer disabled:cursor-wait border-none transition-colors"
                      >
                        {installing ? t('setup.installing') : t('setup.autoInstall')}
                      </button>
                      {installMessage && (
                        <p
                          className={`text-xs ${installMessage.includes('실패') || installMessage.includes('fail') ? 'text-red-400' : 'text-text-muted'}`}
                        >
                          {installMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-text-muted">{t('setup.nodeNotInstalled')}</p>
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-text-secondary font-mono">
                          npm install -g @anthropic-ai/claude-code
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('welcome')}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted text-sm cursor-pointer border-none transition-colors"
                >
                  {t('setup.prev')}
                </button>
                <button
                  onClick={() => setStep('working-dir')}
                  className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium cursor-pointer border-none transition-colors"
                >
                  {cliStatus?.installed ? t('setup.next') : t('setup.skipCli')}
                </button>
              </div>
            </div>
          )}

          {step === 'working-dir' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-text mb-3">
                  {t('setup.workingDirTitle')}
                </h2>
                <p className="text-sm text-text-secondary">{t('setup.workingDirDesc')}</p>
              </div>

              <div className="space-y-3">
                <div
                  onClick={handleSelectDir}
                  className="w-full p-4 rounded-lg border border-dashed border-white/20 hover:border-accent/50 bg-white/5 cursor-pointer transition-colors text-center"
                >
                  {workingDir ? (
                    <div>
                      <p className="text-sm text-text font-mono">{workingDir}</p>
                      <p className="text-xs text-text-muted mt-1">{t('setup.clickToChange')}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-text-muted">{t('setup.clickToSelect')}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {t('setup.dirExample', { username: '{username}' })}
                      </p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-text-muted">{t('setup.defaultDirNote')}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('cli-check')}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted text-sm cursor-pointer border-none transition-colors"
                >
                  {t('setup.prev')}
                </button>
                <button
                  onClick={() => setStep('complete')}
                  className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium cursor-pointer border-none transition-colors"
                >
                  {t('setup.next')}
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="text-4xl mb-4">&#10003;</div>
                <h2 className="text-lg font-semibold text-text mb-3">{t('setup.completeTitle')}</h2>
                <p className="text-sm text-text-secondary">{t('setup.completeDesc')}</p>
              </div>

              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${cliStatus?.installed ? 'bg-green-400' : 'bg-yellow-400'}`}
                  />
                  <span className="text-sm text-text-secondary">
                    {t('setup.cliSummary')}:{' '}
                    {cliStatus?.installed ? `v${cliStatus.version}` : t('setup.notInstalledNote')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${workingDir ? 'bg-green-400' : 'bg-white/30'}`}
                  />
                  <span className="text-sm text-text-secondary">
                    {t('setup.workingDirSummary')}: {workingDir || t('setup.defaultDir')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-sm text-text-secondary">{t('setup.agentTeam')}</span>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-xs text-text-muted leading-relaxed">
                  <strong className="text-text-secondary">{t('setup.howToStart')}</strong>{' '}
                  {t('setup.howToStartDesc')}
                </p>
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white text-sm font-medium cursor-pointer border-none transition-colors"
              >
                {t('setup.letsStart')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
