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

## 프론트엔드 디자인 가이드

프론트엔드 UI/페이지를 구현할 때 반드시 아래 원칙과 리소스를 참고한다.
**목표: "실제 디자이너가 만든 듯한" 퀄리티. AI가 만든 티가 나지 않도록.**

### 디자인 원칙

1. **타이포그래피 대비를 극단적으로** — 제목 48~72px 굵게, 본문 16~18px 가볍게. 한 화면에 2~3가지 사이즈만.
2. **컬러는 최소한으로** — 흑백/다크 기반 + 포인트 1색(accent). 보라-파란 그라디언트, 네온 글로우 절대 금지.
3. **여백을 과감하게** — 섹션 간 120~200px 여백. 빈 공간을 두려워하지 않는다.
4. **비대칭 레이아웃** — 좌우 50:50 균등 배치를 피한다. 60:40, 70:30 등 변화를 준다.
5. **의미 없는 장식 금지** — 그리드 배경, 파티클, 오브, 플로팅 도형은 목적 없으면 사용하지 않는다.
6. **실제 콘텐츠 우선** — 앱 스크린샷, 실제 코드 예시, 제품 목업을 사용한다. 추상적 일러스트 남용 금지.
7. **마이크로 인터랙션은 절제** — 스크롤 애니메이션은 핵심 섹션 1~2개에만 적용.

### 필수 참고 리소스 (모두 무료)

**UI 컴포넌트 — 복사-붙여넣기로 사용:**
- **Magic UI** (magicui.design) — 150+ 애니메이션 컴포넌트. Bento Grid, Animated Beam, Safari 목업, Hero Video Dialog, Shimmer Button, Number Ticker, Marquee 등. shadcn 호환. `npx shadcn@latest add "https://magicui.design/r/{component}"`
- **Aceternity UI** (ui.aceternity.com) — 200+ 컴포넌트. Hero Parallax, 3D Card, Lamp Effect, Macbook Scroll, Floating Dock, Aurora Background. Hero/Pricing/Testimonial 섹션 블록 포함.
- **shadcn/ui** (ui.shadcn.com) — 기본 UI 컴포넌트 (Button, Card, Dialog, Table, Tabs, Toast 등).
- **HyperUI** (hyperui.dev) — Tailwind 전용 마케팅 컴포넌트 (CTA, 배너, 블로그 카드, 연락처 폼 등).

**디자인 레퍼런스 — 레이아웃/구조 참고:**
- **Godly.website** — 큐레이션된 고퀄 사이트 모음
- **Landingfolio.com** — 랜딩페이지 패턴 분석
- **saaslandingpage.com** — SaaS 랜딩 레퍼런스
- **벤치마킹 대상**: Linear.app, Raycast.com, Cursor.com, Warp.dev (개발자 도구 사이트)

**폰트:**
- 한글: **Pretendard** (CDN 무료) — `https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css`
- 영문: **Geist** (Vercel 무료), **Inter** (Google Fonts)

**아이콘:**
- **Lucide** (lucide.dev) — 라인 아이콘, React 컴포넌트로 사용

**일러스트/비주얼:**
- **unDraw** (undraw.co) — SVG 일러스트, 색상 커스텀 가능
- **Storyset** (storyset.com) — 애니메이션 일러스트
- **Shots.so** — 목업 생성 (무료 티어)

### 페이지 구현 시 체크리스트

```
□ 레퍼런스 사이트 구조를 먼저 분석했는가?
□ Magic UI / Aceternity UI 컴포넌트 중 재사용할 것이 있는가?
□ 폰트가 Pretendard(한글) + Geist/Inter(영문)로 설정되었는가?
□ 컬러가 3색 이내인가? (배경 + 텍스트 + accent)
□ 섹션 간 여백이 충분한가? (최소 80px, 권장 120px+)
□ 그라디언트/글로우/파티클 등 AI스러운 장식을 제거했는가?
□ 실제 스크린샷 또는 목업을 사용했는가?
□ 모바일 반응형이 적용되었는가?
```

### 랜딩페이지 섹션 구성 (권장 순서)

```
1. Hero — 한 줄 헤드라인 + 서브텍스트 + CTA 버튼 + 앱 스크린샷/목업
2. 로고 클라우드 — 사용 기술 또는 지원 프로바이더 로고
3. 핵심 기능 — Bento Grid 또는 Feature Cards (3~4개)
4. 상세 기능 — 스크린샷 + 텍스트 교차 배치 (비대칭)
5. 사용 흐름 — 단계별 설명 (Timeline 또는 Animated Beam)
6. 후기/신뢰 — Testimonials 또는 Stats
7. CTA — 최종 행동 유도 + 다운로드/시작 버튼
8. Footer — 링크, 소셜, 저작권
```

## 개발 명령어

```bash
pnpm dev          # 개발 서버 실행
pnpm build        # 프로덕션 빌드
pnpm typecheck    # 타입 체크
pnpm lint         # ESLint
```
