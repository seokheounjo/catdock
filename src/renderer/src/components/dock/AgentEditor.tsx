import { useState, useMemo, useEffect } from 'react'
import { useAgentStore } from '../../stores/agent-store'
import { generateAvatar, getRandomSeed, AVATAR_STYLES } from '../../utils/avatar'
import { AgentConfig } from '../../../../shared/types'

interface AgentEditorProps {
  onClose: () => void
  editAgentId?: string
}

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-opus-4-20250514', label: 'Opus 4' }
]

const ROLE_PRESETS = [
  'Frontend Developer',
  'Backend Developer',
  'DevOps Engineer',
  'QA Tester',
  'Tech Lead',
  'Designer',
  'Product Manager',
  'Code Reviewer'
]

export function AgentEditor({ onClose, editAgentId }: AgentEditorProps) {
  const { createAgent, updateAgent } = useAgentStore()
  const [editAgent, setEditAgent] = useState<AgentConfig | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState(ROLE_PRESETS[0])
  const [avatarStyle, setAvatarStyle] = useState('bottts')
  const [avatarSeed, setAvatarSeed] = useState(getRandomSeed())
  const [systemPrompt, setSystemPrompt] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-20250514')
  const [group, setGroup] = useState('')

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
          setModel(c.model)
          setGroup(c.group || '')
        }
      })
    }
  }, [editAgentId])

  const avatarUri = useMemo(
    () => generateAvatar(avatarStyle, avatarSeed),
    [avatarStyle, avatarSeed]
  )

  const handleSelectDir = async () => {
    const dir = await window.api.window.selectDirectory()
    if (dir) setWorkingDirectory(dir)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return

    const config = {
      name: name.trim(),
      role,
      avatar: { style: avatarStyle, seed: avatarSeed },
      systemPrompt: systemPrompt || getDefaultPrompt(role),
      workingDirectory,
      model: model as 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514' | 'claude-haiku-4-5-20251001',
      group: group || undefined
    }

    if (editAgent) {
      await updateAgent(editAgent.id, config)
    } else {
      await createAgent(config)
    }
    onClose()
  }

  return (
    <div className="p-6">
      {/* 타이틀 바 (드래그 영역) */}
      <div
        className="flex items-center justify-between mb-5"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <h2 className="text-lg font-semibold text-white">
          {editAgent ? 'Edit Agent' : 'New Agent'}
        </h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md hover:bg-white/10 text-white/40 hover:text-white/80 flex items-center justify-center cursor-pointer bg-transparent border-none text-sm"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ✕
        </button>
      </div>

      {/* 아바타 미리보기 & 컨트롤 */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 border border-white/20 shrink-0">
          <img src={avatarUri} alt="avatar" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s}
                className={`px-2.5 py-1 rounded text-xs border cursor-pointer transition-all ${
                  avatarStyle === s
                    ? 'bg-accent text-white border-accent'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
                onClick={() => setAvatarStyle(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            className="text-xs text-accent hover:text-accent-hover cursor-pointer bg-transparent border-none text-left w-fit"
            onClick={() => setAvatarSeed(getRandomSeed())}
          >
            🎲 Randomize
          </button>
        </div>
      </div>

      {/* Name */}
      <label className="block mb-3">
        <span className="text-xs text-white/50 mb-1 block">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          autoFocus
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent transition-colors"
        />
      </label>

      {/* Role */}
      <label className="block mb-3">
        <span className="text-xs text-white/50 mb-1 block">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent appearance-none cursor-pointer"
        >
          {ROLE_PRESETS.map((r) => (
            <option key={r} value={r} className="bg-[#1e1e30]">
              {r}
            </option>
          ))}
        </select>
      </label>

      {/* Model */}
      <label className="block mb-3">
        <span className="text-xs text-white/50 mb-1 block">Model</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent appearance-none cursor-pointer"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value} className="bg-[#1e1e30]">
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {/* Working Directory */}
      <label className="block mb-3">
        <span className="text-xs text-white/50 mb-1 block">Working Directory</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder="Select a project folder..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
          />
          <button
            onClick={handleSelectDir}
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:bg-white/10 hover:text-white cursor-pointer text-sm transition-colors"
          >
            Browse
          </button>
        </div>
      </label>

      {/* Group */}
      <label className="block mb-3">
        <span className="text-xs text-white/50 mb-1 block">Group (optional)</span>
        <input
          type="text"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="e.g. Project Alpha"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent"
        />
      </label>

      {/* System Prompt */}
      <label className="block mb-5">
        <span className="text-xs text-white/50 mb-1 block">System Prompt</span>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={getDefaultPrompt(role)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-accent resize-none"
        />
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 cursor-pointer border border-white/10 text-sm transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white cursor-pointer border-none text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {editAgent ? 'Save' : 'Create'}
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
    'Tech Lead':
      'You are a tech lead. Focus on architecture decisions, code review, and team coordination.',
    'Designer':
      'You are a UI/UX designer. Focus on design systems, user experience, and visual consistency.',
    'Product Manager':
      'You are a product manager. Focus on requirements, user stories, and feature prioritization.',
    'Code Reviewer':
      'You are a code reviewer. Focus on code quality, best practices, and constructive feedback.'
  }
  return prompts[role] || `You are a ${role}. Help with tasks related to your role.`
}
