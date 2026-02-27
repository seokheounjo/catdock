import type { CliProvider, LocalLlmSource, RoleTemplate, PermissionMode } from './types'

// ── CLI 프로바이더 옵션 ──

export const CLI_PROVIDER_OPTIONS: {
  value: CliProvider
  label: string
  description: string
}[] = [
  { value: 'claude', label: 'Claude Code', description: 'Anthropic Claude Code CLI' },
  { value: 'gemini', label: 'Gemini CLI', description: 'Google Gemini CLI' },
  { value: 'aider', label: 'Aider', description: 'AI pair programming (aider)' },
  { value: 'codex', label: 'OpenAI Codex CLI', description: 'OpenAI Codex CLI' },
  { value: 'q', label: 'Amazon Q', description: 'Amazon Q Developer CLI' }
]

export type ModelTier = 'premium' | 'standard' | 'fast' | 'local'

export const PROVIDER_MODEL_OPTIONS: Record<
  CliProvider,
  { value: string; label: string; tier: ModelTier }[]
> = {
  claude: [
    { value: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'premium' },
    { value: 'claude-opus-4-20250514', label: 'Opus 4', tier: 'premium' },
    { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', tier: 'standard' },
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', tier: 'fast' }
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'premium' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'standard' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'fast' }
  ],
  aider: [
    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4', tier: 'standard' },
    { value: 'gpt-4o', label: 'GPT-4o', tier: 'premium' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat', tier: 'fast' }
  ],
  codex: [
    { value: 'o4-mini', label: 'o4-mini', tier: 'standard' },
    { value: 'o3', label: 'o3', tier: 'premium' }
  ],
  q: [{ value: 'default', label: 'Default', tier: 'standard' }]
}

// ── 로컬 LLM 소스 ──

export const LOCAL_LLM_SOURCES: { source: LocalLlmSource; label: string; defaultPort: number }[] = [
  { source: 'ollama', label: 'Ollama', defaultPort: 11434 },
  { source: 'lmstudio', label: 'LM Studio', defaultPort: 1234 },
  { source: 'openai-compatible', label: 'OpenAI Compatible', defaultPort: 8080 }
]

// ── 모델 옵션 (Claude 전용 — 하위호환) ──

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
  {
    value: 'bypassPermissions' as const,
    label: 'Bypass Permissions',
    description: '모든 권한 검사 우회'
  }
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
  'maine-coon',
  'scottish-fold',
  'russian-blue',
  'bengal',
  'siamese',
  'british-shorthair'
] as const

// ── 프론트엔드 디자인 가이드 (역할 템플릿용) ──

const FRONTEND_DESIGN_GUIDE = `

## Frontend Design Guide

Goal: Build pages that look like they were designed by a professional designer. Avoid AI-generated aesthetic.

### Design Principles
1. Extreme typography contrast — Headings 48-72px bold, body 16-18px light. Max 2-3 sizes per screen.
2. Minimal color — Dark/monochrome base + 1 accent color only. NO purple-blue gradients, NO neon glow.
3. Generous whitespace — 120-200px between sections. Don't fear empty space.
4. Asymmetric layouts — Avoid 50:50 splits. Use 60:40, 70:30 variations.
5. No meaningless decoration — No grid backgrounds, particles, orbs, or floating shapes without purpose.
6. Real content first — Use actual app screenshots, code examples, product mockups. No abstract illustration spam.
7. Restrained micro-interactions — Scroll animations on 1-2 key sections only.

### Free Component Libraries (copy-paste)
- Magic UI (magicui.design): 150+ animated components. Bento Grid, Safari mockup, Animated Beam, Shimmer Button, Number Ticker, Marquee, Hero Video Dialog. Install: npx shadcn@latest add "https://magicui.design/r/{component}"
- Aceternity UI (ui.aceternity.com): 200+ components. Hero Parallax, 3D Card, Lamp Effect, Macbook Scroll. Section blocks: Hero, Pricing, Testimonials, Feature, CTA, Navbar, Footer.
- shadcn/ui (ui.shadcn.com): Base components (Button, Card, Dialog, Table, Tabs, Toast).
- HyperUI (hyperui.dev): Tailwind marketing components (CTA, banners, blog cards, contact forms).

### Fonts
- Korean: Pretendard (CDN free)
- English: Geist (Vercel free) or Inter (Google Fonts)

### Icons: Lucide (lucide.dev)
### Illustrations: unDraw (undraw.co), Storyset (storyset.com)

### Landing Page Structure (recommended)
1. Hero — One-line headline + subtext + CTA + app screenshot/mockup
2. Logo cloud — Supported technologies/providers
3. Key features — Bento Grid or Feature Cards (3-4)
4. Detailed features — Screenshot + text alternating (asymmetric)
5. Usage flow — Timeline or Animated Beam
6. Social proof — Testimonials or Stats
7. CTA — Final call to action + download/start button
8. Footer

### Design References (for layout/structure)
- Linear.app, Raycast.com, Cursor.com, Warp.dev
`

// ── 역할 템플릿 (빌트인) ──


export const BUILTIN_ROLE_TEMPLATES: RoleTemplate[] = [
  // 일반 멤버 10종
  {
    id: 'builtin-frontend-dev',
    name: 'Frontend Developer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a senior frontend developer. Focus on React, TypeScript, CSS, and UI/UX best practices. When building UI pages, always follow the design guide below to produce professional, designer-quality output.' + FRONTEND_DESIGN_GUIDE,
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-backend-dev',
    name: 'Backend Developer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a senior backend developer. Focus on API design, database optimization, and server architecture.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-devops',
    name: 'DevOps Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a DevOps engineer. Focus on CI/CD, infrastructure, Docker, and deployment strategies.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-qa',
    name: 'QA Tester',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a QA engineer. Focus on testing strategies, bug identification, and quality assurance.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-designer',
    name: 'Designer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a UI/UX designer. Focus on design systems, user experience, and visual consistency. When designing or reviewing UI, always follow the design guide below to ensure professional quality.' + FRONTEND_DESIGN_GUIDE,
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-pm',
    name: 'Product Manager',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a product manager. Focus on requirements, user stories, and feature prioritization.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-code-reviewer',
    name: 'Code Reviewer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a code reviewer. Focus on code quality, best practices, and constructive feedback.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-data-engineer',
    name: 'Data Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a data engineer. Focus on data pipelines, ETL processes, data modeling, and analytics infrastructure.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'acceptEdits' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-security-engineer',
    name: 'Security Engineer',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a security engineer. Focus on vulnerability assessment, secure coding practices, and security architecture.',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultPermissionMode: 'plan' as PermissionMode,
    defaultMaxTurns: 25
  },
  {
    id: 'builtin-tech-lead-member',
    name: 'Tech Lead (Member)',
    isBuiltin: true,
    isLeaderTemplate: false,
    systemPrompt:
      'You are a tech lead. Focus on architecture decisions, code review, and team coordination.',
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
    systemPrompt:
      'You are a director overseeing multiple teams. Coordinate team leads, set cross-team strategy, and ensure alignment across all teams. Delegate to your team leads and synthesize results.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-vp-engineering',
    name: 'VP of Engineering',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt:
      'You are the VP of Engineering. Set engineering strategy, coordinate multiple tech leads, and ensure technical excellence across all teams. Delegate strategically to maximize team output.',
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
    systemPrompt:
      'You are a tech lead with team management authority. Coordinate your team, delegate tasks, review code, and make architecture decisions. You can assign work to subordinates and track their progress. When the team works on frontend/UI tasks, ensure they follow the design guide below.' + FRONTEND_DESIGN_GUIDE,
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-engineering-manager',
    name: 'Engineering Manager',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt:
      'You are an engineering manager. Lead your engineering team, set technical direction, manage project timelines, and ensure delivery quality. Delegate tasks strategically and review team output.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  },
  {
    id: 'builtin-cto',
    name: 'CTO',
    isBuiltin: true,
    isLeaderTemplate: true,
    systemPrompt:
      'You are the CTO. Set the overall technical vision and strategy. Make high-level architecture decisions, evaluate technology choices, and coordinate across all engineering teams.',
    defaultModel: 'claude-opus-4-6',
    defaultPermissionMode: 'bypassPermissions' as PermissionMode,
    defaultMaxTurns: 50
  }
]
