# ARCHITECTURE.md — Virtual Company v1.6.0 종합 문서

> **이 문서만으로 프로그램을 처음부터 다시 만들 수 있도록** 작성된 종합 아키텍처 문서입니다.
> 모든 타입, 프롬프트, IPC 채널, 컴포넌트는 실제 코드에서 직접 발췌하였습니다.

---

## 목차

### Part I — 현재 시스템 (v1.6.0)
1. [프로젝트 개요](#1-프로젝트-개요)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [공유 타입 (shared/types.ts)](#3-공유-타입)
4. [Main Process 서비스](#4-main-process-서비스)
5. [IPC 채널 맵](#5-ipc-채널-맵)
6. [Preload Bridge](#6-preload-bridge)
7. [Renderer 페이지 (9개)](#7-renderer-페이지)
8. [Renderer 컴포넌트 (37+개)](#8-renderer-컴포넌트)
9. [Zustand 스토어 (8개)](#9-zustand-스토어)
10. [커스텀 훅 (5개)](#10-커스텀-훅)
11. [위임(Delegation) 시스템 상세](#11-위임-시스템-상세)
12. [데이터 저장 구조](#12-데이터-저장-구조)
13. [윈도우 관리](#13-윈도우-관리)

### Part II — 향후 시스템 (Structured Handoff Protocol)
14. [Structured Handoff Protocol 개요](#14-structured-handoff-protocol-개요)
15. [새 타입 정의](#15-새-타입-정의)
16. [구현 계획](#16-구현-계획)
17. [마이그레이션 가이드](#17-마이그레이션-가이드)

---

# Part I — 현재 시스템 (v1.6.0)

---

## 1. 프로젝트 개요

### 목적

**Virtual Company (CatDock)**는 AI 에이전트들이 가상 회사의 팀원으로 동작하는 시뮬레이터이다.
각 에이전트는 독립적인 CLI 프로세스(Claude, Gemini, Aider, Codex, Amazon Q)로 실행되며,
계층적 조직 구조(Director → Leader → Member)를 통해 자동으로 작업을 위임하고, 실제 코드를 읽고 수정한다.

### 기술 스택

| 레이어 | 기술 | 버전 |
|--------|------|------|
| Runtime | Electron | 39.2.6 |
| Frontend | React + Tailwind CSS + Zustand | 19.2.1 / 4.2.0 / 5.0.11 |
| Backend | Node.js (Main process) | — |
| AI CLI | Claude Code, Gemini CLI, Aider, Codex, Amazon Q | Multi-provider |
| Build | electron-vite + TypeScript | 5.0.0 / 5.9.3 |
| Storage | 로컬 JSON 파일 | 프로젝트별 격리 |
| Avatars | DiceBear | 9.3.1 |
| Markdown | react-markdown + remark-gfm | 10.1.0 / 4.0.1 |

### 빌드/실행 명령어

```bash
# 설치
git clone https://github.com/seokheounjo/catdock.git
cd catdock
pnpm install

# 개발
pnpm dev            # electron-vite dev (HMR)

# 타입 체크 (3개 tsconfig)
pnpm typecheck      # node + web 동시 체크

# 린트/포맷
pnpm lint           # ESLint
pnpm format         # Prettier

# 프로덕션 빌드
pnpm build          # typecheck → electron-vite build

# 패키징
pnpm build:win      # Windows .exe
pnpm build:mac      # macOS .dmg
pnpm build:linux    # Linux .AppImage
```

---

## 2. 디렉토리 구조

```
catdock/
├── src/
│   ├── main/                                # Electron Main Process
│   │   ├── index.ts                         # 앱 진입점 — 라이프사이클, 트레이, 초기화
│   │   ├── window-manager.ts                # 9종 윈도우 생성/위치/크기 관리
│   │   ├── ipc/
│   │   │   └── handlers.ts                  # 100+ IPC 채널 핸들러 등록
│   │   └── services/
│   │       ├── store.ts                     # 영속 저장소 — 프로젝트별 config.json
│   │       ├── agent-manager.ts             # 에이전트 CRUD + 런타임 상태 관리
│   │       ├── session-manager.ts           # CLI 스폰, 스트림 파싱, 멀티턴 대화
│   │       ├── delegation-manager.ts        # [DELEGATE:] 블록 파싱, 위임 실행
│   │       ├── settings-manager.ts          # 글로벌 설정 + 프로젝트 전환
│   │       ├── default-agents.ts            # Director/Member 시딩, 동적 프롬프트
│   │       ├── conversation-manager.ts      # 그룹 채팅 라운드 로빈 진행
│   │       ├── mcp-manager.ts               # MCP 서버 설정 파일 빌드
│   │       ├── mcp-health.ts                # MCP 서버 헬스 체크
│   │       ├── mcp-discovery.ts             # MCP 서버 자동 검색
│   │       ├── llm-discovery.ts             # 로컬 LLM 자동 감지 (Ollama/LM Studio)
│   │       ├── cli-builder.ts               # CLI 인수/환경변수 빌드 유틸리티
│   │       ├── cli-profile-manager.ts       # 다중 계정 프로필 관리
│   │       ├── stream-parser.ts             # JSON 스트림 파싱 (stream-json)
│   │       ├── activity-logger.ts           # 활동 이벤트 로깅
│   │       ├── task-manager.ts              # 작업 위임 추적
│   │       ├── dynamic-agent-manager.ts     # 임시 에이전트 라이프사이클
│   │       ├── error-recovery.ts            # 다단계 에러 에스컬레이션
│   │       ├── process-watchdog.ts          # 하트비트 모니터링 + 페일오버
│   │       ├── monitoring-loop.ts           # 백그라운드 모니터링 루프
│   │       ├── permission-server.ts         # 퍼미션 HTTP 서버
│   │       ├── permission-mcp-server.cjs    # MCP 퍼미션 서버 (CommonJS)
│   │       └── cli-adapters/                # 멀티 CLI 어댑터
│   │           ├── cli-adapter.ts           # 베이스 인터페이스 정의
│   │           ├── adapter-registry.ts      # 싱글턴 캐시 레지스트리
│   │           ├── claude-adapter.ts        # Claude Code CLI 어댑터
│   │           ├── gemini-adapter.ts        # Gemini CLI 어댑터
│   │           ├── aider-adapter.ts         # Aider CLI 어댑터
│   │           ├── codex-adapter.ts         # OpenAI Codex CLI 어댑터
│   │           ├── q-adapter.ts             # Amazon Q CLI 어댑터
│   │           └── index.ts                 # re-export
│   ├── preload/
│   │   ├── index.ts                         # contextBridge API 노출 (15개 네임스페이스)
│   │   └── index.d.ts                       # 타입 정의
│   ├── renderer/
│   │   ├── index.html                       # 엔트리 HTML
│   │   └── src/
│   │       ├── App.tsx                      # Hash 라우터 (9개 라우트)
│   │       ├── main.tsx                     # React 엔트리 포인트
│   │       ├── pages/                       # 9개 페이지 컴포넌트
│   │       │   ├── DockPage.tsx
│   │       │   ├── ChatPage.tsx
│   │       │   ├── EditorPage.tsx
│   │       │   ├── GroupChatPage.tsx
│   │       │   ├── NewConversationPage.tsx
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── CommandCenterPage.tsx
│   │       │   ├── SettingsPage.tsx
│   │       │   └── SetupPage.tsx
│   │       ├── components/
│   │       │   ├── chat/                    # 채팅 UI (9개)
│   │       │   ├── dock/                    # 독 UI (4개)
│   │       │   ├── group-chat/              # 그룹 채팅 UI (8개)
│   │       │   ├── dashboard/               # 대시보드 UI (10개)
│   │       │   ├── command-center/          # 커맨드 센터 UI (3개)
│   │       │   └── theme/                   # 테마 토글 (1개)
│   │       ├── stores/                      # Zustand 스토어 (8개)
│   │       ├── hooks/                       # 커스텀 훅 (5개)
│   │       ├── contexts/
│   │       │   └── ThemeContext.tsx          # 테마 Context Provider
│   │       └── utils/
│   │           ├── avatar.ts                # DiceBear 아바타 생성
│   │           ├── cat-avatar.ts            # 고양이 품종 아바타
│   │           ├── i18n.ts                  # 번역 로더
│   │           └── locales/                 # ko, en, ja, zh 번역 파일
│   └── shared/
│       ├── types.ts                         # 50+ 공유 인터페이스/타입
│       └── constants.ts                     # 15개 역할 템플릿, 모델 옵션, 상수
├── build/                                   # 빌드 에셋 (아이콘)
├── resources/                               # 앱 리소스 (고양이 이미지)
├── CLAUDE.md                                # 프론트엔드 디자인 가이드 + 코딩 컨벤션
├── package.json                             # v1.6.0
├── electron.vite.config.ts                  # electron-vite 설정
├── electron-builder.yml                     # 패키징 설정
├── tailwind.config.ts                       # Tailwind CSS 설정
├── tsconfig.json                            # TypeScript root config
├── tsconfig.node.json                       # Main/Preload TS config
└── tsconfig.web.json                        # Renderer TS config
```

**통계**: ~90 소스 파일, ~16,400 LOC

---

## 3. 공유 타입

> 소스: `src/shared/types.ts` — 전체 정의를 원문 그대로 수록

### 3.1 CLI & 스트림

```typescript
export type CliProvider = 'claude' | 'gemini' | 'aider' | 'codex' | 'q'

export type UnifiedStreamEventType =
  | 'init' | 'text' | 'tool-use' | 'tool-result' | 'cost' | 'result' | 'error'

export interface UnifiedStreamEvent {
  type: UnifiedStreamEventType
  sessionId?: string
  text?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  totalCostUsd?: number
  resultText?: string
  errorMessage?: string
}

export interface CliCheckResult {
  installed: boolean
  version: string | null
  path: string | null
  error: string | null
  provider?: CliProvider
}
```

### 3.2 에이전트 계층

```typescript
export type AgentRole = 'director' | 'leader' | 'member' | 'temporary'

export interface AgentHierarchy {
  role: AgentRole
  reportsTo?: string          // 상위 에이전트 ID
  subordinates?: string[]     // 하위 에이전트 ID 배열
  leaderTeamName?: string     // 팀 이름 (리더용)
}
```

### 3.3 퍼미션

```typescript
export type PermissionMode = 'default' | 'allowAll' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface PermissionRequest {
  id: string
  agentId: string
  agentName: string
  toolName: string
  toolInput: Record<string, unknown>
  timestamp: number
}
```

### 3.4 에이전트 설정 (AgentConfig) — 핵심 인터페이스

```typescript
export interface AgentConfig {
  id: string
  name: string
  role: string
  avatar: { style: string; seed: string }
  systemPrompt: string
  workingDirectory: string
  model: string
  cliProvider?: CliProvider
  group?: string
  createdAt: number
  updatedAt: number
  hierarchy?: AgentHierarchy
  permissionMode?: PermissionMode
  maxTurns?: number
  mcpConfig?: McpServerConfig[]
  teamMcpConfig?: McpServerConfig[]   // 리더 설정 → 팀 전체 적용
  cliProfileId?: string
  cliFlags?: {
    verbose?: boolean
    debug?: boolean
    worktree?: boolean
    jsonSchema?: string
    continue?: boolean
    additionalArgs?: string[]
  }
  isTemporary?: boolean
  createdBy?: string
  expiresAt?: number
}
```

### 3.5 런타임 상태

```typescript
export type AgentStatus = 'idle' | 'working' | 'error'
export type ProcessStatus = 'stopped' | 'starting' | 'running' | 'terminating' | 'crashed'

export interface AgentState {
  config: AgentConfig
  status: AgentStatus
  lastMessage?: string
  sessionId?: string
  costTotal: number
  processInfo?: AgentProcessInfo
  currentTask?: string
}

export interface AgentProcessInfo {
  processStatus: ProcessStatus
  modelInUse: string
  pid?: number
  startedAt?: number
  lastError?: string
}

export interface AgentGroup {
  name: string
  directory: string
  agentIds: string[]
}
```

### 3.6 채팅 & 세션

```typescript
export interface ChatMessage {
  id: string
  agentId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolUse?: ToolUseBlock[]
  costDelta?: number
  isAutoReport?: boolean
  reportOriginAgentId?: string
}

export interface ToolUseBlock {
  name: string
  input: string
  output?: string
}

export interface SessionInfo {
  sessionId: string
  agentId: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}
```

### 3.7 MCP (Model Context Protocol)

```typescript
export interface McpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled: boolean
}

export type McpServerSource = 'manual' | 'discovered-project' | 'discovered-home'

export interface DiscoveredMcpServer extends McpServerConfig {
  source: McpServerSource
  sourcePath: string
  discoveredAt: number
}

export interface McpDiscoveryResult {
  servers: DiscoveredMcpServer[]
  scannedPaths: string[]
  scannedAt: number
}

export type McpHealthStatus = 'connected' | 'disconnected' | 'checking' | 'not-found'

export interface McpHealthResult {
  name: string
  status: McpHealthStatus
  error?: string
  checkedAt: number
  agentId: string
}
```

### 3.8 로컬 LLM 자동 감지

```typescript
export type LocalLlmSource = 'ollama' | 'lmstudio' | 'openai-compatible'

export interface DiscoveredLocalModel {
  id: string                    // 'ollama/qwen3:32b'
  name: string                  // 'Qwen3 32B'
  source: LocalLlmSource
  modelId: string               // raw: 'qwen3:32b'
  size?: string                 // '19GB'
  parameterCount?: string       // '32B'
  baseUrl?: string              // 'http://localhost:1234/v1'
  isRunning: boolean
  discoveredAt: number
}

export interface LlmDiscoveryResult {
  models: DiscoveredLocalModel[]
  sources: { source: LocalLlmSource; available: boolean; version?: string; error?: string }[]
  scannedAt: number
}
```

### 3.9 CLI 프로필 (다중 계정)

```typescript
export interface CliProfile {
  id: string
  name: string                  // 'Claude 계정 1'
  provider: CliProvider
  configDir?: string            // CLAUDE_CONFIG_DIR
  envOverrides?: Record<string, string>
  isDefault: boolean
  createdAt: number
}
```

### 3.10 활동 & 작업 위임

```typescript
export type ActivityType =
  | 'message' | 'tool-use' | 'error' | 'status-change'
  | 'agent-created' | 'agent-deleted' | 'task-delegated'
  | 'upward-report' | 'chain-report' | 'mcp-configured'

export interface ActivityEvent {
  id: string
  type: ActivityType
  agentId: string
  agentName: string
  description: string
  timestamp: number
  metadata?: Record<string, unknown>
}

export type TaskStatus = 'pending' | 'assigned' | 'in-progress' | 'completed' | 'failed' | 'cancelled'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface TaskDelegation {
  id: string
  title: string
  description: string
  fromAgentId: string
  toAgentId: string
  status: TaskStatus
  createdAt: number
  completedAt?: number
  result?: string
  priority?: TaskPriority
  dueDate?: number
  tags?: string[]
  isManual?: boolean
}
```

### 3.11 역할 템플릿

```typescript
export interface RoleTemplate {
  id: string
  name: string
  isBuiltin: boolean
  isLeaderTemplate: boolean
  systemPrompt: string
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultMaxTurns: number
}
```

### 3.12 글로벌 설정

```typescript
export type DockSize = 'small' | 'medium' | 'large'

export interface GlobalSettings {
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultMaxTurns: number
  defaultWorkingDirectory: string
  globalMcpServers: McpServerConfig[]
  agentSpawnLimit: number
  theme?: ThemeSettings
  dockSize?: DockSize
  setupCompleted?: boolean
  companyRules?: string
  roleTemplates?: RoleTemplate[]
  language?: 'ko' | 'en' | 'ja' | 'zh'
  agentLanguage?: 'ko' | 'en' | 'ja' | 'zh'
  defaultCliProvider?: CliProvider
  cliProfiles?: CliProfile[]
  discoveredLocalModels?: DiscoveredLocalModel[]
}
```

### 3.13 그룹 대화

```typescript
export type ConversationMode = 'auto-chain' | 'manual'
export type ConversationStatus = 'idle' | 'chaining' | 'paused' | 'waiting-agent'

export interface ConversationConfig {
  id: string
  name: string
  participantIds: string[]
  mode: ConversationMode
  maxRoundsPerChain: number
  createdAt: number
  updatedAt: number
}

export interface ConversationMessage {
  id: string
  conversationId: string
  senderType: 'user' | 'agent' | 'system'
  agentId: string | null
  agentName: string | null
  content: string
  timestamp: number
  costDelta?: number
}
```

### 3.14 에러 복구 & 테마

```typescript
export type ErrorRecoveryStatus = 'detected' | 'leader-notified' | 'recovering' | 'resolved' | 'failed'

export interface ErrorRecoveryEvent {
  id: string
  agentId: string
  agentName: string
  leaderId: string
  leaderName: string
  error: string
  status: ErrorRecoveryStatus
  startedAt: number
  resolvedAt?: number
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeSettings {
  mode: ThemeMode
  systemPreference?: 'light' | 'dark'
}
```

### 타입 관계도

```
GlobalSettings
 ├── McpServerConfig[]         (globalMcpServers)
 ├── RoleTemplate[]            (roleTemplates)
 ├── CliProfile[]              (cliProfiles)
 ├── DiscoveredLocalModel[]    (discoveredLocalModels)
 └── ThemeSettings

AgentConfig
 ├── AgentHierarchy            (hierarchy)
 │    └── AgentRole
 ├── McpServerConfig[]         (mcpConfig, teamMcpConfig)
 ├── CliProvider
 └── PermissionMode

AgentState
 ├── AgentConfig               (config)
 ├── AgentStatus
 └── AgentProcessInfo
      └── ProcessStatus

ChatMessage
 └── ToolUseBlock[]

SessionInfo
 └── ChatMessage[]

ConversationConfig → ConversationMessage[]

TaskDelegation
 ├── TaskStatus
 └── TaskPriority

ErrorRecoveryEvent
 └── ErrorRecoveryStatus
```

---

## 4. Main Process 서비스

### 4.1 store.ts — 영속 저장소

**역할**: 프로젝트별로 격리된 JSON 파일 기반 영속 저장소.

**핵심 메커니즘 — `hashPath()` 경로 정규화**:
```typescript
function hashPath(dir: string): string {
  // Windows 경로를 backslash로 정규화 후 SHA-256 해싱 (12자)
  const normalized = dir.replace(/\//g, '\\').toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12)
}
```

**저장 경로**: `%APPDATA%/virtual-company-data/projects/{hash}/config.json`

**주요 함수**:

| 카테고리 | 함수 | 설명 |
|----------|------|------|
| 프로젝트 | `setProjectRoot(dir)` | 현재 프로젝트 루트 설정 |
| 프로젝트 | `getProjectRoot()` | 현재 프로젝트 루트 반환 |
| 프로젝트 | `getProjectStoreDir()` | 프로젝트별 저장 디렉토리 |
| 에이전트 | `getAgents()` → `AgentConfig[]` | 전체 에이전트 조회 |
| 에이전트 | `addAgent(agent)` | 에이전트 추가 |
| 에이전트 | `updateAgent(id, updates)` | 에이전트 수정 |
| 에이전트 | `deleteAgent(id, archivedBy?)` | 삭제 (아카이브 보관) |
| 세션 | `getSessionHistory(agentId)` → `ChatMessage[]` | 대화 히스토리 |
| 세션 | `saveSessionHistory(agentId, messages)` | 히스토리 저장 |
| 세션 | `updateSessionId(agentId, sessionId)` | CLI 세션 ID 갱신 |
| 세션 | `clearSessionHistory(agentId)` | 히스토리 삭제 |
| 그룹 | `getConversationConfigs()` | 그룹 대화 목록 |
| 그룹 | `addConversationConfig(config)` | 그룹 대화 생성 |
| 그룹 | `getConversationHistory(id)` | 그룹 메시지 조회 |
| 설정 | `getSettings()` → `GlobalSettings` | 글로벌 설정 (프로젝트 무관) |
| 설정 | `updateSettings(updates)` | 설정 업데이트 |
| 활동 | `addActivity(event)` | 활동 추가 (최대 500건) |
| 활동 | `getRecentActivities(limit)` | 최근 활동 조회 |
| 작업 | `addTask(task)` | 위임 작업 추가 |
| 작업 | `getTasks()` | 전체 작업 조회 |
| 작업 | `updateTask(id, updates)` | 작업 상태 갱신 |
| 아카이브 | `getArchivedAgents()` | 삭제된 에이전트 아카이브 |
| MCP | `getDiscoveredMcpServers()` | 감지된 MCP 서버 목록 |
| 마이그 | `migrateIfNeeded()` | 레거시 config → 프로젝트별 마이그레이션 |

---

### 4.2 agent-manager.ts — 에이전트 CRUD + 런타임 상태

**역할**: 메모리 내 에이전트 런타임 상태(status, cost, processInfo)와 영속 저장소 간 동기화.

**핵심 상태 (in-memory)**:
```
Map<agentId, { status, costTotal, sessionId, lastMessage, processInfo, currentTask }>
```

**주요 함수**:

| 함수 | 설명 |
|------|------|
| `listAgents()` | 전체 에이전트 목록 |
| `createAgent(config)` | 생성 (UUID 자동 할당) |
| `updateAgent(id, updates)` | 설정 업데이트 |
| `deleteAgent(id, archivedBy?)` | 삭제 (아카이브 지원) |
| `duplicateAgent(id)` | 에이전트 복제 |
| `getAgentState(id)` → `AgentState` | config + 런타임 상태 통합 |
| `getAllStates()` → `AgentState[]` | 전체 상태 |
| `setAgentStatus(id, status)` | idle/working/error 전환 |
| `addAgentCost(id, cost)` | 누적 비용 추가 |
| `setProcessInfo(id, info)` | 프로세스 상태 갱신 |
| `getOrgChart()` | `{ directors, leaders, members, temporary }` |
| `canDelegate(agentId)` | director/leader만 true |
| `getSubordinates(leaderId)` | 하위 에이전트 목록 |
| `findLeaderForAgent(agentId)` | 그룹/계층 기반 리더 검색 |
| `findSuperiorForAgent(agentId)` | leader→director 체인 검색 |
| `exportAgentConfig(id)` | JSON export (id/timestamps 제외) |
| `importAgentConfig(json)` | JSON import (새 id 할당) |

---

### 4.3 session-manager.ts — CLI 스폰 + 스트림 파싱 + 멀티턴

**역할**: CLI 프로세스 생성, JSON 스트림 파싱, 멀티턴 대화 유지, 비용 추적, 위임 연동.

**ActiveSession 구조**:
```typescript
interface ActiveSession {
  agentId: string
  process: ChildProcess | null
  abortController: AbortController
  messages: ChatMessage[]
  configDir: string             // 에이전트별 독립 CLAUDE_CONFIG_DIR
  cliSessionId: string | null   // CLI 세션 재개용
}
```

**핵심 흐름**:

```
sendMessage(agentId, text)
  ├── isAgentBusy? → 메시지 큐에 추가
  ├── getSession(agentId) → ActiveSession (없으면 생성)
  ├── extractMode(message) → 'plan-first' | 'execute-now' | null
  ├── runCliSession(config, session, message)
  │    ├── adapter.buildArgs() → CLI 인수 배열
  │    ├── buildMcpConfigFile(agentId) → MCP 설정 파일 경로
  │    ├── adapter.spawnProcess() → ChildProcess
  │    ├── StreamParser로 stdout 파싱 → UnifiedStreamEvent
  │    │    ├── 'init' → 세션 ID 저장
  │    │    ├── 'text' → 브로드캐스트 stream-delta
  │    │    ├── 'tool-use' → 도구 사용 이벤트
  │    │    ├── 'cost' → 비용 누적
  │    │    └── 'result' → 최종 응답
  │    └── resume 실패 시 → 새 세션으로 폴백
  ├── 응답에 DELEGATE 있으면 → delegationManager.executeDelegation()
  ├── 응답에 MCP 블록 있으면 → executeMcpBlocks()
  └── sendUpwardReport() → 상위 에이전트에 자동 보고
```

**위임 상태 추적**:
- `delegatingAgents: Set<string>` — 현재 위임 중인 에이전트
- 10분 타임아웃으로 데드락 방지
- `flushStuckDelegations()` — 멈춘 위임 강제 해제

**상향 보고 체인**:
```
Member 응답 → sendUpwardReport() → Leader에 자동 메시지
Leader 응답 → sendChainReport() → Director에 자동 메시지
```

---

### 4.4 delegation-manager.ts — 위임 시스템

**역할**: `[DELEGATE:]` 블록 파싱, 동적 에이전트 생성, 위임 실행, 결과 수집, 종합 보고.

**블록 파싱**:

| 함수 | 파싱 대상 | 형식 |
|------|-----------|------|
| `parseDelegationBlocks(text)` | 위임 | `[DELEGATE:이름\|역할]작업[/DELEGATE]` |
| `parseMcpAddBlocks(text)` | MCP 추가 | `[MCP:ADD\|name\|cmd\|args\|cwd\|env]` |
| `parseMcpRemoveBlocks(text)` | MCP 삭제 | `[MCP:REMOVE\|name]` |
| `parseJsonMcpConfig(text)` | JSON MCP | `{ "mcpServers": {...} }` |
| `parseActionBlocks(text)` | 액션 | `[ACTION:TYPE\|label\|target]` |
| `parseRemoveBlocks(text)` | 에이전트 삭제 | `[REMOVE:이름]` |

**위임 실행 (`executeDelegation`)**:

```
executeDelegation(delegatorId, response, originalMessage)
  ├── Round 1~3 (MAX_DELEGATION_ROUNDS = 3)
  │    ├── parseDelegationBlocks(response) → DelegationBlock[]
  │    ├── for each block (max 2 concurrent: MAX_CONCURRENT_DELEGATIONS)
  │    │    ├── findOrCreateAgent(name, delegatorId, role)
  │    │    │    ├── 정확히 일치 → 기존 에이전트 재사용
  │    │    │    ├── startsWith 일치 → 기존 에이전트 재사용
  │    │    │    ├── MEMBER_DEFS에서 검색 → 사전 정의 사용
  │    │    │    └── 동적 생성 → generateDynamicLeaderPrompt() / generateDynamicMemberPrompt()
  │    │    ├── TaskDelegation 레코드 생성
  │    │    └── sendMessageAndCapture(agentId, task) → 결과 (3000자 제한)
  │    ├── 실패한 에이전트 → failedAgentIds에 추가 (재위임 방지)
  │    └── 결과 종합 → delegator에 synthesis 메시지 전송
  │         ├── 조직 현황 주입 (buildOrgContext)
  │         └── "위임 결과를 종합해서 보고하라" 프롬프트
  ├── 다음 라운드 응답에 DELEGATE 있으면 반복
  └── executeRemoveBlocks() → [REMOVE:이름] 처리
```

**동적 프롬프트 생성**:
- `generateDynamicLeaderPrompt(name, role)` — 역할별 조건부 섹션:
  - QA 역할: 실제 테스트 명령 실행 (pnpm typecheck/lint/build)
  - Security 역할: 보안 감사 항목
  - Config Management 역할: Git/버전관리
  - Recovery 역할: 에러 복구 절차
  - Frontend 역할: 디자인 스펙 검증 체크리스트
- `generateDynamicMemberPrompt(name, role)` — 팀원용 (코드 작성 필수, 분석만 금지)

---

### 4.5 settings-manager.ts — 글로벌 설정

**역할**: 프로젝트와 무관한 글로벌 설정 관리 + 프로젝트 전환 감지.

```typescript
getSettings() → GlobalSettings
updateSettings(updates: Partial<GlobalSettings>) → GlobalSettings
```

**프로젝트 전환 로직** (`updateSettings` 내부):
```
defaultWorkingDirectory 변경 감지
  → store.setProjectRoot(newDir)
  → seedDirectorIfEmpty() (새 프로젝트면 Director 시딩)
  → BrowserWindow.getAllWindows()에 'settings:changed' 브로드캐스트
```

---

### 4.6 default-agents.ts — Director/Member 시딩 + 프롬프트

**역할**: 초기 에이전트 시딩, 동적 프롬프트 생성, 프로젝트 루트 감지.

**사전 정의된 에이전트**:

| 이름 | 역할 | 모델 | 퍼미션 | maxTurns |
|------|------|------|--------|----------|
| Director | Director | sonnet 4 (설정 기본) | bypassPermissions | 1 |
| Alex | Frontend Developer | sonnet 4 | — | — |
| Sam | Backend Developer | sonnet 4 | — | — |
| Riley | DevOps Engineer | sonnet 4 | — | — |
| Casey | QA Tester | sonnet 4 | — | — |
| Morgan | Code Reviewer | sonnet 4 | — | — |

> Director는 항상 1명 체제. Leader/Member는 Director가 업무에 맞게 동적 생성한다.

**Director 시스템 프롬프트 (핵심 발췌)**:

```
너는 Virtual Company의 총괄(Director)이다. 전체 프로젝트의 최상위 의사결정자다.

## 절대 규칙 — 위반 시 실패!
- ❌ Read, Bash, Grep 등 도구로 파일을 직접 읽는 행위
- ❌ 코드를 직접 작성하거나 빌드를 직접 실행하는 행위
- ✅ 사용자 요청을 받으면 도구 사용 없이 바로 DELEGATE 블록을 작성한다
- ✅ 첫 응답에 반드시 [DELEGATE:이름|역할] 블록이 있어야 한다

## 팀 편성 원칙 (동적 팀 구성!)
- 기존 팀장 재사용 최우선!
- 표준 팀장: QA팀장, 보안팀장, 모니터링팀장, 문서화팀장
- 조건부 편성: 프론트엔드팀장, 백엔드팀장, DB팀장, UI/UX팀장 등

## QA 검증 프로세스 (필수!)
- 1라운드: 기능 테스트
- 2라운드: 통합 테스트
- 3라운드: 회귀 테스트
- QA팀은 반드시 pnpm typecheck, pnpm lint, pnpm build 실행!

## 위임 형식
[DELEGATE:이름|역할]
작업 지시
[/DELEGATE]

## 최종 보고 형식
- 완료 요약 + 변경 파일 목록 + 확인 방법 + ACTION 블록
```

**프로젝트 루트 감지 우선순위**:
1. `VIRTUAL_COMPANY_PROJECT` 환경변수
2. 저장된 `defaultWorkingDirectory` 설정
3. `process.cwd()`에 `package.json` 있으면 사용
4. `app.getAppPath()` 등 후보에서 검색
5. 폴백: `process.cwd()`

---

### 4.7 conversation-manager.ts — 그룹 채팅

**역할**: 다중 에이전트 대화방 관리, 라운드 로빈 진행.

**모드**:
- `auto-chain`: 참가자 순서대로 자동 진행 (maxRoundsPerChain 만큼)
- `manual`: 사용자가 에이전트를 직접 선택하여 트리거

**흐름**:
```
sendMessage(conversationId, text)
  → 참가자 목록에서 다음 에이전트 선택
  → sendMessageAndCapture(agentId, contextMessage)
  → ConversationMessage 저장
  → auto-chain이면 다음 에이전트로 자동 진행
```

---

### 4.8 mcp-manager.ts — MCP 서버 관리

**역할**: 에이전트별 MCP 설정 파일 빌드, 3단계 서버 병합.

**3단계 MCP 서버 병합**:
```
글로벌 (GlobalSettings.globalMcpServers)
  → 팀 (Leader의 teamMcpConfig → 팀원에게 상속)
    → 에이전트 개별 (AgentConfig.mcpConfig)
```
> 같은 이름의 서버는 하위 레벨이 오버라이드

**빌드 결과**: `${projectStoreDir}/mcp-configs/${agentId}.json`

**자동 주입**: `permissionMode === 'default'`이면 permission MCP 서버 자동 추가

---

### 4.9 cli-adapters/ — 멀티 CLI 어댑터 시스템

**아키텍처**: 어댑터 패턴 + 싱글턴 캐시

```typescript
// cli-adapter.ts — 베이스 인터페이스
interface CliAdapter {
  checkInstalled(): Promise<CliCheckResult>
  buildArgs(config, options): string[]
  spawnProcess(config, args, opts): ChildProcess
  parseStreamLine(line: string): UnifiedStreamEvent | null
  supportsMcp(): boolean
  supportsResume(): boolean
  supportsPermissionMode(): boolean
  getInstallCommand(): string
  getDisplayName(): string
}
```

**5개 어댑터**:

| 어댑터 | CLI 명령어 | 출력 형식 | MCP | Resume | Permission |
|--------|-----------|----------|-----|--------|------------|
| `claude-adapter.ts` | `claude` | stream-json | ✅ | ✅ | ✅ |
| `gemini-adapter.ts` | `gemini` | JSON | ❌ | ❌ | ❌ |
| `aider-adapter.ts` | `aider` | Plain text | ❌ | ❌ | ❌ |
| `codex-adapter.ts` | `codex` | JSON | ❌ | ❌ | ❌ |
| `q-adapter.ts` | `q` | Plain text | ❌ | ❌ | ❌ |

**Claude 어댑터 — CLI 호출 예시**:
```bash
claude -p --output-format stream-json --verbose --include-partial-messages \
  --model claude-sonnet-4-20250514 --max-turns 25 \
  --permission-mode acceptEdits \
  --system-prompt "Company Rules + Agent systemPrompt + Language" \
  --mcp-config /path/to/mcp.json \
  "user message"
```

**프로필 관리 (`cli-profile-manager.ts`)**:
- CRUD + 라운드 로빈 할당
- Claude는 `CLAUDE_CONFIG_DIR` 환경변수로 계정 격리
- `resolveProfileForAgent()` — 에이전트에 프로필 자동 할당

---

## 5. IPC 채널 맵

> 소스: `src/main/ipc/handlers.ts`

### Agent 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `agent:list` | `agentManager.listAgents()` | — | `AgentConfig[]` |
| `agent:create` | `agentManager.createAgent(config)` | `Omit<AgentConfig, 'id'\|'createdAt'\|'updatedAt'>` | `AgentConfig` |
| `agent:update` | `agentManager.updateAgent(id, updates)` | `id, Partial<AgentConfig>` | `AgentConfig` |
| `agent:delete` | `agentManager.deleteAgent(id)` | `id` | `void` |
| `agent:get-state` | `agentManager.getAgentState(id)` | `id` | `AgentState \| null` |
| `agent:get-all-states` | `agentManager.getAllStates()` | — | `AgentState[]` |
| `agent:get-org-chart` | `agentManager.getOrgChart()` | — | `{directors, leaders, members, temporary}` |
| `agent:get-process-info` | `agentManager.getProcessInfo(id)` | `id` | `AgentProcessInfo \| null` |
| `agent:duplicate` | `agentManager.duplicateAgent(id)` | `id` | `AgentConfig` |
| `agent:export` | `agentManager.exportAgentConfig(id)` | `id` | `string` |
| `agent:import` | `agentManager.importAgentConfig(json)` | `json` | `AgentConfig` |
| `agent:spawn-temporary` | `dynamicAgentManager.spawnTemporary(config)` | config | `AgentConfig` |
| `agent:remove-temporary` | `dynamicAgentManager.removeTemporary(id)` | `id` | `void` |

### Session 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `session:send` | `sessionManager.sendMessage(agentId, message)` | `agentId, message` | `void` |
| `session:abort` | `sessionManager.abortSession(agentId)` | `agentId` | `void` |
| `session:clear` | `sessionManager.clearSession(agentId)` | `agentId` | `void` |
| `session:get-history` | `sessionManager.getHistory(agentId)` | `agentId` | `ChatMessage[]` |
| `session:get-error-log` | `sessionManager.getErrorLog(agentId)` | `agentId` | `string[]` |

### CLI 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `cli:check` | `checkClaudeCli()` | — | `{installed, version, path, error}` |
| `cli:install` | `installClaudeCli()` | — | `{success, message}` |
| `cli:check-node` | `checkNodeInstalled()` | — | `{installed, version}` |
| `cli:check-provider` | `checkCliForProvider(provider)` | `CliProvider` | `CliCheckResult` |
| `cli:check-all-providers` | `checkAllProviders()` | — | `Record<CliProvider, CliCheckResult>` |
| `cli:check-update` | `checkForCliUpdate()` | — | `{current, latest, updateAvailable}` |

### Window 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `window:open-chat` | `createChatWindow(agentId)` | `agentId` | `void` |
| `window:open-editor` | `createEditorWindow(agentId?)` | `agentId?` | `void` |
| `window:close-editor` | `editorWindow.destroy()` | — | `void` |
| `window:open-dashboard` | `createDashboardWindow()` | — | `void` |
| `window:open-command-center` | `createCommandCenterWindow()` | — | `void` |
| `window:open-settings` | `createSettingsWindow()` | — | `void` |
| `window:open-group-chat` | `createGroupChatWindow(id)` | `conversationId` | `void` |
| `window:open-new-conversation` | `createConversationCreatorWindow()` | — | `void` |
| `window:minimize` | `win.minimize()` | — | `void` |
| `window:close` | `win.destroy()` (독 제외) | — | `void` |
| `window:select-directory` | `dialog.showOpenDialog()` | — | `string \| null` |
| `window:select-file` | `dialog.showOpenDialog()` | — | `string \| null` |

### Conversation (그룹 채팅) 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `conversation:create` | `createConversation(config)` | config | `ConversationConfig` |
| `conversation:list` | `listConversations()` | — | `ConversationConfig[]` |
| `conversation:get` | `getConversationConfig(id)` | `id` | `ConversationConfig` |
| `conversation:update` | `updateConversation(id, updates)` | `id, updates` | `ConversationConfig` |
| `conversation:delete` | `deleteConversation(id)` | `id` | `void` |
| `conversation:send` | `sendMessage(id, message)` | `id, message` | `void` |
| `conversation:trigger-agent` | `triggerAgent(id, agentId)` | `id, agentId` | `void` |
| `conversation:pause` | `pause(id)` | `id` | `void` |
| `conversation:resume` | `resume(id)` | `id` | `void` |
| `conversation:abort` | `abort(id)` | `id` | `void` |
| `conversation:clear` | `clear(id)` | `id` | `void` |
| `conversation:get-history` | `getHistory(id)` | `id` | `ConversationMessage[]` |
| `conversation:get-state` | `getState(id)` | `id` | state |
| `conversation:set-mode` | `setMode(id, mode)` | `id, mode` | `void` |

### Settings 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `settings:get` | `getSettings()` | — | `GlobalSettings` |
| `settings:update` | `updateSettings(updates)` | `Partial<GlobalSettings>` | `GlobalSettings` |
| `settings:get-role-templates` | builtin + custom | — | `RoleTemplate[]` |
| `settings:save-role-template` | update template | `RoleTemplate` | `RoleTemplate` |
| `settings:delete-role-template` | remove template | `id` | `boolean` |

### Activity & Task 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `activity:get-recent` | `getRecentActivities(limit)` | `limit?` | `ActivityEvent[]` |
| `activity:clear` | `clearActivities()` | — | `void` |
| `task:create` | `addTask(task)` | task | `TaskDelegation` |
| `task:create-manual` | `createManualTask(task)` | manual task | `TaskDelegation` |
| `task:list` | `getTasks()` | — | `TaskDelegation[]` |
| `task:get-for-agent` | `getTasksForAgent(agentId)` | `agentId` | `TaskDelegation[]` |
| `task:update` | `updateTask(id, updates)` | `id, updates` | `TaskDelegation` |
| `task:delete` | `deleteTask(id)` | `id` | `boolean` |
| `delegation:get-active` | tasks with status='in-progress' | — | `TaskDelegation[]` |

### MCP 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `mcp:get-global` | global MCP servers | — | `McpServerConfig[]` |
| `mcp:set-global` | set global servers | servers | `void` |
| `mcp:get-agent` | agent MCP config | `agentId` | `McpServerConfig[]` |
| `mcp:set-agent` | set agent config | `agentId, servers` | `void` |
| `mcp:get-health` | all health results | — | `Record<string, McpHealthResult[]>` |
| `mcp:check-now` | force health check | — | `Record<string, McpHealthResult[]>` |
| `mcp:discover-directory` | scan dir for MCP | `dir` | `DiscoveredMcpServer[]` |
| `mcp:discover-all` | full discovery | — | `McpDiscoveryResult` |
| `mcp:get-discovered` | cached results | — | `DiscoveredMcpServer[]` |
| `mcp:import-discovered` | import to config | `name, target` | `boolean` |

### LLM & Profile 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `llm:discover-all` | `discoverAllLocalModels()` | — | `LlmDiscoveryResult` |
| `llm:get-discovered` | cached models | — | `DiscoveredLocalModel[]` |
| `llm:check-source` | check source available | `LocalLlmSource` | `{available, version?, error?}` |
| `profile:list` | all profiles | — | `CliProfile[]` |
| `profile:list-for-provider` | by provider | `CliProvider` | `CliProfile[]` |
| `profile:create` | create profile | profile | `CliProfile` |
| `profile:update` | update profile | `id, updates` | `CliProfile \| null` |
| `profile:delete` | delete profile | `id` | `boolean` |
| `profile:get-usage` | agents per profile | — | `Record<string, number>` |

### 기타 채널

| 채널명 | 핸들러 | 파라미터 | 반환값 |
|--------|--------|---------|--------|
| `model:get-available` | cloud + local models | `CliProvider` | `{value, label, tier}[]` |
| `shell:open-external` | `shell.openExternal(url)` | `url` (http/https) | `{success, error?}` |
| `shell:open-path` | `shell.showItemInFolder(path)` | `filePath` | `{success, error?}` |
| `shell:run-command` | `exec(command)` | `command, cwd?` | `{success, stdout?, stderr?}` |
| `file:read-content` | read file (max 100KB) | `filePath` | `{success, content, fileName, fileSize}` |
| `permission:respond` | `respondToPermission(id, allowed)` | `requestId, allowed` | `void` |
| `error-recovery:get-active` | active recoveries | — | `ErrorRecoveryEvent[]` |
| `error-recovery:is-recovering` | check agent | `agentId` | `boolean` |
| `app:quit` | `forceQuit()` | — | `void` |
| `app:set-dock-expanded` | `setDockExpanded(expanded)` | `boolean` | `void` |
| `app:set-dock-size` | `setDockSize(size)` | `DockSize` | `void` |
| `dock:set-visible-count` | `resizeDock(count)` | `number` | `void` |

### 브로드캐스트 이벤트 (Main → Renderer)

| 이벤트 | 발생 시점 | 데이터 |
|--------|----------|--------|
| `agent:created` | 에이전트 생성 | `AgentConfig` |
| `agent:updated` | 에이전트 수정 | `AgentConfig` |
| `agent:deleted` | 에이전트 삭제 | `agentId` |
| `agent:status-changed` | 상태 변경 | `{agentId, status}` |
| `agent:process-info-changed` | 프로세스 정보 변경 | `{agentId, info}` |
| `session:message` | 메시지 추가 | `{agentId, message: ChatMessage}` |
| `session:stream-start` | 스트리밍 시작 | `{agentId, messageId}` |
| `session:stream-delta` | 스트리밍 조각 | `{agentId, messageId, delta}` |
| `session:stream-end` | 스트리밍 종료 | `{agentId, message: ChatMessage}` |
| `session:cleared` | 세션 초기화 | `{agentId}` |
| `conversation:message` | 그룹 메시지 | `ConversationMessage` |
| `conversation:stream-start/delta/end` | 그룹 스트리밍 | 유사 |
| `conversation:status-changed` | 그룹 상태 | `{conversationId, status, currentAgentId}` |
| `conversation:mode-changed` | 모드 변경 | `{conversationId, mode}` |
| `delegation:started` | 위임 시작 | `{agentId, delegations}` |
| `delegation:agent-completed` | 위임 에이전트 완료 | `{agentId, result}` |
| `delegation:synthesizing` | 종합 중 | `{agentId}` |
| `settings:changed` | 설정 변경 | `GlobalSettings` |
| `activity:new` | 새 활동 | `ActivityEvent` |
| `task:created/updated/deleted` | 작업 변경 | `TaskDelegation` / `id` |
| `mcp:config-changed` | MCP 설정 변경 | `{agentId}` |
| `permission:request` | 퍼미션 요청 | `PermissionRequest` |
| `permission:timeout` | 퍼미션 타임아웃 | `{requestId}` |
| `cli:status` | CLI 상태 변경 | `{installed, version}` |
| `dock:size-changed` | 독 크기 변경 | `DockSize` |

---

## 6. Preload Bridge

> 소스: `src/preload/index.ts`

**15개 네임스페이스**:

```typescript
window.api = {
  agent:        { list, create, update, delete, getState, getAllStates, getOrgChart,
                  getProcessInfo, spawnTemporary, removeTemporary, duplicate,
                  exportConfig, importConfig }
  session:      { send, abort, clear, getHistory, getErrorLog }
  conversation: { create, list, get, update, delete, send, triggerAgent,
                  pause, resume, abort, clear, getHistory, getState, setMode }
  window:       { openChat, openGroupChat, openNewConversation, openEditor,
                  closeEditor, openDashboard, openCommandCenter, openSettings,
                  minimize, close, selectDirectory, selectFile }
  file:         { readContent }
  settings:     { get, update, getRoleTemplates, saveRoleTemplate, deleteRoleTemplate }
  activity:     { getRecent, clear }
  task:         { create, createManual, list, getForAgent, update, delete }
  permission:   { respond }
  delegation:   { getActive }
  errorRecovery:{ getActive, isRecovering }
  cli:          { check, install, checkNode, checkUpdate, checkProvider, checkAllProviders }
  mcp:          { getGlobal, setGlobal, getAgent, setAgent, getHealth, checkNow,
                  discoverDirectory, discoverAll, getDiscovered, importDiscovered }
  llm:          { discoverAll, getDiscovered, checkSource }
  profile:      { list, listForProvider, create, update, delete, getUsage }
  model:        { getAvailable }
  shell:        { openExternal, openPath, runCommand }
  app:          { quit, setDockExpanded, setDockSize, setDockVisibleCount }
  on:           (channel, callback) → unsubscribe function
}
```

**패턴**: 모든 API는 `ipcRenderer.invoke()` → `Promise` 기반.
이벤트 구독은 `window.api.on(channel, callback)` → cleanup 함수 반환.

---

## 7. Renderer 페이지

> 소스: `src/renderer/src/App.tsx` — Hash 기반 라우터 (외부 라우터 라이브러리 미사용)

### 라우트 맵

| 해시 라우트 | 페이지 | 윈도우 타입 |
|------------|--------|------------|
| `#/dock` | DockPage | Dock (항상 하단, 투명) |
| `#/chat/:agentId` | ChatPage | Chat (에이전트별 1개) |
| `#/editor` / `#/editor/:agentId` | EditorPage | Editor (1개) |
| `#/group-chat/:conversationId` | GroupChatPage | Group Chat (대화방별 1개) |
| `#/new-conversation` | NewConversationPage | Conversation Creator (1개) |
| `#/dashboard` | DashboardPage | Dashboard (1개) |
| `#/command-center` | CommandCenterPage | Command Center (1개) |
| `#/settings` | SettingsPage | Settings (1개) |
| `#/setup` | SetupPage | Setup Wizard (1개) |

### 7.1 DockPage

- **역할**: 화면 하단에 항상 표시되는 에이전트 독
- **컴포넌트**: `<Dock />`
- **특징**: 투명 배경, alwaysOnTop, `useKeyboardShortcuts()` 적용
- **단축키**: Ctrl+N (에디터), Ctrl+G (새 대화), Ctrl+D/Ctrl+, (대시보드)

### 7.2 ChatPage

- **역할**: 에이전트와 1:1 채팅
- **Props**: `{ agentId: string }`
- **컴포넌트**: `<ChatWindow agentId={agentId} />`

### 7.3 EditorPage

- **역할**: 에이전트 생성/편집 폼
- **Props**: `{ agentId?: string }` (없으면 새 에이전트)
- **컴포넌트**: `<AgentEditor />`

### 7.4 GroupChatPage

- **역할**: 다중 에이전트 대화방
- **Props**: `{ conversationId: string }`
- **컴포넌트**: `<GroupChatWindow conversationId={conversationId} />`

### 7.5 NewConversationPage

- **역할**: 그룹 대화 생성 폼
- **컴포넌트**: `<ConversationCreator />`

### 7.6 DashboardPage

- **역할**: 팀 관리, 활동 로그, 태스크 보드, 설정, MCP
- **탭**: `team` | `activity` | `tasks` | `settings` | `mcp`
- **레이아웃**: 2컬럼 (사이드바 + 메인 콘텐츠)
- **특징**: 5초마다 에이전트 상태 폴링, IPC 이벤트 실시간 구독

### 7.7 CommandCenterPage

- **역할**: 조직 계층 기반 멀티 에이전트 커맨드 센터
- **레이아웃**: 3컬럼 그리드 (Director | Leader | Team Members)
- **특징**: `useMultiChat()` 훅으로 다중 에이전트 세션 관리, MCP 헬스 표시

### 7.8 SettingsPage

- **역할**: 앱 전체 설정
- **섹션**: 그룹 채팅 관리, 테마, 언어, CLI 프로바이더, 독 크기, 작업 디렉토리, 로컬 LLM 감지, CLI 프로필, MCP 검색, CLI 업데이트, 앱 버전, 종료 버튼

### 7.9 SetupPage

- **역할**: 최초 실행 시 셋업 위저드
- **컴포넌트**: `<SetupWizard onComplete={handleClose} />`

---

## 8. Renderer 컴포넌트

### 8.1 chat/ (9개)

| 컴포넌트 | Props | 역할 |
|----------|-------|------|
| `ChatWindow` | `{agentId}` | 메인 채팅 컨테이너 — 헤더+메시지+입력 |
| `AgentHeader` | `{agent, status, onMinimize, onClose, onClear}` | 타이틀바 — 에이전트 정보, 세션 초기화 |
| `MessageList` | `{messages, streaming, streamingContent}` | 스크롤 가능 메시지 피드 |
| `MessageBubble` | `{message, onSend?}` | 단일 메시지 — Markdown, QUESTION/ACTION 블록 |
| `ChatInput` | `{onSend, onAbort, streaming, disabled?}` | 텍스트 입력, 파일 첨부, 모드 토글 |
| `StreamingText` | `{content}` | 부분 응답 타이핑 애니메이션 |
| `QuestionBlock` | `{raw, onSend?, readOnly?}` | 체크박스 + 코멘트 입력 UI |
| `ActionBlock` | `{type, label, target}` | URL/명령/파일 열기 버튼 |
| `PermissionDialog` | `{request, onRespond}` | 60초 카운트다운 퍼미션 다이얼로그 |

### 8.2 dock/ (4개)

| 컴포넌트 | Props | 역할 |
|----------|-------|------|
| `Dock` | — | 메인 독 컨테이너 — 그룹 관리, 컨텍스트 메뉴 |
| `AgentSlot` | `{agent, status, recovering?, dockSize?, ...}` | 에이전트 버튼 — 아바타+상태+역할 뱃지 |
| `FishingCat` | `{status, recovering?, size?, dockSize?}` | 고양이 애니메이션 (낚시/잡기/물기) |
| `AgentEditor` | `{onClose, editAgentId?}` | 에이전트 생성/편집 대형 폼 (~53KB) |

### 8.3 group-chat/ (8개)

| 컴포넌트 | Props | 역할 |
|----------|-------|------|
| `GroupChatWindow` | `{conversationId}` | 그룹 채팅 메인 컨테이너 |
| `GroupChatHeader` | `{name, participants, status, mode, ...}` | 타이틀바 — 참가자 아바타, 모드 토글 |
| `GroupMessageList` | `{messages, agents, streaming, ...}` | 에이전트 정보 포함 메시지 목록 |
| `GroupMessageBubble` | — | 그룹 메시지 (에이전트 이름 + 내용) |
| `GroupStreamingText` | — | 그룹 스트리밍 메시지 |
| `GroupChatInput` | `{onSend, onPause, onResume, onAbort, status}` | 일시정지/재개 컨트롤 포함 |
| `ParticipantBar` | `{participants, currentAgentId, onTriggerAgent}` | 수동 모드 — 에이전트 트리거 버튼 |
| `ConversationCreator` | — | 새 그룹 대화 생성 폼 |

### 8.4 dashboard/ (10개)

| 컴포넌트 | 역할 |
|----------|------|
| `AgentCard` | 에이전트 정보 카드 — 모델, 비용, 상태, 프로세스, 현재 작업 |
| `OrgChart` | 조직도 시각화 |
| `ActivityFeed` | 최근 활동 로그 |
| `TaskBoard` | 작업 칸반 보드 (생성, 상태 변경, 삭제) |
| `TaskCreateForm` | 수동 작업 생성 모달 |
| `TaskDetailModal` | 작업 상세 모달 |
| `GlobalSettingsPanel` | 글로벌 MCP 서버 편집기 |
| `McpServerEditor` | 에이전트별 MCP 설정 |
| `NotificationCenter` | 토스트 알림 |
| `SetupWizard` | 온보딩 플로우 |

### 8.5 command-center/ (3개)

| 컴포넌트 | Props | 역할 |
|----------|-------|------|
| `MiniChatPane` | `{agent, status, messages, streaming, ...}` | 미니 채팅 패인 (에이전트당 1개) |
| `HierarchyTabs` | `{leaders, activeLeaderId, statuses, onSelect}` | 팀장 전환 탭 |
| `CommandCenterInput` | `{targetAgentName, streaming, onSend, onAbort}` | 공유 입력 필드 |

### 8.6 theme/ (1개)

| 컴포넌트 | 역할 |
|----------|------|
| `ThemeToggle` | 해/달 아이콘 테마 토글 버튼 |

---

## 9. Zustand 스토어

### 9.1 useAgentStore

```typescript
interface AgentStore {
  agents: AgentConfig[]
  states: Map<string, AgentState>
  loading: boolean
  fetchAgents(): Promise<void>
  fetchStates(): Promise<void>
  createAgent(config): Promise<AgentConfig>
  updateAgent(id, updates): Promise<void>
  deleteAgent(id): Promise<void>
  setAgentStatus(id, status): void
  openChat(agentId): Promise<void>
}
```

### 9.2 useSessionStore

```typescript
interface SessionStore {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  streamingId: string | null
  loadHistory(agentId): Promise<void>
  addMessage(msg): void
  setStreaming(streaming): void
  appendStreamDelta(id, delta): void
  finalizeStream(msg): void
  clearMessages(): void
}
```

### 9.3 useConversationStore

```typescript
interface ConversationStore {
  conversations: ConversationConfig[]
  messages: ConversationMessage[]
  status: ConversationStatus
  currentAgentId: string | null
  mode: ConversationMode
  streaming: boolean
  streamingContent: string
  streamingMsgId: string | null
  streamingAgentId: string | null
  streamingAgentName: string | null
  fetchConversations(): Promise<void>
  loadHistory(conversationId): Promise<void>
  loadState(conversationId): Promise<void>
  addMessage(msg): void
  setStatus(status, currentAgentId): void
  setMode(mode): void
  startStream(id, agentId, agentName): void
  appendStreamDelta(id, delta): void
  finalizeStream(msg): void
  clearMessages(): void
  deleteConversation(id): Promise<void>
}
```

### 9.4 useMultiSessionStore

```typescript
// Command Center용 — 다중 에이전트 세션 동시 관리
interface AgentSessionState {
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  streamingMsgId: string | null
}

interface MultiSessionStore {
  sessions: Record<string, AgentSessionState>
  loadHistory(agentId): Promise<void>
  unloadSession(agentId): void
  addMessage(agentId, msg): void
  clearMessages(agentId): void
  startStream(agentId, msgId): void
  appendStreamDelta(agentId, msgId, delta): void
  finalizeStream(agentId, msg): void
  getSession(agentId): AgentSessionState
}
```

### 9.5 useActivityStore

```typescript
interface ActivityStore {
  activities: ActivityEvent[]
  loading: boolean
  fetchActivities(limit?): Promise<void>     // 기본 100건
  addActivity(event): void                    // 클라이언트 최대 500건
  clearActivities(): Promise<void>
}
```

### 9.6 useTaskStore

```typescript
interface TaskStore {
  tasks: TaskDelegation[]
  loading: boolean
  filter: { search, agentId, priority }
  setFilter(filter): void
  filteredTasks(): TaskDelegation[]
  fetchTasks(): Promise<void>
  createTask(task): Promise<TaskDelegation>
  createManualTask(task): Promise<TaskDelegation>
  changeTaskStatus(id, status, result?): Promise<void>
  deleteTask(id): Promise<void>
}
```

### 9.7 useNotificationStore

```typescript
interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  timestamp: number
  duration?: number        // ms, 0 = persistent
}

interface NotificationStore {
  notifications: Notification[]
  addNotification(n): void     // 기본 5초 후 자동 제거
  removeNotification(id): void
  clearAll(): void
}
```

### 9.8 useSettingsStore

```typescript
interface SettingsStore {
  settings: GlobalSettings | null
  loading: boolean
  fetchSettings(): Promise<void>
  updateSettings(updates): Promise<void>
}
```

---

## 10. 커스텀 훅

### 10.1 useChat(agentId)

**파일**: `hooks/useChat.ts`

단일 에이전트 채팅 세션을 관리하는 훅.

**반환값**:
```typescript
{
  messages: ChatMessage[]
  streaming: boolean
  streamingContent: string
  sendMessage: (message: string) => Promise<void>
  abort: () => Promise<void>
  clear: () => Promise<void>
  permissionRequest: PermissionRequest | null
  respondToPermission: (requestId, allowed) => Promise<void>
}
```

**구독하는 IPC 이벤트**:
- `session:message`, `session:stream-start`, `session:stream-delta`, `session:stream-end`
- `session:cleared`, `agent:status-changed`
- `delegation:started`, `delegation:agent-completed`, `delegation:synthesizing`
- `mcp:config-changed`, `permission:request`, `permission:timeout`

---

### 10.2 useGroupChat(conversationId)

**파일**: `hooks/useGroupChat.ts`

다중 에이전트 대화 세션 관리.

**반환값**:
```typescript
{
  messages: ConversationMessage[]
  status: ConversationStatus
  currentAgentId: string | null
  mode: ConversationMode
  streaming: boolean
  streamingContent: string
  streamingAgentId: string | null
  streamingAgentName: string | null
  sendMessage: (message: string) => Promise<void>
  triggerAgent: (agentId: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  abort: () => Promise<void>
  clear: () => Promise<void>
  changeMode: (newMode) => Promise<void>
}
```

---

### 10.3 useMultiChat(agentIds[])

**파일**: `hooks/useMultiChat.ts`

Command Center용 — 여러 에이전트 세션을 동시 관리.

**반환값**:
```typescript
{
  getSession: (agentId) => AgentSessionState
  sessions: Record<string, AgentSessionState>
  sendMessage: (agentId, message) => Promise<void>
  abort: (agentId) => Promise<void>
  clear: (agentId) => Promise<void>
}
```

**동작**: agentIds 배열 변경 시 자동으로 히스토리 로드/언로드. 단일 IPC 리스너로 모든 에이전트 이벤트를 라우팅.

---

### 10.4 useKeyboardShortcuts()

**파일**: `hooks/useKeyboardShortcuts.ts`

Dock 페이지 전역 키보드 단축키.

| 단축키 | 동작 |
|--------|------|
| `Ctrl/Cmd + N` | 에디터 열기 |
| `Ctrl/Cmd + G` | 새 대화 생성 |
| `Ctrl/Cmd + D` 또는 `Ctrl/Cmd + ,` | 대시보드 열기 |

---

### 10.5 useI18n()

**파일**: `hooks/useI18n.ts`

설정 스토어의 언어 변경을 감지하여 i18n 로케일 동기화.

**반환값**:
```typescript
{
  t: (key: string, params?: Record<string, string|number>) => string
  locale: 'ko' | 'en' | 'ja' | 'zh'
}
```

---

## 11. 위임 시스템 상세

### 11.1 블록 문법

#### DELEGATE 블록 (위임)
```
[DELEGATE:에이전트이름|역할]
구체적인 작업 지시 내용
- 파일 경로: src/components/Button.tsx
- 작성할 코드 내용...
[/DELEGATE]
```

#### QUESTION 블록 (사용자 확인)
```
[QUESTION]
어떤 디자인 스타일을 선호하시나요?
- [ ] 다크 테마 (Cursor.com 스타일)
- [ ] 라이트 테마 (Linear.app 스타일)
- [ ] 시스템 테마 자동 감지
[/QUESTION]
```

#### MCP 블록 (서버 관리)
```
[MCP:ADD|서버이름|명령어|인수1,인수2|작업디렉토리|KEY1=value1,KEY2=value2]
[MCP:REMOVE|서버이름]
```

#### ACTION 블록 (결과 확인)
```
[ACTION:OPEN_URL|브라우저로 열기|http://localhost:3000]
[ACTION:RUN_CMD|개발 서버 실행|pnpm dev]
[ACTION:OPEN_FILE|프로젝트 폴더|src/pages/index.tsx]
```

#### REMOVE 블록 (에이전트 삭제)
```
[REMOVE:에이전트이름]
```

---

### 11.2 위임 전체 흐름

```
사용자 메시지 → Director
     │
     ▼
Director 응답: [DELEGATE:프론트엔드팀장|Frontend Lead]...[/DELEGATE]
                [DELEGATE:QA팀장|QA Lead]...[/DELEGATE]
     │
     ▼ parseDelegationBlocks()
     │
     ├── findOrCreateAgent("프론트엔드팀장") → 기존 or 동적 생성
     ├── findOrCreateAgent("QA팀장") → 기존 or 동적 생성
     │
     ▼ executeOneRound() — 최대 2개 동시 실행
     │
     ├── sendMessageAndCapture(프론트엔드팀장, task) → 결과
     │    │
     │    ▼ 프론트엔드팀장 응답: [DELEGATE:Alex|Frontend Dev]...[/DELEGATE]
     │    ├── findOrCreateAgent("Alex") → MEMBER_DEFS에서 매칭
     │    └── sendMessageAndCapture(Alex, subtask) → 코드 작성 완료
     │
     ├── sendMessageAndCapture(QA팀장, task) → 결과
     │
     ▼ 결과 수집 (각 3000자 제한)
     │
     ▼ Synthesis: Director에게 "[현재 조직 현황] + 위임 결과 + 추가 위임 가능" 전달
     │
     ├── Director 응답에 [DELEGATE:] 있으면 → Round 2 (최대 3라운드)
     └── Director 응답에 [DELEGATE:] 없으면 → 완료
```

### 11.3 제약 조건

| 제약 | 값 | 설명 |
|------|-----|------|
| `MAX_DELEGATION_ROUNDS` | 3 | 위임 최대 반복 라운드 |
| `MAX_CONCURRENT_DELEGATIONS` | 2 | 라운드당 최대 동시 위임 |
| 결과 길이 제한 | 3000자/에이전트 | synthesis 프롬프트 크기 제한 |
| 위임 타임아웃 | 10분 | 데드락 방지 |
| 실패 에이전트 | failedAgentIds 누적 | 같은 에이전트 재위임 방지 |

### 11.4 Director 프롬프트 전문 (한국어 원문)

> 전체 프롬프트는 `src/main/services/default-agents.ts`의 `DIRECTOR_DEF.systemPrompt` 참조.
> 위 4.6절에 핵심 발췌가 포함되어 있으며, 전문은 약 325줄의 가이드라인으로 구성됨.

---

## 12. 데이터 저장 구조

### 12.1 기본 경로

```
%APPDATA%/virtual-company-data/          (Windows)
~/Library/Application Support/virtual-company-data/  (macOS)
~/.config/virtual-company-data/          (Linux)
```

### 12.2 디렉토리 레이아웃

```
virtual-company-data/
├── config.json                          # 글로벌 설정 (GlobalSettings)
├── projects/
│   ├── {hash1}/                         # 프로젝트 A (SHA-256 해시 12자)
│   │   ├── config.json                  # 프로젝트별 데이터
│   │   └── mcp-configs/
│   │       ├── {agentId1}.json          # 에이전트별 MCP 설정 파일
│   │       └── {agentId2}.json
│   └── {hash2}/                         # 프로젝트 B
│       └── config.json
└── claude-configs/                      # 에이전트별 CLI 설정 디렉토리
    ├── {agentId1}/
    └── {agentId2}/
```

### 12.3 프로젝트별 config.json 스키마

```typescript
{
  agents: AgentConfig[]              // 에이전트 목록
  sessions: {                        // 에이전트별 세션 정보
    [agentId]: {
      sessionId: string
      messages: ChatMessage[]
    }
  }
  conversations: ConversationConfig[] // 그룹 대화 설정
  conversationHistories: {            // 그룹 대화 히스토리
    [conversationId]: ConversationMessage[]
  }
  activities: ActivityEvent[]         // 활동 로그 (최대 500건)
  tasks: TaskDelegation[]            // 위임 작업 목록
  archivedAgents: ArchivedAgent[]    // 삭제된 에이전트 아카이브
  discoveredMcpServers: DiscoveredMcpServer[]  // 감지된 MCP 서버
}
```

### 12.4 글로벌 config.json (프로젝트 무관)

```typescript
{
  defaultModel: string
  defaultPermissionMode: PermissionMode
  defaultMaxTurns: number
  defaultWorkingDirectory: string
  globalMcpServers: McpServerConfig[]
  agentSpawnLimit: number
  theme: ThemeSettings
  dockSize: DockSize
  setupCompleted: boolean
  companyRules: string
  roleTemplates: RoleTemplate[]
  language: 'ko' | 'en' | 'ja' | 'zh'
  agentLanguage: 'ko' | 'en' | 'ja' | 'zh'
  defaultCliProvider: CliProvider
  cliProfiles: CliProfile[]
  discoveredLocalModels: DiscoveredLocalModel[]
}
```

### 12.5 해시 경로 정규화 (`hashPath`)

```
E:\dock\catdock\  →  e:\dock\catdock\  (소문자 + backslash)
                 →  SHA-256 해시의 앞 12자
                 →  projects/{12char_hash}/config.json
```

---

## 13. 윈도우 관리

> 소스: `src/main/window-manager.ts`

### 윈도우 타입별 스펙

| 윈도우 | 크기 (WxH) | 특수 속성 | 복수 허용 |
|--------|-----------|----------|----------|
| **Dock** | 동적×115~195 | transparent, alwaysOnTop, skipTaskbar, 화면 하단 고정 | 1개 |
| **Chat** | 520×700 (min 400×500) | frame: false | 에이전트당 1개 |
| **Editor** | 520×700 | frame: false, alwaysOnTop, resizable: false | 1개 |
| **GroupChat** | 650×750 (min 450×550) | frame: false | 대화방당 1개 |
| **ConversationCreator** | 460×520 | frame: false, alwaysOnTop | 1개 |
| **Dashboard** | 1200×800 (min 900×600) | frame: false | 1개 |
| **CommandCenter** | 1400×850 (min 1000×600) | frame: false | 1개 |
| **Settings** | 380×720 (min 340×500) | frame: false, alwaysOnTop | 1개 |
| **Setup** | 600×650 | frame: false, resizable: false | 1개 |

### Dock 크기 프리셋

| 사이즈 | height | slotSize | agentGap |
|--------|--------|----------|----------|
| small | 115px | 40px | 80px |
| medium | 155px | 48px | 110px |
| large | 195px | 64px | 140px |

- 확장 시: 350px 고정
- 너비: `agentCount × gap + 160(버튼) + 40(패딩)`, 최대 `workArea.width - 40`

### 윈도우 공통 설정

```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false,
  webviewTag: false
}
```

### 윈도우 라이프사이클

- 모든 서브 윈도우 닫힘 → `ensureDockVisible()` (독 항상 유지)
- Dock 닫기 → `e.preventDefault()` (닫기 불가)
- Dock 렌더 프로세스 충돌 → 500ms 후 자동 재생성
- 앱 종료 시 → `destroyAllWindows()` → 독 포함 전체 파괴

---

# Part II — 향후 시스템 (Structured Handoff Protocol)

---

## 14. Structured Handoff Protocol 개요

### 14.1 기존 자유형 위임의 한계점

1. **비구조적 결과물**: `[DELEGATE:]` 블록의 자유 텍스트 지시 → 결과 품질 편차가 큼
2. **망각 문제**: 3라운드 위임 중 초반 컨텍스트가 LLM 메모리에서 소실
3. **검증 부재**: 완성 여부를 텍스트 보고에만 의존 → 실제 파일/빌드 상태 미확인
4. **팀 간 단절**: Leader끼리 직접 소통 불가 → Director를 경유해야 함
5. **재시도 비효율**: 실패 시 전체 위임을 처음부터 반복

### 14.2 Deliverable-based 핸드오프 개념

```
기존: Director → "프론트엔드 구현해" → 프론트엔드팀장 → (자유 텍스트 결과)

향후: Director → DeliverableSpec {
        name: "프론트엔드 구현",
        outputFiles: ["src/pages/index.tsx", "src/components/Hero.tsx"],
        acceptanceCriteria: ["pnpm build 성공", "lighthouse > 90"],
        phases: [
          { name: "설계", checkpoint: "디자인 토큰 정의" },
          { name: "구현", checkpoint: "컴포넌트 코드 완성" },
          { name: "검증", checkpoint: "빌드+린트 통과" }
        ]
      }
```

### 14.3 Phase-based 실행 + 체크포인트

각 위임을 **단계(Phase)**로 분할하여 LLM 망각을 방지:

```
Phase 1: 설계 → checkpoint 달성 → context 저장
Phase 2: 구현 → checkpoint 달성 → context 저장
Phase 3: 검증 → checkpoint 달성 → 최종 보고
```

각 phase 시작 시 이전 phase의 checkpoint 결과를 컨텍스트로 주입 → 망각 방지.

### 14.4 체크리스트 기반 검증

```typescript
// 자동 검증 가능한 항목
- [ ] 파일 존재 확인 (fs.existsSync)
- [ ] pnpm typecheck 통과
- [ ] pnpm lint 통과
- [ ] pnpm build 통과
- [ ] 특정 export 존재 확인
- [ ] 파일 크기 범위 확인

// 수동 검증 (Leader 판단)
- [ ] UI 디자인 가이드 준수
- [ ] 코드 품질 적절
```

---

## 15. 새 타입 정의

```typescript
// ── Deliverable (산출물 단위) ──

interface DeliverableSpec {
  id: string
  name: string
  description: string
  outputFiles: string[]                // 예상 산출 파일 목록
  acceptanceCriteria: string[]         // 수용 기준 (자동/수동)
  phases: PhaseSpec[]                  // 단계 목록
  dependsOn?: string[]                 // 선행 deliverable ID
}

interface PhaseSpec {
  name: string
  description: string
  checkpoint: PhaseCheckpoint
  maxRetries: number                   // 실패 시 재시도 횟수
}

interface PhaseCheckpoint {
  type: 'auto' | 'manual' | 'hybrid'
  autoChecks?: AutoCheck[]             // 자동 검증 항목
  manualReview?: string                // 수동 검증 설명
}

interface AutoCheck {
  type: 'file-exists' | 'command-success' | 'export-exists' | 'file-size'
  target: string                       // 파일 경로 또는 명령어
  expectedResult?: string              // 기대 결과
}

// ── Handoff (핸드오프 요청/결과) ──

interface HandoffRequest {
  id: string
  deliverableId: string
  fromAgentId: string
  toAgentId: string
  currentPhase: number
  context: PhaseContext[]              // 이전 phase 결과
  createdAt: number
}

interface PhaseContext {
  phaseName: string
  checkpoint: PhaseCheckpoint
  result: 'passed' | 'failed' | 'skipped'
  output: string                       // 요약된 결과
  files: string[]                      // 변경된 파일 목록
}

interface HandoffResult {
  id: string
  handoffId: string
  deliverableId: string
  status: 'completed' | 'failed' | 'partial'
  phases: PhaseResult[]
  finalReport: string
  completedAt: number
}

interface PhaseResult {
  phaseName: string
  status: 'passed' | 'failed' | 'retried'
  attempts: number
  checkResults: CheckResult[]
  output: string
}

interface CheckResult {
  check: AutoCheck
  passed: boolean
  actualResult: string
  timestamp: number
}

// ── Cross-Team Review (팀 간 리뷰) ──

interface CrossTeamReview {
  id: string
  deliverableId: string
  requestedBy: string                  // 리뷰 요청 Leader ID
  reviewerIds: string[]                // 리뷰어 Leader ID 목록
  status: 'pending' | 'in-review' | 'approved' | 'rejected'
  reviews: TeamReview[]
  createdAt: number
}

interface TeamReview {
  reviewerId: string
  reviewerName: string
  verdict: 'approve' | 'request-changes' | 'reject'
  comments: string
  timestamp: number
}

// ── Team Conversation Room (팀장 간 대화방) ──

interface TeamConversationRoom {
  id: string
  name: string
  leaderIds: string[]                  // 참가 리더 ID 목록
  topic: string                        // 대화 주제 (deliverable 관련)
  deliverableId?: string
  messages: TeamMessage[]
  createdAt: number
}

interface TeamMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
  referencedDeliverableId?: string
}

// ── Auto-Escalation (자동 에스컬레이션) ──

interface AutoEscalation {
  id: string
  deliverableId: string
  phaseIndex: number
  agentId: string
  reason: 'max-retries' | 'timeout' | 'dependency-failed'
  escalatedTo: string                  // 상위 에이전트 ID
  status: 'escalated' | 'resolved' | 'overridden'
  createdAt: number
  resolvedAt?: number
}
```

---

## 16. 구현 계획

### 16.1 팀장 간 자동 대화방 생성

**현재**: Leader들은 Director를 경유해서만 소통 가능.

**향후**: 같은 프로젝트의 Leader들이 `TeamConversationRoom`에서 직접 대화.

**구현 포인트**:
- Director가 위임 시 관련 Leader들의 대화방 자동 생성
- Deliverable의 `dependsOn` 관계에 따라 의존 Leader끼리 연결
- 대화방은 `conversation-manager.ts`를 확장하여 구현
- UI: `GroupChatPage`를 재사용하되 Leader 전용 뱃지 표시

### 16.2 완성 산출물 기반 유기적 소통

**현재**: 자유 텍스트 위임 → 결과도 자유 텍스트.

**향후**: `DeliverableSpec`으로 구조화된 산출물 → `HandoffResult`로 검증된 결과.

**구현 포인트**:
- `delegation-manager.ts`에 `DeliverableSpec` 파싱 추가
- Director 프롬프트에 deliverable 형식 가이드 추가
- `HandoffResult`를 TaskDelegation에 연동
- UI: TaskBoard에 deliverable 진행률 표시

### 16.3 단계화(Phasing)로 LLM 망각 방지

**현재**: 한 번에 전체 작업 위임 → LLM 컨텍스트 소실.

**향후**: Phase별로 분할 실행 + checkpoint에서 컨텍스트 저장/복원.

**구현 포인트**:
- `session-manager.ts`에 phase-aware 메시지 전송 추가
- Phase 전환 시 이전 결과를 요약하여 다음 메시지에 주입
- `PhaseContext[]`를 store에 영속 저장
- 실패 시 해당 phase만 재시도 (maxRetries)

### 16.4 체크리스트 자동 검증

**현재**: QA팀장이 수동으로 명령어 실행.

**향후**: `AutoCheck` 정의 → 시스템이 자동 실행 후 pass/fail 판정.

**구현 포인트**:
- `auto-checker.ts` 신규 서비스:
  - `file-exists`: `fs.existsSync(target)`
  - `command-success`: `exec(target)` → exit code 0이면 pass
  - `export-exists`: AST 파싱 또는 grep
  - `file-size`: `fs.statSync(target).size` 범위 확인
- Phase checkpoint 완료 시 자동 실행
- 결과를 `CheckResult[]`로 기록

### 16.5 크로스팀 리뷰 프로세스

**현재**: 없음. 각 팀이 독립적으로 작업.

**향후**: Deliverable 완성 후 관련 팀 Leader에게 자동 리뷰 요청.

**구현 포인트**:
- `cross-review-manager.ts` 신규 서비스
- Deliverable 완료 → `dependsOn` 관계의 Leader에게 리뷰 요청
- 리뷰 결과 취합 후 Director에게 보고
- UI: DashboardPage에 리뷰 대기/완료 상태 표시

---

## 17. 마이그레이션 가이드

### v1.6.0 → v2.0 전환 시 데이터/설정 호환성

### 17.1 하위 호환 원칙

- **기존 config.json**: 그대로 읽기 가능. 새 필드는 optional로 추가.
- **기존 위임 형식**: `[DELEGATE:]` 블록은 계속 동작. DeliverableSpec은 **추가** 형식.
- **기존 Director 프롬프트**: 자동 마이그레이션. `migrateSystemPrompts()`에 새 프롬프트 반영.
- **기존 에이전트**: `hierarchy` 필드 없는 에이전트는 `migrateHierarchyIfNeeded()`가 자동 처리.

### 17.2 새로 추가되는 저장 데이터

```typescript
// config.json에 추가 (optional)
{
  deliverables?: DeliverableSpec[]           // 산출물 명세
  handoffs?: HandoffRequest[]                // 핸드오프 요청
  handoffResults?: HandoffResult[]           // 핸드오프 결과
  crossTeamReviews?: CrossTeamReview[]       // 크로스팀 리뷰
  teamConversations?: TeamConversationRoom[] // 팀장 대화방
  autoEscalations?: AutoEscalation[]         // 자동 에스컬레이션
}
```

### 17.3 마이그레이션 단계

| 단계 | 변경 사항 | 호환성 |
|------|----------|--------|
| 1 | `shared/types.ts`에 새 타입 추가 | 기존 타입 변경 없음 |
| 2 | `store.ts`에 deliverable/handoff CRUD 추가 | 기존 함수 변경 없음 |
| 3 | `delegation-manager.ts`에 phase 실행 로직 추가 | 기존 `executeDelegation` 그대로 유지 |
| 4 | `auto-checker.ts` 신규 서비스 추가 | 독립 모듈 |
| 5 | `cross-review-manager.ts` 신규 서비스 추가 | 독립 모듈 |
| 6 | Director 프롬프트에 Deliverable 형식 가이드 추가 | 기존 위임 형식도 계속 인식 |
| 7 | `handlers.ts`에 새 IPC 채널 추가 | 기존 채널 변경 없음 |
| 8 | `preload/index.ts`에 새 API 추가 | 기존 API 변경 없음 |
| 9 | UI 컴포넌트 추가/수정 | 기존 페이지에 탭/섹션 추가 |

### 17.4 롤백 전략

새 기능은 모두 **optional 필드**와 **독립 모듈**로 구현하므로:
- v2.0 → v1.6.0 롤백 시 새 필드는 무시됨 (JSON 파싱에서 unknown 필드 무시)
- 기존 `[DELEGATE:]` 위임은 그대로 동작
- 새 IPC 채널은 renderer가 호출하지 않으면 비활성

---

## 부록: 상수 및 모델 옵션

> 소스: `src/shared/constants.ts`

### CLI 프로바이더별 모델 옵션

```typescript
const PROVIDER_MODEL_OPTIONS = {
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
  q: [
    { value: 'default', label: 'Default', tier: 'standard' }
  ]
}
```

### 로컬 LLM 소스

```typescript
const LOCAL_LLM_SOURCES = [
  { source: 'ollama', label: 'Ollama', defaultPort: 11434 },
  { source: 'lmstudio', label: 'LM Studio', defaultPort: 1234 },
  { source: 'openai-compatible', label: 'OpenAI Compatible', defaultPort: 8080 }
]
```

### 역할 프리셋

```
Director, Frontend Developer, Backend Developer, DevOps Engineer,
QA Tester, Tech Lead, Designer, Product Manager, Code Reviewer,
Data Engineer, Security Engineer
```

### 주요 상수

| 상수 | 값 | 설명 |
|------|-----|------|
| `DEFAULT_MAX_TURNS` | 25 | 기본 최대 턴 수 |
| `DEFAULT_PERMISSION_MODE` | `'acceptEdits'` | 기본 퍼미션 모드 |
| `MAX_PROMPT_LENGTH` | 24,000 | 시스템 프롬프트 최대 길이 |
| `MAX_ERROR_LOG_LINES` | 100 | 에러 로그 최대 줄 수 |
| `MAX_ACTIVITIES` | 500 | 활동 로그 최대 건수 |
| `MAX_MEMORY_MESSAGES` | 200 | 메모리 메시지 최대 건수 |

### 빌트인 역할 템플릿 (15개)

| ID | 이름 | 리더용 | 기본 모델 | 퍼미션 | maxTurns |
|----|------|--------|----------|--------|----------|
| `builtin-frontend-dev` | Frontend Developer | ❌ | Sonnet 4 | acceptEdits | 25 |
| `builtin-backend-dev` | Backend Developer | ❌ | Sonnet 4 | acceptEdits | 25 |
| `builtin-devops` | DevOps Engineer | ❌ | Sonnet 4 | acceptEdits | 25 |
| `builtin-qa` | QA Tester | ❌ | Sonnet 4 | acceptEdits | 25 |
| `builtin-designer` | Designer | ❌ | Sonnet 4 | plan | 25 |
| `builtin-pm` | Product Manager | ❌ | Sonnet 4 | plan | 25 |
| `builtin-code-reviewer` | Code Reviewer | ❌ | Sonnet 4 | plan | 25 |
| `builtin-data-engineer` | Data Engineer | ❌ | Sonnet 4 | acceptEdits | 25 |
| `builtin-security-engineer` | Security Engineer | ❌ | Sonnet 4 | plan | 25 |
| `builtin-tech-lead-member` | Tech Lead (Member) | ❌ | Opus 4.6 | acceptEdits | 30 |
| `builtin-director` | Director (총괄) | ✅ | Opus 4.6 | bypassPermissions | 50 |
| `builtin-vp-engineering` | VP of Engineering | ✅ | Opus 4.6 | bypassPermissions | 50 |
| `builtin-tech-lead-leader` | Tech Lead (Leader) | ✅ | Opus 4.6 | bypassPermissions | 50 |
| `builtin-engineering-manager` | Engineering Manager | ✅ | Opus 4.6 | bypassPermissions | 50 |
| `builtin-cto` | CTO | ✅ | Opus 4.6 | bypassPermissions | 50 |

---

*문서 끝 — Virtual Company ARCHITECTURE.md v1.6.0*
