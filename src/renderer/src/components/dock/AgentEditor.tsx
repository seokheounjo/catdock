import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { generateAvatar, getRandomSeed } from '../../utils/avatar'
import { CAT_BREEDS, CAT_BREED_LABELS } from '../../utils/cat-avatar'
import {
  AgentConfig,
  AgentRole,
  CliProvider,
  CliCheckResult,
  CliProfile,
  PermissionMode,
  McpServerConfig,
  DiscoveredMcpServer,
  RoleTemplate
} from '../../../../shared/types'
import type { ModelTier } from '../../../../shared/constants'
import {
  MODEL_OPTIONS,
  PERMISSION_MODES,
  ROLE_PRESETS,
  CLI_PROVIDER_OPTIONS,
  PROVIDER_MODEL_OPTIONS
} from '../../../../shared/constants'
import { useI18n } from '../../hooks/useI18n'

interface AgentEditorProps {
  onClose: () => void
  editAgentId?: string
}

type EditorTab = 'identity' | 'model' | 'prompt' | 'mcp' | 'advanced' | 'actions'

const TAB_KEYS: { key: EditorTab; labelKey: string }[] = [
  { key: 'identity', labelKey: 'agentEditor.identity' },
  { key: 'model', labelKey: 'agentEditor.modelPerms' },
  { key: 'prompt', labelKey: 'agentEditor.systemPrompt' },
  { key: 'mcp', labelKey: 'agentEditor.mcp' },
  { key: 'advanced', labelKey: 'agentEditor.advanced' },
  { key: 'actions', labelKey: 'agentEditor.actions' }
]

export function AgentEditor({ onClose, editAgentId }: AgentEditorProps) {
  const { t } = useI18n()
  const { createAgent, updateAgent } = useAgentStore()
  const [activeTab, setActiveTab] = useState<EditorTab>('identity')
  const [editAgent, setEditAgent] = useState<AgentConfig | null>(null)

  // Identity
  const [name, setName] = useState('')
  const [role, setRole] = useState(ROLE_PRESETS[0])
  const [avatarStyle, setAvatarStyle] = useState('maine-coon')
  const [avatarSeed, setAvatarSeed] = useState(getRandomSeed())

  // Model & Permissions
  const [cliProvider, setCliProvider] = useState<CliProvider>('claude')
  const [providerStatus, setProviderStatus] = useState<Record<string, CliCheckResult>>({})
  const [model, setModel] = useState('claude-opus-4-6')
  const [customModel, setCustomModel] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('acceptEdits')
  const [maxTurns, setMaxTurns] = useState(25)
  const [budgetLimitUsd, setBudgetLimitUsd] = useState<number | undefined>(undefined)
  const [budgetWarningPercent, setBudgetWarningPercent] = useState<number | undefined>(undefined)

  // Prompt
  const [systemPrompt, setSystemPrompt] = useState('')

  // MCP
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([])
  const [teamMcpServers, setTeamMcpServers] = useState<McpServerConfig[]>([])

  // Hierarchy
  const [hierarchyRole, setHierarchyRole] = useState<AgentRole>('member')
  const [reportsTo, setReportsTo] = useState('')
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([])

  // Advanced
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [group, setGroup] = useState('')
  const [verbose, setVerbose] = useState(true)
  const [debug, setDebug] = useState(false)
  const [worktree, setWorktree] = useState(false)
  const [jsonSchema, setJsonSchema] = useState('')
  const [additionalArgs, setAdditionalArgs] = useState('')

  // 역할 템플릿
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([])

  // 발견된 MCP 서버
  const [discoveredMcp, setDiscoveredMcp] = useState<DiscoveredMcpServer[]>([])

  // CLI 프로필
  const [cliProfileId, setCliProfileId] = useState<string>('auto')
  const [cliProfiles, setCliProfiles] = useState<CliProfile[]>([])

  // 동적 모델 목록 (클라우드 + 로컬)
  const [dynamicModels, setDynamicModels] = useState<
    { value: string; label: string; tier: ModelTier }[]
  >([])

  // 자동 채움 피드백 배너
  const [autoFillBanner, setAutoFillBanner] = useState<string | null>(null)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 에이전트 목록 + 역할 템플릿 + 프로바이더 상태 + 기본 설정 로드
  useEffect(() => {
    window.api.agent.list().then(setAllAgents)
    window.api.settings.getRoleTemplates().then(setRoleTemplates)
    window.api.cli.checkAllProviders().then(setProviderStatus)
    window.api.mcp.getDiscovered().then(setDiscoveredMcp).catch(() => {})
    window.api.profile.list().then(setCliProfiles).catch(() => {})
    // 새 에이전트 생성 시 글로벌 기본 모델/권한/턴 적용
    if (!editAgentId) {
      window.api.settings.get().then((s) => {
        if (s.defaultModel) setModel(s.defaultModel)
        if (s.defaultPermissionMode) setPermissionMode(s.defaultPermissionMode)
        if (s.defaultMaxTurns) setMaxTurns(s.defaultMaxTurns)
        if (s.defaultCliProvider) setCliProvider(s.defaultCliProvider)
      })
    }
  }, [editAgentId])

  // 프로바이더 변경 시 동적 모델 목록 로드
  useEffect(() => {
    window.api.model.getAvailable(cliProvider).then(setDynamicModels).catch(() => {
      setDynamicModels(PROVIDER_MODEL_OPTIONS[cliProvider] ?? [])
    })
    // 프로바이더별 프로필 로드
    window.api.profile.listForProvider(cliProvider).then(setCliProfiles).catch(() => {})
  }, [cliProvider])

  // 템플릿 적용 헬퍼
  const applyTemplate = useCallback(
    (tmpl: RoleTemplate) => {
      setRole(tmpl.name)
      setSystemPrompt(tmpl.systemPrompt)
      const isKnown = MODEL_OPTIONS.some((m) => m.value === tmpl.defaultModel)
      if (isKnown) {
        setModel(tmpl.defaultModel)
        setCustomModel('')
      } else {
        setModel('custom')
        setCustomModel(tmpl.defaultModel)
      }
      setPermissionMode(tmpl.defaultPermissionMode)
      setMaxTurns(tmpl.defaultMaxTurns)
      if (tmpl.isLeaderTemplate) setHierarchyRole('leader')

      // 모델 표시명 조회
      const modelLabel =
        MODEL_OPTIONS.find((m) => m.value === tmpl.defaultModel)?.label ?? tmpl.defaultModel
      const permLabel =
        PERMISSION_MODES.find((m) => m.value === tmpl.defaultPermissionMode)?.label ??
        tmpl.defaultPermissionMode
      const bannerMsg = t('agentEditor.templateApplied', {
        name: tmpl.name,
        model: modelLabel,
        perm: permLabel,
        turns: String(tmpl.defaultMaxTurns)
      })
      setAutoFillBanner(bannerMsg)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = setTimeout(() => setAutoFillBanner(null), 3000)
    },
    [t]
  )

  // 기존 에이전트 편집 시 데이터 로드
  useEffect(() => {
    if (editAgentId) {
      window.api.agent.getState(editAgentId).then((state) => {
        if (state) {
          const c = state.config
          setEditAgent(c)
          setName(c.name)
          setRole(c.role)
          setAvatarStyle(c.avatar.style)
          setAvatarSeed(c.avatar.seed)
          setSystemPrompt(c.systemPrompt)
          setWorkingDirectory(c.workingDirectory)
          setGroup(c.group || '')
          setHierarchyRole(c.hierarchy?.role ?? 'member')
          setReportsTo(c.hierarchy?.reportsTo ?? '')
          setCliProvider(c.cliProvider ?? 'claude')
          setCliProfileId(c.cliProfileId ?? 'auto')

          // 모델: MODEL_OPTIONS에 있으면 선택, 없으면 custom
          const isKnown = MODEL_OPTIONS.some((m) => m.value === c.model)
          if (isKnown) {
            setModel(c.model)
            setCustomModel('')
          } else {
            setModel('custom')
            setCustomModel(c.model)
          }

          setPermissionMode(c.permissionMode ?? 'acceptEdits')
          setMaxTurns(c.maxTurns ?? 25)
          setBudgetLimitUsd(c.budgetLimitUsd)
          setBudgetWarningPercent(c.budgetWarningPercent)
          setMcpServers(c.mcpConfig ?? [])
          setTeamMcpServers(c.teamMcpConfig ?? [])
          setVerbose(c.cliFlags?.verbose !== false)
          setDebug(c.cliFlags?.debug ?? false)
          setWorktree(c.cliFlags?.worktree ?? false)
          setJsonSchema(c.cliFlags?.jsonSchema ?? '')
          setAdditionalArgs((c.cliFlags?.additionalArgs ?? []).join(' '))
        }
      })
    }
  }, [editAgentId])

  // 프로바이더별 모델 옵션 (동적 로드 결과 우선, fallback은 상수)
  const currentModelOptions = useMemo(
    () => (dynamicModels.length > 0 ? dynamicModels : (PROVIDER_MODEL_OPTIONS[cliProvider] ?? MODEL_OPTIONS)),
    [cliProvider, dynamicModels]
  )

  // 클라우드 / 로컬 모델 분리
  const cloudModels = useMemo(
    () => currentModelOptions.filter((m) => m.tier !== 'local'),
    [currentModelOptions]
  )
  const localModels = useMemo(
    () => currentModelOptions.filter((m) => m.tier === 'local'),
    [currentModelOptions]
  )

  // 프로바이더별 기능 지원 여부
  const providerSupportsMcp = cliProvider === 'claude'
  const providerSupportsPermission = cliProvider === 'claude'

  const avatarUri = useMemo(
    () => generateAvatar(avatarStyle, avatarSeed),
    [avatarStyle, avatarSeed]
  )

  const handleSelectDir = async () => {
    const dir = await window.api.window.selectDirectory()
    if (dir) setWorkingDirectory(dir)
  }

  const resolvedModel = model === 'custom' ? customModel : model

  const handleSubmit = async () => {
    if (!name.trim()) return

    const config: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      role,
      avatar: { style: avatarStyle, seed: avatarSeed },
      systemPrompt: systemPrompt || getDefaultPrompt(role),
      workingDirectory,
      model: resolvedModel,
      cliProvider: cliProvider !== 'claude' ? cliProvider : undefined,
      cliProfileId: cliProfileId !== 'auto' ? cliProfileId : undefined,
      group: group || undefined,
      hierarchy:
        hierarchyRole === 'director'
          ? { role: 'director' as const, subordinates: [] }
          : hierarchyRole === 'leader'
            ? { role: 'leader' as const, subordinates: [], reportsTo: reportsTo || undefined }
            : { role: 'member' as const, reportsTo: reportsTo || undefined },
      permissionMode,
      maxTurns,
      budgetLimitUsd,
      budgetWarningPercent,
      mcpConfig: mcpServers.length > 0 ? mcpServers : undefined,
      teamMcpConfig:
        (hierarchyRole === 'leader' || hierarchyRole === 'director') && teamMcpServers.length > 0
          ? teamMcpServers
          : undefined,
      cliFlags: {
        verbose,
        debug: debug || undefined,
        worktree: worktree || undefined,
        jsonSchema: jsonSchema || undefined,
        additionalArgs: additionalArgs ? additionalArgs.split(' ').filter(Boolean) : undefined
      }
    }

    if (editAgent) {
      await updateAgent(editAgent.id, config)
    } else {
      await createAgent(config)
    }
    onClose()
  }

  // MCP helpers
  const addMcpServer = () => {
    setMcpServers([...mcpServers, { name: '', command: '', args: [], enabled: true }])
  }
  const removeMcpServer = (idx: number) => {
    setMcpServers(mcpServers.filter((_, i) => i !== idx))
  }
  const updateMcpServer = (idx: number, updates: Partial<McpServerConfig>) => {
    setMcpServers(mcpServers.map((s, i) => (i === idx ? { ...s, ...updates } : s)))
  }

  // Team MCP helpers (리더 전용)
  const addTeamMcpServer = () => {
    setTeamMcpServers([...teamMcpServers, { name: '', command: '', args: [], enabled: true }])
  }
  const removeTeamMcpServer = (idx: number) => {
    setTeamMcpServers(teamMcpServers.filter((_, i) => i !== idx))
  }
  const updateTeamMcpServer = (idx: number, updates: Partial<McpServerConfig>) => {
    setTeamMcpServers(teamMcpServers.map((s, i) => (i === idx ? { ...s, ...updates } : s)))
  }

  // Actions
  const handleDuplicate = async () => {
    if (!editAgent) return
    await window.api.agent.duplicate(editAgent.id)
    onClose()
  }
  const handleExport = async () => {
    if (!editAgent) return
    const json = await window.api.agent.exportConfig(editAgent.id)
    if (json) {
      navigator.clipboard.writeText(json)
    }
  }
  const handleImport = async () => {
    const json = prompt(t('agentEditor.pasteJson'))
    if (json) {
      try {
        await window.api.agent.importConfig(json)
        onClose()
      } catch {
        alert(t('agentEditor.invalidJson'))
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 타이틀 바 */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h2 className="text-base font-semibold text-text">
          {editAgent ? t('agentEditor.editAgent') : t('agentEditor.newAgent')}
        </h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-white/10 text-text-muted hover:text-text-secondary flex items-center justify-center cursor-pointer bg-transparent border-none text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ✕
        </button>
      </div>

      {/* 탭 바 */}
      <div className="flex border-b border-white/10 px-2 shrink-0">
        {TAB_KEYS.map(
          (tab) =>
            // Actions 탭은 편집 모드에서만
            (tab.key !== 'actions' || editAgent) && (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-[11px] border-none cursor-pointer transition-colors ${
                  activeTab === tab.key
                    ? 'text-accent border-b-2 border-b-accent bg-transparent'
                    : 'text-text-muted hover:text-text-secondary bg-transparent'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            )
        )}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-auto px-5 py-4">
        {activeTab === 'identity' && (
          <div className="space-y-4">
            {/* 자동 채움 피드백 배너 */}
            {autoFillBanner && (
              <div className="px-3 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs animate-fade-in">
                {autoFillBanner}
              </div>
            )}

            {/* 아바타 미리보기 */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 border border-white/20 shrink-0">
                <img src={avatarUri} alt="avatar" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex gap-1.5 flex-wrap">
                  {CAT_BREEDS.map((breed) => (
                    <button
                      key={breed}
                      className={`px-2.5 py-1 rounded text-xs border cursor-pointer transition-all ${
                        avatarStyle === breed
                          ? 'bg-accent text-white border-accent'
                          : 'bg-white/5 text-text-muted border-white/10 hover:bg-white/10'
                      }`}
                      onClick={() => setAvatarStyle(breed)}
                    >
                      {CAT_BREED_LABELS[breed]}
                    </button>
                  ))}
                </div>
                <button
                  className="text-xs text-accent hover:text-accent-hover cursor-pointer bg-transparent border-none text-left w-fit"
                  onClick={() => setAvatarSeed(getRandomSeed())}
                >
                  {t('agentEditor.randomize')}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">{t('agentEditor.name')}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent transition-colors"
              />
            </label>

            {/* 계층 역할 (리더/멤버 먼저 선택) */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.hierarchyRole')}
              </span>
              <select
                value={hierarchyRole}
                onChange={(e) => {
                  const newRole = e.target.value as AgentRole
                  const prevRole = hierarchyRole
                  setHierarchyRole(newRole)

                  // director/leader로 전환 시 첫 번째 리더 템플릿 자동 적용
                  if ((newRole === 'leader' || newRole === 'director') && prevRole === 'member') {
                    const leaderTmpl = roleTemplates.find((tmpl) => tmpl.isLeaderTemplate)
                    if (leaderTmpl) applyTemplate(leaderTmpl)
                  }
                  // 멤버로 전환 시 현재 역할이 리더 전용이면 첫 번째 멤버 템플릿으로 리셋
                  if (newRole === 'member' && (prevRole === 'leader' || prevRole === 'director')) {
                    const isCurrentLeaderOnly = roleTemplates.some(
                      (tmpl) => tmpl.isLeaderTemplate && tmpl.name === role
                    )
                    if (isCurrentLeaderOnly) {
                      const memberTmpl = roleTemplates.find((tmpl) => !tmpl.isLeaderTemplate)
                      if (memberTmpl) applyTemplate(memberTmpl)
                    }
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
              >
                <option value="member" className="bg-surface">
                  {t('agentEditor.member')}
                </option>
                <option value="leader" className="bg-surface">
                  {t('agentEditor.leader')}
                </option>
                <option value="director" className="bg-surface">
                  {t('agentEditor.director')}
                </option>
              </select>
            </label>

            {/* 역할 템플릿 (설명 강화) */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.roleTemplate')}
              </span>
              <select
                value=""
                onChange={(e) => {
                  const tmpl = roleTemplates.find((rt) => rt.id === e.target.value)
                  if (tmpl) applyTemplate(tmpl)
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
              >
                <option value="" className="bg-surface">
                  {t('agentEditor.selectTemplateAutoFill')}
                </option>
                {roleTemplates
                  .filter((tmpl) =>
                    hierarchyRole === 'leader' || hierarchyRole === 'director'
                      ? tmpl.isLeaderTemplate
                      : !tmpl.isLeaderTemplate
                  )
                  .map((tmpl) => {
                    const modelLabel =
                      MODEL_OPTIONS.find((m) => m.value === tmpl.defaultModel)?.label ??
                      tmpl.defaultModel
                    const permLabel =
                      PERMISSION_MODES.find((m) => m.value === tmpl.defaultPermissionMode)?.label ??
                      tmpl.defaultPermissionMode
                    return (
                      <option key={tmpl.id} value={tmpl.id} className="bg-surface">
                        {tmpl.name} — {modelLabel} · {permLabel}
                      </option>
                    )
                  })}
              </select>
              <span className="text-[10px] text-text-muted mt-1 block">
                {t('agentEditor.templateAutoFillHint')}
              </span>
            </label>

            {/* 역할 (자유 텍스트 입력 + 자동완성) */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">{t('agentEditor.role')}</span>
              <input
                type="text"
                list="role-presets"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t('agentEditor.rolePlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent transition-colors"
              />
              <datalist id="role-presets">
                {ROLE_PRESETS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">{t('agentEditor.group')}</span>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="e.g. Project Alpha"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
              />
            </label>

            {(hierarchyRole === 'member' || hierarchyRole === 'leader') && (
              <label className="block">
                <span className="text-xs text-text-muted mb-1 block">
                  {t('agentEditor.reportsTo')}
                </span>
                <select
                  value={reportsTo}
                  onChange={(e) => setReportsTo(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  <option value="" className="bg-surface">
                    {t('agentEditor.none')}
                  </option>
                  {allAgents
                    .filter((a) => {
                      if (a.id === editAgent?.id) return false
                      // member → leader/director에 보고 가능
                      if (hierarchyRole === 'member')
                        return a.hierarchy?.role === 'leader' || a.hierarchy?.role === 'director'
                      // leader → director에만 보고 가능
                      if (hierarchyRole === 'leader') return a.hierarchy?.role === 'director'
                      return false
                    })
                    .map((a) => (
                      <option key={a.id} value={a.id} className="bg-surface">
                        {a.name} ({a.role})
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        )}

        {activeTab === 'model' && (
          <div className="space-y-4">
            {/* CLI 프로바이더 선택 */}
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.cliProvider')}
              </span>
              <select
                value={cliProvider}
                onChange={(e) => {
                  const newProvider = e.target.value as CliProvider
                  setCliProvider(newProvider)
                  // 프로바이더 변경 시 모델을 해당 프로바이더의 첫 번째 모델로 초기화
                  const providerModels = PROVIDER_MODEL_OPTIONS[newProvider]
                  if (providerModels && providerModels.length > 0) {
                    setModel(providerModels[0].value)
                    setCustomModel('')
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
              >
                {CLI_PROVIDER_OPTIONS.map((p) => {
                  const status = providerStatus[p.value]
                  const badge = status?.installed ? ' ●' : ' ○'
                  return (
                    <option key={p.value} value={p.value} className="bg-surface">
                      {p.label}{badge} — {p.description}
                    </option>
                  )
                })}
              </select>
              {/* 설치 상태 뱃지 */}
              {providerStatus[cliProvider] && (
                <span
                  className={`text-[10px] mt-1 block ${
                    providerStatus[cliProvider].installed
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {providerStatus[cliProvider].installed
                    ? `✓ ${t('agentEditor.cliInstalled')} (v${providerStatus[cliProvider].version})`
                    : `✗ ${t('agentEditor.cliNotInstalled')} — ${CLI_PROVIDER_OPTIONS.find((p) => p.value === cliProvider)?.label}`}
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">{t('agentEditor.model')}</span>
              <select
                value={currentModelOptions.some((m) => m.value === model) ? model : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setModel('custom')
                  } else {
                    setModel(e.target.value)
                    setCustomModel('')
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
              >
                {cloudModels.length > 0 && (
                  <optgroup label={`── ${t('agentEditor.cloudModels')} ──`}>
                    {cloudModels.map((m) => (
                      <option key={m.value} value={m.value} className="bg-surface">
                        {m.label} ({m.tier})
                      </option>
                    ))}
                  </optgroup>
                )}
                {localModels.length > 0 && (
                  <optgroup label={`── ${t('agentEditor.localModels')} ──`}>
                    {localModels.map((m) => (
                      <option key={m.value} value={m.value} className="bg-surface">
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="custom" className="bg-surface">
                  {t('agentEditor.customModelId')}
                </option>
              </select>
            </label>

            {(model === 'custom' || !currentModelOptions.some((m) => m.value === model)) && (
              <label className="block">
                <span className="text-xs text-text-muted mb-1 block">
                  {t('agentEditor.customModelId')}
                </span>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="model-id..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
                />
              </label>
            )}

            {/* CLI 프로필 선택 (프로필 존재 시만 표시) */}
            {cliProfiles.length > 0 && (
              <label className="block">
                <span className="text-xs text-text-muted mb-1 block">
                  {t('agentEditor.cliProfile')}
                </span>
                <select
                  value={cliProfileId}
                  onChange={(e) => setCliProfileId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  <option value="auto" className="bg-surface">
                    {t('agentEditor.profileAuto')}
                  </option>
                  {cliProfiles.map((p) => (
                    <option key={p.id} value={p.id} className="bg-surface">
                      {p.name}{p.isDefault ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={`block ${!providerSupportsPermission ? 'opacity-50' : ''}`}>
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.permissionMode')}
                {!providerSupportsPermission && (
                  <span className="text-[10px] text-text-muted ml-1">
                    ({t('agentEditor.notSupportedByProvider')})
                  </span>
                )}
              </span>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
                disabled={!providerSupportsPermission}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {PERMISSION_MODES.map((m) => (
                  <option key={m.value} value={m.value} className="bg-surface">
                    {m.label} — {m.description}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.maxTurnsLabel', { count: String(maxTurns) })}
              </span>
              <input
                type="range"
                min="1"
                max="100"
                value={maxTurns}
                onChange={(e) => setMaxTurns(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[10px] text-text-muted">
                <span>1</span>
                <span>50</span>
                <span>100</span>
              </div>
            </label>

            {/* 예산 설정 */}
            <div className="h-px bg-white/10 my-3" />
            <h4 className="text-xs font-medium text-text mb-2">예산 관리</h4>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                월 예산 한도 (USD)
              </span>
              <input
                type="number"
                step="0.5"
                min="0"
                value={budgetLimitUsd ?? ''}
                onChange={(e) => setBudgetLimitUsd(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="미설정 시 전역 기본값 사용"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-text text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="block mt-2">
              <span className="text-xs text-text-muted mb-1 block">
                경고 임계치 (%): {budgetWarningPercent ?? '기본값(80)'}
              </span>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={budgetWarningPercent ?? 80}
                onChange={(e) => setBudgetWarningPercent(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </label>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div>
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.systemPrompt')}
              </span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={getDefaultPrompt(role)}
                rows={14}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent resize-none"
              />
            </label>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="space-y-3">
            {/* MCP 미지원 프로바이더 경고 */}
            {!providerSupportsMcp && (
              <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                {t('agentEditor.notSupportedByProvider')}
              </div>
            )}
            {/* 팀 MCP 섹션 (리더/디렉터 전용) */}
            {(hierarchyRole === 'leader' || hierarchyRole === 'director') && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium">팀 MCP 서버</span>
                  <button
                    onClick={addTeamMcpServer}
                    className="text-xs text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
                  >
                    + 추가
                  </button>
                </div>
                <div className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-[10px] text-accent">
                  이 설정은 팀원 전체에 자동 적용됩니다
                </div>
                {teamMcpServers.length === 0 ? (
                  <div className="text-xs text-text-muted text-center py-3">팀 MCP 서버 없음</div>
                ) : (
                  teamMcpServers.map((server, idx) => (
                    <div
                      key={`team-${idx}`}
                      className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => updateTeamMcpServer(idx, { enabled: !server.enabled })}
                          className={`w-8 h-4 rounded-full transition-colors cursor-pointer border-none ${
                            server.enabled ? 'bg-green-500' : 'bg-gray-600'
                          }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full bg-white transition-transform ${
                              server.enabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <button
                          onClick={() => removeTeamMcpServer(idx)}
                          className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                        >
                          삭제
                        </button>
                      </div>
                      <input
                        type="text"
                        value={server.name}
                        onChange={(e) => updateTeamMcpServer(idx, { name: e.target.value })}
                        placeholder="서버 이름"
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        value={server.command}
                        onChange={(e) => updateTeamMcpServer(idx, { command: e.target.value })}
                        placeholder="npx, node, python..."
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        value={(server.args ?? []).join(', ')}
                        onChange={(e) =>
                          updateTeamMcpServer(idx, {
                            args: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                          })
                        }
                        placeholder="인수 (쉼표 구분)"
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                      />
                    </div>
                  ))
                )}
                <div className="border-b border-white/10 my-3" />
              </>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{t('agentEditor.agentMcpServers')}</span>
              <button
                onClick={addMcpServer}
                className="text-xs text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
              >
                {t('agentEditor.addMcp')}
              </button>
            </div>
            {mcpServers.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-4">
                {t('agentEditor.noMcpServers')}
              </div>
            ) : (
              mcpServers.map((server, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => updateMcpServer(idx, { enabled: !server.enabled })}
                      className={`w-8 h-4 rounded-full transition-colors cursor-pointer border-none ${
                        server.enabled ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    >
                      <div
                        className={`w-3 h-3 rounded-full bg-white transition-transform ${
                          server.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => removeMcpServer(idx)}
                      className="text-xs text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer"
                    >
                      {t('agentEditor.removeMcp')}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={server.name}
                    onChange={(e) => updateMcpServer(idx, { name: e.target.value })}
                    placeholder={t('agentEditor.serverName')}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={server.command}
                    onChange={(e) => updateMcpServer(idx, { command: e.target.value })}
                    placeholder={t('agentEditor.commandPlaceholder')}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={(server.args ?? []).join(', ')}
                    onChange={(e) =>
                      updateMcpServer(idx, {
                        args: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      })
                    }
                    placeholder={t('agentEditor.argsPlaceholder')}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-text text-xs outline-none focus:border-accent"
                  />
                </div>
              ))
            )}

            {/* 발견된 MCP 서버 (프로젝트/홈 디렉토리에서 자동 감지) */}
            {discoveredMcp.length > 0 && (
              <>
                <div className="border-b border-white/10 my-3" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium">{t('agentEditor.discoveredMcp')}</span>
                </div>
                {discoveredMcp.map((server) => (
                  <div
                    key={`disc-${server.name}-${server.sourcePath}`}
                    className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-text font-medium">{server.name}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">
                          {t('agentEditor.discoveredBadge')}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          if (editAgent) {
                            await window.api.mcp.importDiscovered(server.name, editAgent.id)
                            // 새로고침
                            const updated = await window.api.mcp.getAgent(editAgent.id)
                            setMcpServers(updated)
                          } else {
                            // 새 에이전트 — 로컬 상태에 추가
                            const exists = mcpServers.some((s) => s.name === server.name)
                            if (!exists) {
                              setMcpServers([...mcpServers, {
                                name: server.name,
                                command: server.command,
                                args: server.args,
                                cwd: server.cwd,
                                enabled: true
                              }])
                            }
                          }
                        }}
                        className="text-[10px] text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer"
                      >
                        {t('agentEditor.enableForAgent')}
                      </button>
                    </div>
                    <div className="text-[10px] text-text-muted truncate">
                      {server.command} {(server.args || []).join(' ')}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.workingDir')}
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  placeholder={t('agentEditor.workingDirPlaceholder')}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={handleSelectDir}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-text-muted hover:bg-white/10 cursor-pointer text-sm transition-colors"
                >
                  {t('agentEditor.browse')}
                </button>
              </div>
            </label>

            <div className="space-y-2">
              <span className="text-xs text-text-muted block">{t('agentEditor.cliFlags')}</span>
              <div className="space-y-2">
                {[
                  { label: 'Verbose', checked: verbose, onChange: setVerbose },
                  { label: 'Debug', checked: debug, onChange: setDebug },
                  { label: 'Worktree', checked: worktree, onChange: setWorktree }
                ].map((flag) => (
                  <label key={flag.label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flag.checked}
                      onChange={(e) => flag.onChange(e.target.checked)}
                      className="accent-accent"
                    />
                    <span className="text-xs text-text-secondary">{flag.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.jsonSchemaLabel')}
              </span>
              <input
                type="text"
                value={jsonSchema}
                onChange={(e) => setJsonSchema(e.target.value)}
                placeholder={t('agentEditor.optional')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="text-xs text-text-muted mb-1 block">
                {t('agentEditor.additionalArgs')}
              </span>
              <input
                type="text"
                value={additionalArgs}
                onChange={(e) => setAdditionalArgs(e.target.value)}
                placeholder="e.g. --append-system-prompt '...'"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        )}

        {activeTab === 'actions' && editAgent && (
          <div className="space-y-3">
            <button
              onClick={handleDuplicate}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10 cursor-pointer text-sm text-left transition-colors"
            >
              {t('agentEditor.duplicate')}
            </button>
            <button
              onClick={handleExport}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10 cursor-pointer text-sm text-left transition-colors"
            >
              {t('agentEditor.exportConfig')}
            </button>
            <button
              onClick={handleImport}
              className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-text-secondary hover:bg-white/10 cursor-pointer text-sm text-left transition-colors"
            >
              {t('agentEditor.importJson')}
            </button>
          </div>
        )}
      </div>

      {/* 하단 액션 바 */}
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/5 text-text-muted hover:bg-white/10 cursor-pointer border border-white/10 text-sm transition-colors"
        >
          {t('agentEditor.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || (!resolvedModel && model === 'custom')}
          className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer border-none text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {editAgent ? t('agentEditor.save') : t('agentEditor.create')}
        </button>
      </div>
    </div>
  )
}

function getDefaultPrompt(role: string): string {
  const prompts: Record<string, string> = {
    'Frontend Developer':
      'You are a senior frontend developer. Focus on React, TypeScript, CSS, and UI/UX best practices.',
    'Backend Developer':
      'You are a senior backend developer. Focus on API design, database optimization, and server architecture.',
    'DevOps Engineer':
      'You are a DevOps engineer. Focus on CI/CD, infrastructure, Docker, and deployment strategies.',
    'QA Tester':
      'You are a QA engineer. Focus on testing strategies, bug identification, and quality assurance.',
    Director:
      'You are a director overseeing multiple teams. Coordinate team leads, set cross-team strategy, and ensure alignment.',
    'Tech Lead':
      'You are a tech lead. Focus on architecture decisions, code review, and team coordination.',
    Designer:
      'You are a UI/UX designer. Focus on design systems, user experience, and visual consistency.',
    'Product Manager':
      'You are a product manager. Focus on requirements, user stories, and feature prioritization.',
    'Code Reviewer':
      'You are a code reviewer. Focus on code quality, best practices, and constructive feedback.'
  }
  return prompts[role] || `You are a ${role}. Help with tasks related to your role.`
}
