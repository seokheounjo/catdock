# Virtual Company

Electron + React + Claude CLI 기반 **가상 회사 시뮬레이터**.
각 에이전트(팀원)는 독립적인 Claude CLI 프로세스로 동작하며, 실제 코드를 읽고 수정할 수 있다.

## 기술 스택

- **Runtime**: Electron 39 (Main + Renderer)
- **Frontend**: React 19, Tailwind CSS 4, Zustand 5
- **Backend**: Node.js (Main process), Claude CLI (`claude -p --output-format stream-json`)
- **Build**: electron-vite, TypeScript 5
- **Storage**: 로컬 JSON 파일 (`%APPDATA%/virtual-company-data/config.json`)

## 디렉토리 구조

```
src/
├── main/                        # Electron Main process
│   ├── index.ts                 # 앱 진입점, 윈도우 관리 (Dock/Chat/Editor)
│   ├── ipc/
│   │   └── handlers.ts          # IPC 핸들러 등록 (agent, session, window 채널)
│   └── services/
│       ├── agent-manager.ts     # 에이전트 CRUD + 런타임 상태 (status, cost)
│       ├── session-manager.ts   # Claude CLI 스폰, 스트림 파싱, 채팅 관리
│       ├── store.ts             # 영속 저장소 (config.json 읽기/쓰기)
│       └── default-agents.ts    # 기본 에이전트 6명 시딩
├── preload/
│   └── index.ts                 # contextBridge API 노출
├── renderer/src/
│   ├── App.tsx                  # 라우팅 (#/dock, #/chat/:id, #/editor)
│   ├── pages/
│   │   ├── DockPage.tsx         # 하단 독 UI
│   │   ├── ChatPage.tsx         # 채팅 윈도우
│   │   └── EditorPage.tsx       # 에이전트 편집기
│   ├── components/
│   │   ├── dock/                # AgentSlot, Dock, AgentEditor, FishingCat
│   │   └── chat/                # ChatWindow, MessageBubble, StreamingText, ChatInput
│   ├── stores/
│   │   ├── agent-store.ts       # Zustand 에이전트 상태
│   │   └── session-store.ts     # Zustand 세션 상태
│   ├── hooks/
│   │   └── useChat.ts           # 채팅 커스텀 훅
│   └── utils/
│       └── avatar.ts            # DiceBear 아바타 생성
└── shared/
    └── types.ts                 # 공유 타입 (AgentConfig, ChatMessage 등)
```

## 핵심 패턴

### IPC 통신
- Main ↔ Renderer: `ipcMain.handle` / `ipcRenderer.invoke`
- 브로드캐스트: `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, data))`
- 채널 네이밍: `agent:list`, `session:send`, `window:open-chat` 등

### Claude CLI 호출
```bash
claude -p --output-format stream-json --verbose --include-partial-messages \
  --model {model} --max-turns 25 --permission-mode acceptEdits \
  [--system-prompt "..."] [-c] "user message"
```
- `cwd`: 에이전트의 `workingDirectory` (이 프로젝트 루트)
- `CLAUDE_CONFIG_DIR`: 에이전트별 독립 config 디렉토리
- `CLAUDECODE` 환경변수 제거하여 nested session 감지 우회

### 상태 관리
- **영속**: `store.ts` → `config.json` (에이전트 설정, 세션 히스토리)
- **런타임**: `agent-manager.ts` → `Map<id, {status, costTotal, sessionId, lastMessage}>`
- **UI**: Zustand store → React 컴포넌트

## 코딩 컨벤션

- **파일명**: kebab-case (`agent-manager.ts`, `ChatPage.tsx`)
- **주석**: 한국어
- **스타일**: Tailwind CSS utility classes
- **타입**: `src/shared/types.ts`에 공유 인터페이스 정의
- **모델 ID**: `claude-sonnet-4-20250514`, `claude-opus-4-20250514`, `claude-haiku-4-5-20251001`

## 개발 명령어

```bash
pnpm dev          # 개발 서버 실행
pnpm build        # 프로덕션 빌드
pnpm typecheck    # 타입 체크
pnpm lint         # ESLint
```
