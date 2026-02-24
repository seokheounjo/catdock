export const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'premium' as const },
  { value: 'claude-opus-4-20250514', label: 'Opus 4', tier: 'premium' as const },
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', tier: 'standard' as const },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', tier: 'fast' as const }
]

export const PERMISSION_MODES = [
  { value: 'default' as const, label: 'Interactive', description: '도구 사용 시 Yes/No 프롬프트' },
  { value: 'allowAll' as const, label: 'Allow All', description: '모든 도구 사용 허용' },
  { value: 'acceptEdits' as const, label: 'Accept Edits', description: '파일 수정 시 확인' },
  { value: 'plan' as const, label: 'Plan Only', description: '계획만 수립, 실행 안함' },
  { value: 'bypassPermissions' as const, label: 'Bypass Permissions', description: '모든 권한 검사 우회' }
]

export const ROLE_PRESETS = [
  'Director',
  'Frontend Developer',
  'Backend Developer',
  'DevOps Engineer',
  'QA Tester',
  'Tech Lead',
  'Designer',
  'Product Manager',
  'Code Reviewer',
  'Data Engineer',
  'Security Engineer'
]

export const DEFAULT_MAX_TURNS = 25
export const DEFAULT_PERMISSION_MODE = 'acceptEdits'
export const MAX_PROMPT_LENGTH = 24000
export const MAX_ERROR_LOG_LINES = 100
export const MAX_ACTIVITIES = 500
export const MAX_MEMORY_MESSAGES = 200

export const CAT_BREEDS_LIST = [
  'maine-coon', 'scottish-fold', 'russian-blue', 'bengal', 'siamese', 'british-shorthair'
] as const

// ── 역할 템플릿 (빌트인) ──

import type { RoleTemplate, PermissionMode } from './types'

export const BUILTIN_ROLE_TEMPLATES: RoleTemplate[] = [
  // 일반 멤버 10종
  {
    id: 'builtin-frontend-dev',
    name: 'Frontend Developer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a senior frontend developer. Focus on React, TypeScript, CSS, and UI/UX best practices.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-backend-dev',
    name: 'Backend Developer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a senior backend developer. Focus on API design, database optimization, and server architecture.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-devops',
    name: 'DevOps Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a DevOps engineer. Focus on CI/CD, infrastructure, Docker, and deployment strategies.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-qa',
    name: 'QA Tester',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a QA engineer. Focus on testing strategies, bug identification, and quality assurance.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-designer',
    name: 'Designer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a UI/UX designer. Focus on design systems, user experience, and visual consistency.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-pm',
    name: 'Product Manager',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a product manager. Focus on requirements, user stories, and feature prioritization.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-code-reviewer',
    name: 'Code Reviewer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a code reviewer. Focus on code quality, best practices, and constructive feedback.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-data-engineer',
    name: 'Data Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a data engineer. Focus on data pipelines, ETL processes, data modeling, and analytics infrastructure.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-security-engineer',
    name: 'Security Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a security engineer. Focus on vulnerability assessment, secure coding practices, and security architecture.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-tech-lead-member',
    name: 'Tech Lead (Member)',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt: 'You are a tech lead. Focus on architecture decisions, code review, and team coordination.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 30
  },
  // 디렉터 전용 2종
  {
    id: 'builtin-director',
    name: 'Director (총괄)',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt: 'You are a director overseeing multiple teams. Coordinate team leads, set cross-team strategy, and ensure alignment across all teams. Delegate to your team leads and synthesize results.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-vp-engineering',
    name: 'VP of Engineering',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt: 'You are the VP of Engineering. Set engineering strategy, coordinate multiple tech leads, and ensure technical excellence across all teams. Delegate strategically to maximize team output.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  // 리더 전용 3종
  {
    id: 'builtin-tech-lead-leader',
    name: 'Tech Lead (Leader)',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt: 'You are a tech lead with team management authority. Coordinate your team, delegate tasks, review code, and make architecture decisions. You can assign work to subordinates and track their progress.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-engineering-manager',
    name: 'Engineering Manager',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt: 'You are an engineering manager. Lead your engineering team, set technical direction, manage project timelines, and ensure delivery quality. Delegate tasks strategically and review team output.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-cto',
    name: 'CTO',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt: 'You are the CTO. Set the overall technical vision and strategy. Make high-level architecture decisions, evaluate technology choices, and coordinate across all engineering teams.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  }
]
