# Virtual Company

**AI Agent Team Simulator** - Claude CLI 기반 가상 회사 시뮬레이터

[English](#english) | [한국어](#한국어)

---

## English

### Overview

Virtual Company is a desktop application that simulates a company team structure using AI agents. Each agent runs as an independent Claude CLI process and can read, write, and modify real code in your projects.

Agents are organized in a hierarchical structure (Director > Leader > Member) and communicate through individual chats, group conversations, and automated task delegation.

### Key Features

- **Hierarchical Agent Team** - Director, Leaders, and Members with auto-delegation and upward reporting
- **Individual Chat** - One-on-one conversations with each agent, real-time streaming responses
- **Group Chat** - Multi-agent conversations with auto-chain and manual turn modes
- **Command Center** - Monitor and control all agents simultaneously from a single dashboard
- **Task Board** - Kanban-style task management with delegation, priority, and due dates
- **MCP Integration** - Model Context Protocol servers for extending agent capabilities (global, team, per-agent)
- **MCP Health Check** - Automatic monitoring of MCP server connectivity with failure reporting
- **Error Recovery** - Multi-level escalation (Member > Leader > Director) with auto-recovery
- **Process Watchdog** - Heartbeat monitoring, timeout detection, and failover for agents
- **Theme System** - Light/dark/system mode with multi-window sync
- **i18n** - Korean, English, Japanese, Chinese language support
- **Cat-Themed UI** - Animated cat characters and breed-based avatars on the dock

### Screenshots

The dock sits at the bottom of your screen showing all team members:

```
[ Director ]  [ Leader1 ]  [ Leader2 ]  [ Member1 ]  [ Member2 ]  [ Member3 ]
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 39 |
| Frontend | React 19, Tailwind CSS 4, Zustand 5 |
| Backend | Node.js (Main process), Claude CLI |
| Build | electron-vite, TypeScript 5 |
| Storage | Local JSON files |

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

### Build

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### Project Structure

```
src/
├── main/                    # Electron Main process
│   ├── index.ts             # App entry, window management
│   ├── ipc/handlers.ts      # IPC handler registration
│   └── services/
│       ├── agent-manager.ts       # Agent CRUD + runtime state
│       ├── session-manager.ts     # Claude CLI process management
│       ├── conversation-manager.ts # Group chat orchestration
│       ├── store.ts               # Persistent JSON storage
│       ├── mcp-manager.ts         # MCP server config (global/team/agent)
│       ├── mcp-health.ts          # MCP health monitoring
│       ├── monitoring-loop.ts     # Background monitoring (30s cycle)
│       ├── error-recovery.ts      # Multi-level error escalation
│       ├── process-watchdog.ts    # Agent process heartbeat
│       ├── delegation-manager.ts  # Auto task delegation
│       └── ...
├── preload/
│   └── index.ts             # contextBridge API
├── renderer/src/
│   ├── pages/               # DockPage, ChatPage, DashboardPage, CommandCenterPage, ...
│   ├── components/
│   │   ├── dock/            # Agent dock UI, cat animations
│   │   ├── chat/            # Chat window, messages, streaming
│   │   ├── group-chat/      # Group conversation UI
│   │   ├── dashboard/       # Org chart, task board, settings
│   │   └── command-center/  # Multi-agent control panes
│   ├── stores/              # Zustand state management
│   └── utils/               # Avatars, i18n, helpers
└── shared/
    └── types.ts             # Shared TypeScript interfaces
```

### How It Works

1. **Claude CLI Integration** - Each agent spawns a `claude -p --output-format stream-json` process
2. **Real-time Streaming** - Agent responses are streamed to the UI as they are generated
3. **Hierarchy** - Directors assign tasks to Leaders, Leaders delegate to Members
4. **Error Escalation** - If a Member fails, the Leader is notified; if the Leader fails, the Director handles it
5. **MCP Tools** - Agents can use external tools (filesystem, git, web search, etc.) via MCP servers

### Development

```bash
pnpm dev          # Development server
pnpm typecheck    # Type check
pnpm lint         # ESLint
pnpm format       # Prettier
```

### License

MIT

---

## 한국어

### 개요

Virtual Company는 AI 에이전트를 사용하여 회사 팀 구조를 시뮬레이션하는 데스크톱 애플리케이션입니다. 각 에이전트는 독립적인 Claude CLI 프로세스로 동작하며, 실제 코드를 읽고, 쓰고, 수정할 수 있습니다.

에이전트는 계층 구조(총괄 > 팀장 > 팀원)로 조직되며, 개별 채팅, 그룹 대화, 자동 작업 위임을 통해 소통합니다.

### 주요 기능

- **계층형 에이전트 팀** - 총괄, 팀장, 팀원 구조로 자동 위임 및 상향 보고
- **개별 채팅** - 각 에이전트와 1:1 대화, 실시간 스트리밍 응답
- **그룹 채팅** - 다중 에이전트 대화, 자동 체이닝 및 수동 턴 모드
- **커맨드 센터** - 모든 에이전트를 하나의 대시보드에서 동시에 모니터링/제어
- **작업 보드** - 칸반 스타일 작업 관리, 위임/우선순위/마감일 지원
- **MCP 통합** - 에이전트 능력 확장을 위한 MCP 서버 (글로벌, 팀, 개별 에이전트)
- **MCP 헬스체크** - MCP 서버 연결 상태 자동 모니터링 및 장애 보고
- **에러 복구** - 다단계 에스컬레이션 (팀원 > 팀장 > 총괄) 자동 복구
- **프로세스 워치독** - 하트비트 모니터링, 타임아웃 감지, 에이전트 페일오버
- **테마 시스템** - 라이트/다크/시스템 모드, 멀티 윈도우 동기화
- **다국어 지원** - 한국어, 영어, 일본어, 중국어
- **고양이 테마 UI** - 독에 애니메이션 고양이 캐릭터와 품종별 아바타

### 기술 스택

| 계층 | 기술 |
|------|------|
| 런타임 | Electron 39 |
| 프론트엔드 | React 19, Tailwind CSS 4, Zustand 5 |
| 백엔드 | Node.js (Main process), Claude CLI |
| 빌드 | electron-vite, TypeScript 5 |
| 저장소 | 로컬 JSON 파일 |

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

### 빌드

```bash
# Windows
pnpm build:win

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### 프로젝트 구조

```
src/
├── main/                    # Electron Main 프로세스
│   ├── index.ts             # 앱 진입점, 윈도우 관리
│   ├── ipc/handlers.ts      # IPC 핸들러 등록
│   └── services/
│       ├── agent-manager.ts       # 에이전트 CRUD + 런타임 상태
│       ├── session-manager.ts     # Claude CLI 프로세스 관리
│       ├── conversation-manager.ts # 그룹 채팅 오케스트레이션
│       ├── store.ts               # JSON 영속 저장소
│       ├── mcp-manager.ts         # MCP 서버 설정 (글로벌/팀/개별)
│       ├── mcp-health.ts          # MCP 헬스 모니터링
│       ├── monitoring-loop.ts     # 백그라운드 모니터링 (30초 주기)
│       ├── error-recovery.ts      # 다단계 에러 에스컬레이션
│       ├── process-watchdog.ts    # 에이전트 프로세스 하트비트
│       ├── delegation-manager.ts  # 자동 작업 위임
│       └── ...
├── preload/
│   └── index.ts             # contextBridge API
├── renderer/src/
│   ├── pages/               # DockPage, ChatPage, DashboardPage, CommandCenterPage, ...
│   ├── components/
│   │   ├── dock/            # 에이전트 독 UI, 고양이 애니메이션
│   │   ├── chat/            # 채팅 윈도우, 메시지, 스트리밍
│   │   ├── group-chat/      # 그룹 대화 UI
│   │   ├── dashboard/       # 조직도, 작업 보드, 설정
│   │   └── command-center/  # 다중 에이전트 제어 패널
│   ├── stores/              # Zustand 상태 관리
│   └── utils/               # 아바타, i18n, 유틸리티
└── shared/
    └── types.ts             # 공유 TypeScript 인터페이스
```

### 동작 방식

1. **Claude CLI 연동** - 각 에이전트는 `claude -p --output-format stream-json` 프로세스로 실행
2. **실시간 스트리밍** - 에이전트 응답이 생성되는 즉시 UI에 스트리밍
3. **계층 구조** - 총괄이 팀장에게, 팀장이 팀원에게 작업 위임
4. **에러 에스컬레이션** - 팀원 실패 시 팀장에게, 팀장 실패 시 총괄에게 보고
5. **MCP 도구** - 에이전트가 MCP 서버를 통해 외부 도구 (파일시스템, git, 웹 검색 등) 활용

### 개발

```bash
pnpm dev          # 개발 서버 실행
pnpm typecheck    # 타입 체크
pnpm lint         # ESLint
pnpm format       # Prettier
```

### 라이선스

MIT
