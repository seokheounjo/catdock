import { app, BrowserWindow, screen, Tray, Menu, nativeImage, dialog, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { registerIpcHandlers, setWindowFunctions } from './ipc/handlers'
import { cleanup as cleanupSessions } from './services/session-manager'
import { cleanup as cleanupConversations } from './services/conversation-manager'
import {
  seedDirectorIfEmpty,
  migrateHierarchyIfNeeded,
  migrateSystemPrompts,
  detectProjectRoot
} from './services/default-agents'
import { cleanupExpiredAgents } from './services/dynamic-agent-manager'
import * as agentManager from './services/agent-manager'
import * as store from './services/store'
import { cleanStaleTasks } from './services/store'
import {
  checkClaudeCli,
  installClaudeCli,
  checkNodeInstalled,
  checkForCliUpdate,
  CliCheckResult
} from './services/cli-builder'
import { startPermissionServer, stopPermissionServer } from './services/permission-server'
import { startWatchdog, stopWatchdog } from './services/process-watchdog'
import { startMonitoring, stopMonitoring } from './services/monitoring-loop'
import { setDockResizeCallback } from './services/delegation-manager'

// ★ GPU 비활성화 → transparent: true 윈도우 크래시 방지
app.disableHardwareAcceleration()

// ── 테마에 따른 창 배경색 ──
function getWindowBgColor(): string {
  try {
    const settings = store.getSettings()
    const mode = settings.theme?.mode ?? 'system'
    return mode === 'light' ? '#f5f5fa' : '#1a1a2e'
  } catch {
    return '#1a1a2e'
  }
}

// ★ 디버깅용 CDP 포트 (dev 모드에서만)
if (process.argv.includes('--cdp')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // 두 번째 인스턴스 → 즉시 종료 (다이얼로그는 첫 번째 인스턴스가 표시)
  app.quit()
}

// ── References ──
let dockWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let creatingDock = false // browser-window-created race condition 방지용
const chatWindows = new Map<string, BrowserWindow>()
const groupChatWindows = new Map<string, BrowserWindow>()
let editorWindow: BrowserWindow | null = null
let conversationCreatorWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let commandCenterWindow: BrowserWindow | null = null
let setupWindow: BrowserWindow | null = null

// ── Setup Wizard ──
export function createSetupWindow(): BrowserWindow {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show()
    setupWindow.focus()
    return setupWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  setupWindow = new BrowserWindow({
    width: 600,
    height: 650,
    x: Math.round(workArea.x + (workArea.width - 600) / 2),
    y: Math.round(workArea.y + (workArea.height - 650) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(setupWindow, '/setup')
  setupWindow.on('closed', () => {
    setupWindow = null
    ensureDockVisible()
  })
  return setupWindow
}

// ── Dock ──
export function createDockWindow(): BrowserWindow {
  if (dockWindow && !dockWindow.isDestroyed()) {
    dockWindow.show()
    return dockWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  // 에이전트 수 기반 초기 너비 계산 (버튼 3개 패딩 200px)
  const count = agentManager.listAgents().length
  const gap = DOCK_SIZES[currentDockSize].agentGap
  const w = Math.max(300, Math.min(count * gap + 200, workArea.width - 40))
  const h = getDockHeight()

  // ★ 플래그 설정 → browser-window-created에서 dock 식별용
  creatingDock = true
  dockWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: workArea.y + workArea.height - h,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true, // ★ floating 레벨은 show 후 setAlwaysOnTop에서 설정
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  creatingDock = false

  loadRoute(dockWindow, '/dock')
  dockWindow.setAlwaysOnTop(true)

  // ★ 닫기 무조건 차단 — isQuitting 체크 없음
  // 종료할 때는 destroy()를 직접 호출
  dockWindow.on('close', (e) => {
    e.preventDefault()
  })

  dockWindow.on('closed', () => {
    dockWindow = null
  })

  // 렌더러 크래시 시 자동 재생성
  dockWindow.webContents.on('render-process-gone', () => {
    dockWindow = null
    setTimeout(createDockWindow, 500)
  })

  return dockWindow
}

// ── Dock 크기 프리셋 ──
// ★ height는 호버 애니메이션 headroom(25px) 포함 — translateY(-14px) + scale(1.12)
const DOCK_SIZES = {
  small: { height: 115, slotSize: 40, agentGap: 80 },
  medium: { height: 155, slotSize: 48, agentGap: 110 },
  large: { height: 195, slotSize: 64, agentGap: 140 }
} as const

let currentDockSize: import('../shared/types').DockSize = 'medium'
let dockExpanded = false
const DOCK_HEIGHT_EXPANDED = 350

function getDockHeight(): number {
  return DOCK_SIZES[currentDockSize].height
}

export function resizeDock(agentCount: number): void {
  if (!dockWindow || dockWindow.isDestroyed()) return
  const { workArea } = screen.getPrimaryDisplay()
  const maxW = workArea.width - 40

  // 에이전트가 많으면 자동으로 사이즈 축소 (사용자 설정보다 우선)
  let effectiveSize = currentDockSize
  const sizes: Array<import('../shared/types').DockSize> = ['large', 'medium', 'small']
  for (const size of sizes) {
    effectiveSize = size
    const gap = DOCK_SIZES[size].agentGap
    if (agentCount * gap + 200 <= maxW) break
  }

  // 축소해도 넘치면 small gap을 더 줄인 밀집 모드 사용
  const gap = DOCK_SIZES[effectiveSize].agentGap
  let neededW = agentCount * gap + 200
  let finalGap = gap

  if (neededW > maxW && effectiveSize === 'small') {
    // 밀집 모드 — gap을 에이전트 수에 맞게 계산
    finalGap = Math.max(40, Math.floor((maxW - 200) / agentCount))
    neededW = agentCount * finalGap + 140
  }

  const newW = Math.max(150, Math.min(neededW, maxW))
  const h = dockExpanded ? DOCK_HEIGHT_EXPANDED : DOCK_SIZES[effectiveSize].height

  dockWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - newW) / 2),
    y: workArea.y + workArea.height - h,
    width: newW,
    height: h
  })

  // 렌더러에 밀집 모드 알림 (gap 정보 전달)
  if (effectiveSize !== currentDockSize || finalGap !== gap) {
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('dock:density-changed', { size: effectiveSize, gap: finalGap, agentCount })
    )
  }
}

export function setDockSize(size: import('../shared/types').DockSize): void {
  currentDockSize = size
  if (!dockWindow || dockWindow.isDestroyed()) return
  const count = agentManager.listAgents().length
  resizeDock(count)
  // 렌더러에 알림
  BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('dock:size-changed', size))
}

export function setDockExpanded(expanded: boolean): void {
  if (!dockWindow || dockWindow.isDestroyed()) return
  dockExpanded = expanded
  const bounds = dockWindow.getBounds()
  const { workArea } = screen.getPrimaryDisplay()
  const h = expanded ? DOCK_HEIGHT_EXPANDED : getDockHeight()
  dockWindow.setBounds({
    x: bounds.x,
    y: workArea.y + workArea.height - h,
    width: bounds.width,
    height: h
  })
}

// ── Chat ──
export function createChatWindow(agentId: string, agentName: string): BrowserWindow {
  const existing = chatWindows.get(agentId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    backgroundColor: getWindowBgColor(),
    title: `Chat - ${agentName}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  chatWindows.set(agentId, win)
  loadRoute(win, `/chat/${agentId}`)

  win.on('closed', () => {
    chatWindows.delete(agentId)
    ensureDockVisible()
  })
  return win
}

export function closeAllChatWindows(): void {
  for (const [, w] of chatWindows) {
    if (!w.isDestroyed()) w.destroy()
  }
  chatWindows.clear()
}

// ── Editor ──
export function createEditorWindow(agentId?: string): BrowserWindow {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.show()
    editorWindow.focus()
    return editorWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  editorWindow = new BrowserWindow({
    width: 520,
    height: 700,
    x: Math.round(workArea.x + (workArea.width - 520) / 2),
    y: Math.round(workArea.y + (workArea.height - 700) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(editorWindow, agentId ? `/editor/${agentId}` : '/editor')
  editorWindow.on('closed', () => {
    editorWindow = null
    ensureDockVisible()
  })
  return editorWindow
}

export function closeEditorWindow(): void {
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.close()
  editorWindow = null
}

// ── Group Chat ──
export function createGroupChatWindow(conversationId: string, name: string): BrowserWindow {
  const existing = groupChatWindows.get(conversationId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }

  const win = new BrowserWindow({
    width: 650,
    height: 750,
    minWidth: 450,
    minHeight: 550,
    frame: false,
    backgroundColor: getWindowBgColor(),
    title: `Group - ${name}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  groupChatWindows.set(conversationId, win)
  loadRoute(win, `/group-chat/${conversationId}`)

  win.on('closed', () => {
    groupChatWindows.delete(conversationId)
    ensureDockVisible()
  })
  return win
}

export function createConversationCreatorWindow(): BrowserWindow {
  if (conversationCreatorWindow && !conversationCreatorWindow.isDestroyed()) {
    conversationCreatorWindow.show()
    conversationCreatorWindow.focus()
    return conversationCreatorWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  conversationCreatorWindow = new BrowserWindow({
    width: 460,
    height: 520,
    x: Math.round(workArea.x + (workArea.width - 460) / 2),
    y: Math.round(workArea.y + (workArea.height - 520) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(conversationCreatorWindow, '/new-conversation')
  conversationCreatorWindow.on('closed', () => {
    conversationCreatorWindow = null
    ensureDockVisible()
  })
  return conversationCreatorWindow
}

export function closeAllGroupChatWindows(): void {
  for (const [, w] of groupChatWindows) {
    if (!w.isDestroyed()) w.destroy()
  }
  groupChatWindows.clear()
}

// ── Settings ──
let settingsWindow: BrowserWindow | null = null

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  settingsWindow = new BrowserWindow({
    width: 300,
    height: 420,
    x: Math.round(workArea.x + (workArea.width - 300) / 2),
    y: Math.round(workArea.y + (workArea.height - 420) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(settingsWindow, '/settings')
  settingsWindow.on('closed', () => {
    settingsWindow = null
    ensureDockVisible()
  })
  return settingsWindow
}

// ── Dashboard ──
export function createDashboardWindow(): BrowserWindow {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show()
    dashboardWindow.focus()
    return dashboardWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    x: Math.round(workArea.x + (workArea.width - 1200) / 2),
    y: Math.round(workArea.y + (workArea.height - 800) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    title: 'Virtual Company Dashboard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(dashboardWindow, '/dashboard')
  dashboardWindow.on('closed', () => {
    dashboardWindow = null
    ensureDockVisible()
  })
  return dashboardWindow
}

// ── Command Center ──
export function createCommandCenterWindow(): BrowserWindow {
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) {
    commandCenterWindow.show()
    commandCenterWindow.focus()
    return commandCenterWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  commandCenterWindow = new BrowserWindow({
    width: 1400,
    height: 850,
    minWidth: 1000,
    minHeight: 600,
    x: Math.round(workArea.x + (workArea.width - 1400) / 2),
    y: Math.round(workArea.y + (workArea.height - 850) / 2),
    frame: false,
    backgroundColor: getWindowBgColor(),
    title: 'Command Center',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  loadRoute(commandCenterWindow, '/command-center')
  commandCenterWindow.on('closed', () => {
    commandCenterWindow = null
    ensureDockVisible()
  })
  return commandCenterWindow
}

// ── Dock 복원 ──
function ensureDockVisible(): void {
  if (isQuitting) return
  if (!dockWindow || dockWindow.isDestroyed()) {
    createDockWindow()
  } else {
    // ★ Windows에서 마지막 taskbar 윈도우 닫힐 때 독이 숨겨지는 문제 방지
    dockWindow.setAlwaysOnTop(true)
    dockWindow.showInactive()
  }
  // ★ Windows 타이밍 문제 대비 — 약간의 딜레이 후 재확인
  setTimeout(() => {
    if (!isQuitting && dockWindow && !dockWindow.isDestroyed()) {
      dockWindow.setAlwaysOnTop(true)
      dockWindow.showInactive()
    }
  }, 200)
}

// ★ 독 윈도우 식별 — IPC 핸들러에서 독 닫기 방지용
export function isDockWindow(win: BrowserWindow): boolean {
  return win === dockWindow
}

// ── 완전 종료 (트레이 Quit 전용) ──
function forceQuit(): void {
  isQuitting = true
  stopWatchdog()
  stopMonitoring()
  cleanupSessions()
  cleanupConversations()
  stopPermissionServer()

  // 모든 채팅/에디터/그룹채팅 윈도우 destroy
  closeAllChatWindows()
  closeAllGroupChatWindows()
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.destroy()
  editorWindow = null
  if (conversationCreatorWindow && !conversationCreatorWindow.isDestroyed())
    conversationCreatorWindow.destroy()
  conversationCreatorWindow = null
  if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.destroy()
  dashboardWindow = null
  if (commandCenterWindow && !commandCenterWindow.isDestroyed()) commandCenterWindow.destroy()
  commandCenterWindow = null
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy()
  settingsWindow = null

  // ★ dock은 destroy()로 강제 파괴 (close는 항상 차단되므로)
  if (dockWindow && !dockWindow.isDestroyed()) dockWindow.destroy()
  dockWindow = null

  app.quit()
}

// ── Helpers ──
function loadRoute(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function createTray(): void {
  try {
    const iconPath = join(__dirname, '../../resources/icon.png')
    let img = nativeImage.createFromPath(iconPath)
    if (img.isEmpty()) {
      img = nativeImage.createFromBuffer(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==',
          'base64'
        )
      )
    }
    tray = new Tray(img.resize({ width: 16, height: 16 }))
    tray.setToolTip('Virtual Company')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Dock', click: () => ensureDockVisible() },
        { type: 'separator' },
        { label: 'Quit', click: () => forceQuit() }
      ])
    )
    tray.on('double-click', () => ensureDockVisible())
  } catch (e) {
    console.error('Tray:', e)
  }
}

// ── CLI 체크 + 안내 ──
let cliCheckResult: CliCheckResult | null = null

async function checkCliAndNotify(): Promise<void> {
  cliCheckResult = checkClaudeCli()

  if (cliCheckResult.installed) {
    console.log(`[cli-check] Claude Code CLI v${cliCheckResult.version} (${cliCheckResult.path})`)
    return
  }

  console.warn(`[cli-check] ${cliCheckResult.error}`)

  // Node.js/npm이 있으면 자동 설치 버튼 제공
  const nodeCheck = checkNodeInstalled()
  const hasNode = nodeCheck.installed

  const buttons = hasNode
    ? ['자동 설치 (권장)', '설치 페이지 열기', '나중에 설치']
    : ['설치 페이지 열기', '나중에 설치']

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Claude Code CLI 미설치',
    message: 'Claude Code CLI가 설치되지 않았습니다.',
    detail: [
      'Virtual Company는 Claude Code CLI를 사용하여 에이전트와 대화합니다.',
      '',
      hasNode
        ? `Node.js ${nodeCheck.version} 감지됨 — "자동 설치"를 누르면 바로 설치합니다.`
        : 'Node.js가 설치되지 않았습니다. 먼저 Node.js를 설치한 후 CLI를 설치해주세요.',
      '',
      '수동 설치:',
      '  npm install -g @anthropic-ai/claude-code',
      '',
      'CLI 없이도 앱을 둘러볼 수 있습니다.'
    ].join('\n'),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  })

  if (hasNode && result.response === 0) {
    // 자동 설치
    const installResult = await dialog.showMessageBox({
      type: 'info',
      title: 'Claude Code CLI 설치',
      message: '설치를 시작합니다...',
      detail:
        'npm install -g @anthropic-ai/claude-code 실행 중...\n\n이 작업은 1~2분 정도 걸릴 수 있습니다.',
      buttons: ['확인'],
      noLink: true
    })
    if (installResult.response === 0) {
      const res = await installClaudeCli()
      if (res.success) {
        cliCheckResult = checkClaudeCli()
        await dialog.showMessageBox({
          type: 'info',
          title: '설치 완료',
          message: res.message,
          detail: '이제 에이전트와 대화할 수 있습니다!',
          buttons: ['확인']
        })
      } else {
        await dialog.showMessageBox({
          type: 'error',
          title: '설치 실패',
          message: res.message,
          detail: '터미널에서 직접 설치해주세요:\nnpm install -g @anthropic-ai/claude-code',
          buttons: ['확인']
        })
      }
    }
  } else if (hasNode ? result.response === 1 : result.response === 0) {
    shell.openExternal('https://docs.anthropic.com/en/docs/claude-code/overview')
  }
}

if (gotLock) {
  // ── Second Instance Handler ──
  app.on('second-instance', () => {
    // 첫 번째 인스턴스에서 다이얼로그 표시
    dialog
      .showMessageBox({
        type: 'question',
        title: 'Virtual Company',
        message: '이미 실행 중인 인스턴스가 있습니다.',
        detail: '기존 창을 사용하거나, 새로 시작할 수 있습니다.',
        buttons: ['기존 창 사용', '새로 시작', '취소'],
        defaultId: 0,
        cancelId: 2,
        noLink: true
      })
      .then(({ response }) => {
        if (response === 0) {
          // "기존 창 사용" → 독 표시 + 포커스
          ensureDockVisible()
          if (dockWindow && !dockWindow.isDestroyed()) {
            dockWindow.focus()
          }
        } else if (response === 1) {
          // "새로 시작"
          if (is.dev) {
            // dev 모드: electron-vite가 프로세스를 관리하므로 소프트 리스타트
            // 모든 서브윈도우 닫고 독 재생성
            closeAllChatWindows()
            closeAllGroupChatWindows()
            if (editorWindow && !editorWindow.isDestroyed()) editorWindow.destroy()
            editorWindow = null
            if (conversationCreatorWindow && !conversationCreatorWindow.isDestroyed())
              conversationCreatorWindow.destroy()
            conversationCreatorWindow = null
            if (dashboardWindow && !dashboardWindow.isDestroyed()) dashboardWindow.destroy()
            dashboardWindow = null
            if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy()
            settingsWindow = null
            if (setupWindow && !setupWindow.isDestroyed()) setupWindow.destroy()
            setupWindow = null
            // 커맨드 센터도 정리
            if (commandCenterWindow && !commandCenterWindow.isDestroyed())
              commandCenterWindow.destroy()
            commandCenterWindow = null
            // 독 재생성
            if (dockWindow && !dockWindow.isDestroyed()) dockWindow.destroy()
            dockWindow = null
            createDockWindow()
            // 독 크기 재조정
            setTimeout(() => {
              const agentCount = agentManager.listAgents().length
              if (agentCount > 0) resizeDock(agentCount)
            }, 500)
          } else {
            // 프로덕션: 앱 재실행
            app.relaunch()
            forceQuit()
          }
        }
        // response === 2 "취소" → 아무것도 안 함
      })
  })

  // ── App ──
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.virtual-company')

    // ★ 프로젝트 루트 설정 — 프로젝트별 독립 저장소의 핵심
    store.setProjectRoot(detectProjectRoot())

    // ★ dock 생성 중이면 optimizer 제외 (race condition 방지)
    app.on('browser-window-created', (_, w) => {
      if (!creatingDock) {
        optimizer.watchWindowShortcuts(w)
      }
    })

    registerIpcHandlers()
    setWindowFunctions({
      createChatWindow,
      createEditorWindow,
      closeEditorWindow,
      createGroupChatWindow,
      createConversationCreatorWindow,
      createDashboardWindow,
      createCommandCenterWindow,
      createSettingsWindow,
      resizeDock,
      isDockWindow,
      forceQuit,
      setDockExpanded,
      setDockSize
    })

    // 위임 시 에이전트 동적 생성 후 독 크기 자동 조정
    setDockResizeCallback(resizeDock)

    // 퍼미션 서버 시작
    startPermissionServer().catch((err) => {
      console.error('[permission-server] 시작 실패:', err)
    })

    // 저장된 독 크기 복원
    const savedSettings = store.getSettings()
    if (savedSettings.dockSize && DOCK_SIZES[savedSettings.dockSize]) {
      currentDockSize = savedSettings.dockSize
    }

    // 총괄 1명 체제 — 기존 총괄 유지 또는 없으면 시드
    seedDirectorIfEmpty()
    migrateHierarchyIfNeeded()
    migrateSystemPrompts()
    const staleRemoved = cleanStaleTasks()
    if (staleRemoved > 0) console.log(`[startup] 오래된 태스크 ${staleRemoved}건 정리`)

    // 프로세스 워치독 + 모니터링 루프 시작
    startWatchdog()
    startMonitoring()

    createDockWindow()

    // ★ 첫 실행이면 셋업 위자드 표시, 아니면 CLI 확인
    const settings = store.getSettings()
    if (!settings.setupCompleted) {
      createSetupWindow()
    } else {
      await checkCliAndNotify()
    }

    // 시딩 후 독 크기 조정
    setTimeout(() => {
      const count = agentManager.listAgents().length
      if (count > 0) resizeDock(count)
    }, 500)
    setTimeout(createTray, 1000)

    // ★ 2초마다 독 생존 확인 (안전장치)
    setInterval(() => {
      if (!isQuitting && (!dockWindow || dockWindow.isDestroyed())) {
        createDockWindow()
      }
    }, 2000)

    // ★ 60초마다 만료된 임시 에이전트 정리
    setInterval(() => {
      if (!isQuitting) cleanupExpiredAgents()
    }, 60000)

    // ★ CLI 업데이트 체크 — 시작 10초 후 1회, 이후 24시간마다
    setTimeout(() => {
      if (isQuitting) return
      try {
        const result = checkForCliUpdate()
        if (result.updateAvailable && result.latestVersion) {
          console.log(
            `[cli-update] 업데이트 가능: ${result.currentVersion} → ${result.latestVersion}`
          )
          BrowserWindow.getAllWindows().forEach((w) =>
            w.webContents.send('cli:update-available', {
              currentVersion: result.currentVersion,
              latestVersion: result.latestVersion
            })
          )
        }
      } catch (err) {
        console.warn('[cli-update] 체크 실패:', err)
      }
    }, 10000)
    setInterval(
      () => {
        if (isQuitting) return
        try {
          const result = checkForCliUpdate()
          if (result.updateAvailable && result.latestVersion) {
            BrowserWindow.getAllWindows().forEach((w) =>
              w.webContents.send('cli:update-available', {
                currentVersion: result.currentVersion,
                latestVersion: result.latestVersion
              })
            )
          }
        } catch {
          /* CLI 업데이트 확인 실패 무시 */
        }
      },
      24 * 60 * 60 * 1000
    )

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createDockWindow()
    })
  })

  // ★ 앱 종료 완전 차단 — forceQuit()으로만 종료 가능
  app.on('window-all-closed', () => {
    if (!isQuitting) ensureDockVisible()
  })

  app.on('will-quit', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      ensureDockVisible()
    }
  })

  app.on('before-quit', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      ensureDockVisible()
    }
  })
} // else (gotLock)
