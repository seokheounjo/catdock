# Virtual Company (CatDock)

**AI Agent Team Simulator** - Claude CLI 기반 가상 회사 시뮬레이터

[English](#english) | [한국어](#한국어)

---

## English

### Overview

Virtual Company is a desktop application that simulates a company team structure using AI agents. Each agent runs as an independent Claude CLI process and can read, write, and modify real code in your projects.

Agents are organized in a hierarchical structure (Director > Leader > Member) and communicate through individual chats, group conversations, and automated task delegation. The system includes error recovery, process monitoring, MCP tool integration, and a permission control layer.

### Key Features

**Agent Management**
- Hierarchical team structure - Director, Leaders, and Members with auto-delegation and upward reporting
- 15 built-in role templates (Frontend/Backend Developer, DevOps, QA, Designer, PM, etc.)
- Dynamic agent creation - Directors and Leaders can spawn new agents on-the-fly during delegation
- Temporary agents with configurable TTL for short-lived tasks

**Communication**
- Individual chat - One-on-one conversations with each agent, real-time streaming responses
- Group chat - Multi-agent conversations with auto-chain and manual turn modes
- Command Center - Monitor and control all agents simultaneously from a single hierarchical dashboard
- Upward reporting - Members auto-report results to their Leader/Director

**Task & Workflow**
- Task Board - Kanban-style task management with delegation, priority levels, and due dates
- Auto-delegation - `[DELEGATE:Name|Role]...[/DELEGATE]` blocks parsed from agent responses
- Multi-round delegation - Up to 3 rounds of delegation with synthesis after each round

**Reliability**
- Error recovery - Multi-level escalation (Member > Leader > Director > self-recovery > respawn)
- Process watchdog - Heartbeat monitoring (2min), absolute timeout (5min), director failover (3min)
- Backup director failover - Automatic handoff to backup director on primary failure

**MCP Integration**
- Three-level MCP config - Global, Team (Leader-scoped), and per-Agent
- MCP health check - Periodic connectivity verification with auto-retry (max 2)
- Failure reporting - MCP failures auto-reported to superior agent with 5min cooldown

**UI & UX**
- Setup wizard - First-run CLI detection, Node.js check, working directory selection
- Theme system - Light / Dark / System mode with multi-window sync
- i18n - Korean, English, Japanese, Chinese
- Cat-themed dock - Animated cat characters with breed-based avatars
- 9 window types - Dock, Chat, Editor, Group Chat, Dashboard, Command Center, Settings, Setup, Conversation Creator
- Permission dialog - Interactive Allow/Deny prompt with 60-second timeout

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 39 |
| Frontend | React 19, Tailwind CSS 4, Zustand 5 |
| Backend | Node.js (Main process), Claude CLI |
| Build | electron-vite, TypeScript 5.9 |
| Storage | Project-scoped local JSON files |
| Avatars | DiceBear 9.3 |
| Markdown | react-markdown 10 + remark-gfm |

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm
- **Claude Code CLI** - `npm install -g @anthropic-ai/claude-code`
- **Anthropic API Key** - Set via `claude` CLI login

### Quick Start

```bash
# Clone
git clone https://github.com/seokheounjo/catdock.git
cd catdock

# Install dependencies
pnpm install

# Run in development mode
pnpm dev
```

On first launch, the Setup Wizard will guide you through CLI detection and configuration.

### Build

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### Architecture

```
src/  (90 files, ~16,400 LOC)
├── main/                          # Electron Main process
│   ├── index.ts                   # App lifecycle, tray, CLI check
│   ├── window-manager.ts          # 9 window types creation & management
│   ├── ipc/handlers.ts            # IPC handler registration (63 channels)
│   └── services/
│       ├── agent-manager.ts       # Agent CRUD + runtime state (status, cost)
│       ├── session-manager.ts     # Claude CLI spawn, stream parsing, chat
│       ├── conversation-manager.ts # Group chat orchestration
│       ├── delegation-manager.ts  # [DELEGATE] block parsing & execution
│       ├── error-recovery.ts      # Multi-level error escalation
│       ├── process-watchdog.ts    # Heartbeat monitoring & failover
│       ├── store.ts               # Project-scoped JSON persistence
│       ├── mcp-manager.ts         # MCP config merge (global/team/agent)
│       ├── mcp-health.ts          # MCP server health monitoring
│       ├── monitoring-loop.ts     # Background monitoring (30s cycle)
│       ├── cli-builder.ts         # Claude CLI args & env builder
│       ├── permission-server.ts   # Local HTTP server for permission prompts
│       ├── activity-logger.ts     # Activity event logging
│       ├── dynamic-agent-manager.ts # Temporary agent lifecycle
│       ├── task-manager.ts        # Task delegation tracking
│       ├── settings-manager.ts    # Global settings management
│       └── default-agents.ts      # Director seeding & role templates
├── preload/
│   └── index.ts                   # contextBridge API (63 IPC channels)
├── renderer/src/
│   ├── App.tsx                    # Hash router
│   ├── pages/
│   │   ├── DockPage.tsx           # Bottom dock with agent slots
│   │   ├── DashboardPage.tsx      # Org chart, task board, activity feed
│   │   ├── CommandCenterPage.tsx  # Hierarchical multi-agent control
│   │   ├── SettingsPage.tsx       # App configuration
│   │   └── SetupPage.tsx          # First-run wizard
│   ├── components/
│   │   ├── dock/                  # AgentSlot, Dock, AgentEditor, FishingCat
│   │   ├── chat/                  # ChatWindow, MessageBubble, StreamingText, PermissionDialog
│   │   ├── group-chat/            # GroupChatWindow, ParticipantBar
│   │   ├── dashboard/             # OrgChart, TaskBoard, ActivityFeed, SetupWizard
│   │   ├── command-center/        # MiniChatPane, CommandCenterInput
│   │   └── theme/                 # ThemeToggle
│   ├── stores/                    # Zustand stores (agent, conversation, activity, task, settings, ...)
│   ├── hooks/                     # useChat, useGroupChat, useMultiChat, useI18n, useKeyboardShortcuts
│   ├── contexts/                  # ThemeContext
│   └── utils/
│       ├── avatar.ts              # DiceBear avatar generation
│       ├── cat-avatar.ts          # Cat breed visual system
│       ├── i18n.ts                # Translation loader
│       └── locales/               # ko, en, ja, zh translation files
└── shared/
    ├── types.ts                   # 50+ shared TypeScript interfaces
    └── constants.ts               # 15 built-in role templates
```

### How It Works

```
User Message
    ↓
[ Session Manager ] ─── spawn ──→ claude -p --output-format stream-json
    ↓                                        ↓
  Stream parsing ←── stdout JSON events ─────┘
    ↓
  Response contains [DELEGATE] blocks?
    ├─ Yes → [ Delegation Manager ] → spawn sub-agents → collect results → synthesize
    └─ No  → Display response in chat

Error occurs?
    → [ Error Recovery ] → notify superior → escalate if needed → self-recover or respawn

Process stuck?
    → [ Process Watchdog ] → kill after timeout → failover to backup director
```

**Dependency Architecture** (no circular dependencies):
```
session-manager ──→ delegation-manager   (callback injection)
                ──→ error-recovery       (callback injection)
                ──→ process-watchdog     (callback injection)
```

### Claude CLI Integration

Each agent spawns a Claude CLI process with:
```bash
claude -p --output-format stream-json --verbose --include-partial-messages \
  --model {model} --max-turns {turns} --permission-mode {mode} \
  [--system-prompt "..."] [--mcp-config /path/to/mcp.json] "user message"
```

- Isolated `CLAUDE_CONFIG_DIR` per agent
- MCP config merging: Global + Team (Leader) + Agent
- Permission modes: `default`, `allowAll`, `acceptEdits`, `plan`, `bypassPermissions`

### Development

```bash
pnpm dev          # Development server with hot reload
pnpm typecheck    # TypeScript type check (3 tsconfigs)
pnpm lint         # ESLint (0 errors, 0 warnings)
pnpm format       # Prettier auto-format
pnpm build        # Production build (all platforms)
```

### License

MIT

---

## 한국어

### 개요

Virtual Company는 AI 에이전트를 사용하여 회사 팀 구조를 시뮬레이션하는 데스크톱 애플리케이션입니다. 각 에이전트는 독립적인 Claude CLI 프로세스로 동작하며, 실제 코드를 읽고, 쓰고, 수정할 수 있습니다.

에이전트는 계층 구조(총괄 > 팀장 > 팀원)로 조직되며, 개별 채팅, 그룹 대화, 자동 작업 위임을 통해 소통합니다. 에러 복구, 프로세스 모니터링, MCP 도구 연동, 퍼미션 제어 계층까지 포함된 완전한 시스템입니다.

### 주요 기능

**에이전트 관리**
- 계층형 팀 구조 - 총괄, 팀장, 팀원으로 자동 위임 및 상향 보고
- 15개 내장 역할 템플릿 (프론트엔드/백엔드 개발자, DevOps, QA, 디자이너, PM 등)
- 동적 에이전트 생성 - 총괄/팀장이 위임 중 새 에이전트를 즉시 생성
- 임시 에이전트 - TTL 설정 가능한 단기 작업용 에이전트

**커뮤니케이션**
- 개별 채팅 - 각 에이전트와 1:1 대화, 실시간 스트리밍 응답
- 그룹 채팅 - 다중 에이전트 대화, 자동 체이닝 및 수동 턴 모드
- 커맨드 센터 - 모든 에이전트를 하나의 계층형 대시보드에서 동시 모니터링/제어
- 상향 보고 - 팀원이 작업 결과를 팀장/총괄에게 자동 보고

**작업 & 워크플로우**
- 작업 보드 - 칸반 스타일 작업 관리, 위임/우선순위/마감일 지원
- 자동 위임 - 에이전트 응답에서 `[DELEGATE:이름|역할]...[/DELEGATE]` 블록 파싱
- 다중 라운드 위임 - 최대 3라운드 위임 + 각 라운드 후 결과 종합

**안정성**
- 에러 복구 - 다단계 에스컬레이션 (팀원 > 팀장 > 총괄 > 자가복구 > 재생성)
- 프로세스 워치독 - 하트비트 감시(2분), 절대 타임아웃(5분), 총괄 장애조치(3분)
- 백업 총괄 장애조치 - 주 총괄 장애 시 백업 총괄에게 자동 인수

**MCP 연동**
- 3단계 MCP 설정 - 글로벌, 팀(팀장 범위), 에이전트 개별
- MCP 헬스체크 - 주기적 연결 확인 + 자동 재시도(최대 2회)
- 장애 보고 - MCP 장애 시 상위자에게 자동 보고 (5분 쿨다운)

**UI & UX**
- 셋업 위자드 - 첫 실행 시 CLI 감지, Node.js 확인, 작업 디렉토리 선택
- 테마 시스템 - 라이트/다크/시스템 모드, 멀티 윈도우 동기화
- 다국어 지원 - 한국어, 영어, 일본어, 중국어
- 고양이 테마 독 - 품종별 아바타와 애니메이션 고양이 캐릭터
- 9종 윈도우 - 독, 채팅, 에디터, 그룹채팅, 대시보드, 커맨드센터, 설정, 셋업, 대화 생성기
- 퍼미션 다이얼로그 - 60초 타임아웃 Allow/Deny 인터랙티브 프롬프트

### 기술 스택

| 계층 | 기술 |
|------|------|
| 런타임 | Electron 39 |
| 프론트엔드 | React 19, Tailwind CSS 4, Zustand 5 |
| 백엔드 | Node.js (Main process), Claude CLI |
| 빌드 | electron-vite, TypeScript 5.9 |
| 저장소 | 프로젝트별 로컬 JSON 파일 |
| 아바타 | DiceBear 9.3 |
| 마크다운 | react-markdown 10 + remark-gfm |

### 사전 요구사항

- **Node.js** 18+
- **pnpm** (권장) 또는 npm
- **Claude Code CLI** - `npm install -g @anthropic-ai/claude-code`
- **Anthropic API Key** - `claude` CLI 로그인으로 설정

### 빠른 시작

```bash
# 클론
git clone https://github.com/seokheounjo/catdock.git
cd catdock

# 의존성 설치
pnpm install

# 개발 모드 실행
pnpm dev
```

첫 실행 시 셋업 위자드가 CLI 감지 및 설정을 안내합니다.

### 빌드

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### 아키텍처

```
src/  (90개 파일, ~16,400 LOC)
├── main/                          # Electron Main 프로세스
│   ├── index.ts                   # 앱 생명주기, 트레이, CLI 확인
│   ├── window-manager.ts          # 9종 윈도우 생성 & 관리
│   ├── ipc/handlers.ts            # IPC 핸들러 등록 (63개 채널)
│   └── services/
│       ├── agent-manager.ts       # 에이전트 CRUD + 런타임 상태 (상태, 비용)
│       ├── session-manager.ts     # Claude CLI 스폰, 스트림 파싱, 채팅
│       ├── conversation-manager.ts # 그룹 채팅 오케스트레이션
│       ├── delegation-manager.ts  # [DELEGATE] 블록 파싱 & 실행
│       ├── error-recovery.ts      # 다단계 에러 에스컬레이션
│       ├── process-watchdog.ts    # 하트비트 모니터링 & 장애조치
│       ├── store.ts               # 프로젝트별 JSON 영속 저장소
│       ├── mcp-manager.ts         # MCP 설정 병합 (글로벌/팀/개별)
│       ├── mcp-health.ts          # MCP 서버 헬스 모니터링
│       ├── monitoring-loop.ts     # 백그라운드 모니터링 (30초 주기)
│       ├── cli-builder.ts         # Claude CLI 인자 & 환경변수 빌더
│       ├── permission-server.ts   # 퍼미션 프롬프트용 로컬 HTTP 서버
│       ├── activity-logger.ts     # 활동 이벤트 로깅
│       ├── dynamic-agent-manager.ts # 임시 에이전트 생명주기
│       ├── task-manager.ts        # 작업 위임 추적
│       ├── settings-manager.ts    # 전역 설정 관리
│       └── default-agents.ts      # 총괄 시딩 & 역할 템플릿
├── preload/
│   └── index.ts                   # contextBridge API (63개 IPC 채널)
├── renderer/src/
│   ├── App.tsx                    # 해시 라우터
│   ├── pages/
│   │   ├── DockPage.tsx           # 하단 독 (에이전트 슬롯)
│   │   ├── DashboardPage.tsx      # 조직도, 작업 보드, 활동 피드
│   │   ├── CommandCenterPage.tsx  # 계층형 다중 에이전트 제어
│   │   ├── SettingsPage.tsx       # 앱 설정
│   │   └── SetupPage.tsx          # 첫 실행 위자드
│   ├── components/
│   │   ├── dock/                  # AgentSlot, Dock, AgentEditor, FishingCat
│   │   ├── chat/                  # ChatWindow, MessageBubble, StreamingText, PermissionDialog
│   │   ├── group-chat/            # GroupChatWindow, ParticipantBar
│   │   ├── dashboard/             # OrgChart, TaskBoard, ActivityFeed, SetupWizard
│   │   ├── command-center/        # MiniChatPane, CommandCenterInput
│   │   └── theme/                 # ThemeToggle
│   ├── stores/                    # Zustand 스토어 (agent, conversation, activity, task, settings, ...)
│   ├── hooks/                     # useChat, useGroupChat, useMultiChat, useI18n, useKeyboardShortcuts
│   ├── contexts/                  # ThemeContext
│   └── utils/
│       ├── avatar.ts              # DiceBear 아바타 생성
│       ├── cat-avatar.ts          # 고양이 품종 비주얼 시스템
│       ├── i18n.ts                # 번역 로더
│       └── locales/               # ko, en, ja, zh 번역 파일
└── shared/
    ├── types.ts                   # 50+ 공유 TypeScript 인터페이스
    └── constants.ts               # 15개 내장 역할 템플릿
```

### 동작 방식

```
사용자 메시지
    ↓
[ Session Manager ] ─── spawn ──→ claude -p --output-format stream-json
    ↓                                        ↓
  스트림 파싱 ←── stdout JSON 이벤트 ────────┘
    ↓
  응답에 [DELEGATE] 블록 있음?
    ├─ Yes → [ Delegation Manager ] → 하위 에이전트 실행 → 결과 수집 → 종합
    └─ No  → 채팅에 응답 표시

에러 발생?
    → [ Error Recovery ] → 상위자에게 보고 → 필요시 에스컬레이션 → 자가복구 또는 재생성

프로세스 멈춤?
    → [ Process Watchdog ] → 타임아웃 후 종료 → 백업 총괄에게 장애조치
```

**의존성 아키텍처** (순환 의존성 없음):
```
session-manager ──→ delegation-manager   (콜백 주입)
                ──→ error-recovery       (콜백 주입)
                ──→ process-watchdog     (콜백 주입)
```

### Claude CLI 연동

각 에이전트는 다음과 같이 Claude CLI 프로세스를 실행합니다:
```bash
claude -p --output-format stream-json --verbose --include-partial-messages \
  --model {model} --max-turns {turns} --permission-mode {mode} \
  [--system-prompt "..."] [--mcp-config /path/to/mcp.json] "user message"
```

- 에이전트별 독립 `CLAUDE_CONFIG_DIR`
- MCP 설정 병합: 글로벌 + 팀(팀장) + 에이전트
- 퍼미션 모드: `default`, `allowAll`, `acceptEdits`, `plan`, `bypassPermissions`

### 개발

```bash
pnpm dev          # 개발 서버 (핫 리로드)
pnpm typecheck    # TypeScript 타입 체크 (tsconfig 3종)
pnpm lint         # ESLint (0 에러, 0 경고)
pnpm format       # Prettier 자동 포맷
pnpm build        # 프로덕션 빌드 (전 플랫폼)
```

### 라이선스

MIT
