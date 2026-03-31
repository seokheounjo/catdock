import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { MODEL_OPTIONS, PERMISSION_MODES } from '../../../../shared/constants'
import { RoleTemplate, PermissionMode } from '../../../../shared/types'
import { useI18n } from '../../hooks/useI18n'
import { VERSION_DISPLAY } from '../../../../shared/version'

export function GlobalSettingsPanel() {
  const { t } = useI18n()
  const { settings, updateSettings } = useSettingsStore()
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<RoleTemplate | null>(null)

  useEffect(() => {
    window.api.settings.getRoleTemplates().then(setRoleTemplates)
  }, [settings])

  if (!settings) {
    return <div className="text-sm text-text-muted">{t('common.loading')}</div>
  }

  const builtinTemplates = roleTemplates.filter((tmpl) => tmpl.isBuiltin)
  const customTemplates = roleTemplates.filter((tmpl) => !tmpl.isBuiltin)

  const handleSaveTemplate = async (template: RoleTemplate) => {
    await window.api.settings.saveRoleTemplate(template)
    const updated = await window.api.settings.getRoleTemplates()
    setRoleTemplates(updated)
    setEditingTemplate(null)
  }

  const handleDeleteTemplate = async (id: string) => {
    await window.api.settings.deleteRoleTemplate(id)
    const updated = await window.api.settings.getRoleTemplates()
    setRoleTemplates(updated)
  }

  const handleNewTemplate = () => {
    setEditingTemplate({
      id: `custom-${Date.now()}`,
      name: '',
      isBuiltin: false,
      isLeaderTemplate: false,
      systemPrompt: '',
      defaultModel: 'claude-sonnet-4-20250514',
      defaultPermissionMode: 'acceptEdits',
      defaultMaxTurns: 25
    })
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-text mb-4">{t('settings.globalSettings')}</h2>

      <div className="max-w-lg space-y-6">
        {/* 기본 모델 */}
        <label className="block">
          <span className="text-xs text-text-muted mb-1 block">{t('settings.defaultModel')}</span>
          <select
            value={settings.defaultModel}
            onChange={(e) => updateSettings({ defaultModel: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#1e1e30]">
                {m.label} ({m.tier})
              </option>
            ))}
          </select>
        </label>

        {/* 기본 Permission Mode */}
        <label className="block">
          <span className="text-xs text-text-muted mb-1 block">
            {t('settings.defaultPermissionMode')}
          </span>
          <select
            value={settings.defaultPermissionMode}
            onChange={(e) =>
              updateSettings({
                defaultPermissionMode: e.target.value as typeof settings.defaultPermissionMode
              })
            }
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value} className="bg-[#1e1e30]">
                {m.label} — {m.description}
              </option>
            ))}
          </select>
        </label>

        {/* 기본 Max Turns */}
        <label className="block">
          <span className="text-xs text-text-muted mb-1 block">
            {t('settings.defaultMaxTurns')}: {settings.defaultMaxTurns}
          </span>
          <input
            type="range"
            min="1"
            max="100"
            value={settings.defaultMaxTurns}
            onChange={(e) => updateSettings({ defaultMaxTurns: Number(e.target.value) })}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>1</span>
            <span>50</span>
            <span>100</span>
          </div>
        </label>

        {/* 기본 Working Directory */}
        <label className="block">
          <span className="text-xs text-text-muted mb-1 block">
            {t('settings.defaultWorkingDir')}
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.defaultWorkingDirectory}
              onChange={(e) => updateSettings({ defaultWorkingDirectory: e.target.value })}
              placeholder={t('settings.workingDirPlaceholder')}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
            <button
              onClick={async () => {
                const dir = await window.api.window.selectDirectory()
                if (dir) updateSettings({ defaultWorkingDirectory: dir })
              }}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-text-muted hover:bg-white/10 cursor-pointer text-sm transition-colors"
            >
              {t('settings.browse')}
            </button>
          </div>
        </label>

        {/* 에이전트 스폰 제한 */}
        <label className="block">
          <span className="text-xs text-text-muted mb-1 block">
            {t('settings.agentSpawnLimit')}: {settings.agentSpawnLimit}
          </span>
          <input
            type="range"
            min="1"
            max="50"
            value={settings.agentSpawnLimit}
            onChange={(e) => updateSettings({ agentSpawnLimit: Number(e.target.value) })}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-muted">
            <span>1</span>
            <span>25</span>
            <span>50</span>
          </div>
        </label>

        {/* 구분선 */}
        <div className="h-px bg-white/10" />

        {/* 전사 규칙 */}
        <div>
          <span className="text-xs text-text-muted mb-1 block">{t('settings.companyRules')}</span>
          <p className="text-[10px] text-text-muted mb-2">{t('settings.companyRulesDesc')}</p>
          <textarea
            value={settings.companyRules ?? ''}
            onChange={(e) => updateSettings({ companyRules: e.target.value })}
            placeholder={t('settings.companyRulesPlaceholder')}
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent resize-none"
          />
        </div>

        {/* 구분선 */}
        <div className="h-px bg-white/10" />

        {/* 예산 관리 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text">예산 관리</h3>
          <p className="text-[10px] text-text-muted">에이전트별 월 API 사용 한도를 설정합니다. 초과 시 자동 중지됩니다.</p>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              기본 월 예산 (USD): {settings.defaultBudgetLimitUsd ?? '무제한'}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0"
                value={settings.defaultBudgetLimitUsd ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined
                  updateSettings({ defaultBudgetLimitUsd: val })
                }}
                placeholder="미설정 시 무제한"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-sm outline-none focus:border-accent"
              />
              <span className="text-xs text-text-muted">USD/월</span>
            </div>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              경고 임계치: {settings.defaultBudgetWarningPercent ?? 80}%
            </span>
            <input
              type="range"
              min="50"
              max="95"
              step="5"
              value={settings.defaultBudgetWarningPercent ?? 80}
              onChange={(e) => updateSettings({ defaultBudgetWarningPercent: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>50%</span>
              <span>80%</span>
              <span>95%</span>
            </div>
          </label>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-white/10" />

        {/* 승인 게이트 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text">승인 게이트</h3>
          <p className="text-[10px] text-text-muted">활성화하면 에이전트가 작업 위임이나 에이전트 생성 전에 사용자 승인을 요청합니다.</p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requireDelegationApproval ?? false}
              onChange={(e) => updateSettings({ requireDelegationApproval: e.target.checked })}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm text-text">작업 위임 시 승인 필요</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.requireAgentSpawnApproval ?? false}
              onChange={(e) => updateSettings({ requireAgentSpawnApproval: e.target.checked })}
              className="w-4 h-4 rounded accent-accent"
            />
            <span className="text-sm text-text">에이전트 생성 시 승인 필요</span>
          </label>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-white/10" />

        {/* 언어 설정 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text">{t('settings.language')}</h3>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('settings.uiLanguage')}</span>
            <select
              value={settings.language ?? 'ko'}
              onChange={(e) =>
                updateSettings({ language: e.target.value as 'ko' | 'en' | 'ja' | 'zh' })
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              <option value="ko" className="bg-[#1e1e30]">
                {t('settings.langKo')}
              </option>
              <option value="en" className="bg-[#1e1e30]">
                {t('settings.langEn')}
              </option>
              <option value="ja" className="bg-[#1e1e30]">
                {t('settings.langJa')}
              </option>
              <option value="zh" className="bg-[#1e1e30]">
                {t('settings.langZh')}
              </option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              {t('settings.agentLanguage')}
            </span>
            <p className="text-[10px] text-text-muted mb-1">{t('settings.agentLanguageDesc')}</p>
            <select
              value={settings.agentLanguage ?? ''}
              onChange={(e) =>
                updateSettings({
                  agentLanguage: (e.target.value || undefined) as
                    | 'ko'
                    | 'en'
                    | 'ja'
                    | 'zh'
                    | undefined
                })
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              <option value="" className="bg-[#1e1e30]">
                {t('settings.langAuto')}
              </option>
              <option value="ko" className="bg-[#1e1e30]">
                {t('settings.langKo')}
              </option>
              <option value="en" className="bg-[#1e1e30]">
                {t('settings.langEn')}
              </option>
              <option value="ja" className="bg-[#1e1e30]">
                {t('settings.langJa')}
              </option>
              <option value="zh" className="bg-[#1e1e30]">
                {t('settings.langZh')}
              </option>
            </select>
          </label>
        </div>

        {/* 구분선 */}
        <div className="h-px bg-white/10" />

        {/* 역할 템플릿 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text">{t('settings.roleTemplates')}</h3>
            <button
              onClick={handleNewTemplate}
              className="text-xs text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
            >
              + {t('settings.addTemplate')}
            </button>
          </div>

          {/* 빌트인 */}
          <div>
            <span className="text-[10px] text-text-muted mb-1 block">
              {t('settings.builtinTemplates')}
            </span>
            <div className="space-y-1">
              {builtinTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded bg-white/5 border border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text">{tmpl.name}</span>
                    {tmpl.isLeaderTemplate && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] border border-purple-500/30">
                        {t('settings.leaderTemplate')}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted">{tmpl.defaultModel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 커스텀 */}
          {customTemplates.length > 0 && (
            <div>
              <span className="text-[10px] text-text-muted mb-1 block">
                {t('settings.customTemplates')}
              </span>
              <div className="space-y-1">
                {customTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded bg-white/5 border border-white/10 group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text">{tmpl.name}</span>
                      {tmpl.isLeaderTemplate && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[9px] border border-purple-500/30">
                          {t('settings.leaderTemplate')}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingTemplate(tmpl)}
                        className="text-[10px] text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
                      >
                        {t('settings.editTemplate')}
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="text-[10px] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                      >
                        {t('settings.deleteTemplate')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 버전 정보 */}
      <div className="pt-6 mt-4 border-t border-white/5 text-center">
        <span className="text-[11px] text-text-muted/50">{VERSION_DISPLAY}</span>
      </div>

      {/* 템플릿 편집 모달 */}
      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}
    </div>
  )
}

function TemplateEditor({
  template,
  onSave,
  onClose
}: {
  template: RoleTemplate
  onSave: (tmpl: RoleTemplate) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(template.name)
  const [isLeader, setIsLeader] = useState(template.isLeaderTemplate)
  const [systemPrompt, setSystemPrompt] = useState(template.systemPrompt)
  const [model, setModel] = useState(template.defaultModel)
  const [permissionMode, setPermissionMode] = useState(template.defaultPermissionMode)
  const [maxTurns, setMaxTurns] = useState(template.defaultMaxTurns)

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      ...template,
      name: name.trim(),
      isLeaderTemplate: isLeader,
      systemPrompt,
      defaultModel: model,
      defaultPermissionMode: permissionMode,
      defaultMaxTurns: maxTurns
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-chat-bg border border-white/10 rounded-xl w-[480px] max-h-[80vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-text">{t('settings.roleTemplates')}</h3>
        </div>
        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('settings.templateName')}</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isLeader}
              onChange={(e) => setIsLeader(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-xs text-text-secondary">{t('settings.leaderTemplate')}</span>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              {t('agentEditor.systemPrompt')}
            </span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">{t('agentEditor.model')}</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#1e1e30]">
                  {m.label} ({m.tier})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              {t('agentEditor.permissionMode')}
            </span>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {PERMISSION_MODES.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#1e1e30]">
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-text-muted mb-1 block">
              {t('agentEditor.maxTurns')}: {maxTurns}
            </span>
            <input
              type="range"
              min="1"
              max="100"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 text-text-muted hover:bg-white/10 cursor-pointer border border-white/10 text-sm transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer border-none text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
