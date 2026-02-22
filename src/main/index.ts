import { app, BrowserWindow, screen, Tray, Menu, nativeImage } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'path'
import { registerIpcHandlers, setWindowFunctions } from './ipc/handlers'
import { cleanup as cleanupSessions } from './services/session-manager'
import { cleanup as cleanupConversations } from './services/conversation-manager'
import { seedDefaultAgentsIfEmpty } from './services/default-agents'
import * as agentManager from './services/agent-manager'

// ★ GPU 비활성화 → transparent: true 윈도우 크래시 방지
app.disableHardwareAcceleration()

// ★ 디버깅용 CDP 포트 (dev 모드에서만)
if (process.argv.includes('--cdp')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
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

// ── Dock ──
export function createDockWindow(): BrowserWindow {
  if (dockWindow && !dockWindow.isDestroyed()) {
    dockWindow.show()
    return dockWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  const w = 800
  const h = 130

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

  dockWindow.on('closed', () => { dockWindow = null })

  // 렌더러 크래시 시 자동 재생성
  dockWindow.webContents.on('render-process-gone', () => {
    dockWindow = null
    setTimeout(createDockWindow, 500)
  })

  return dockWindow
}

export function resizeDock(agentCount: number): void {
  if (!dockWindow || dockWindow.isDestroyed()) return
  const newW = Math.max(150, Math.min(agentCount * 110 + 80, 1400))
  const { workArea } = screen.getPrimaryDisplay()
  dockWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - newW) / 2),
    y: workArea.y + workArea.height - 130,
    width: newW, height: 130
  })
}

// ── Chat ──
export function createChatWindow(agentId: string, agentName: string): BrowserWindow {
  const existing = chatWindows.get(agentId)
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return existing }

  const win = new BrowserWindow({
    width: 520, height: 700, minWidth: 400, minHeight: 500,
    frame: false, backgroundColor: '#1a1a2e',
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
  for (const [, w] of chatWindows) { if (!w.isDestroyed()) w.destroy() }
  chatWindows.clear()
}

// ── Editor ──
export function createEditorWindow(agentId?: string): BrowserWindow {
  if (editorWindow && !editorWindow.isDestroyed()) { editorWindow.show(); editorWindow.focus(); return editorWindow }

  const { workArea } = screen.getPrimaryDisplay()
  editorWindow = new BrowserWindow({
    width: 460, height: 620,
    x: Math.round(workArea.x + (workArea.width - 460) / 2),
    y: Math.round(workArea.y + (workArea.height - 620) / 2),
    frame: false, backgroundColor: '#1e1e30', resizable: false, alwaysOnTop: true,
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
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return existing }

  const win = new BrowserWindow({
    width: 650, height: 750, minWidth: 450, minHeight: 550,
    frame: false, backgroundColor: '#1a1a2e',
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
    width: 460, height: 520,
    x: Math.round(workArea.x + (workArea.width - 460) / 2),
    y: Math.round(workArea.y + (workArea.height - 520) / 2),
    frame: false, backgroundColor: '#1e1e30', resizable: false, alwaysOnTop: true,
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
  for (const [, w] of groupChatWindows) { if (!w.isDestroyed()) w.destroy() }
  groupChatWindows.clear()
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
  cleanupSessions()
  cleanupConversations()

  // 모든 채팅/에디터/그룹채팅 윈도우 destroy
  closeAllChatWindows()
  closeAllGroupChatWindows()
  if (editorWindow && !editorWindow.isDestroyed()) editorWindow.destroy()
  editorWindow = null
  if (conversationCreatorWindow && !conversationCreatorWindow.isDestroyed()) conversationCreatorWindow.destroy()
  conversationCreatorWindow = null

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
      img = nativeImage.createFromBuffer(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==', 'base64'))
    }
    tray = new Tray(img.resize({ width: 16, height: 16 }))
    tray.setToolTip('Virtual Company')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Dock', click: () => ensureDockVisible() },
      { type: 'separator' },
      { label: 'Quit', click: () => forceQuit() }
    ]))
    tray.on('double-click', () => ensureDockVisible())
  } catch (e) { console.error('Tray:', e) }
}

// ── App ──
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.virtual-company')

  // ★ dock 생성 중이면 optimizer 제외 (race condition 방지)
  app.on('browser-window-created', (_, w) => {
    if (!creatingDock) {
      optimizer.watchWindowShortcuts(w)
    }
  })

  registerIpcHandlers()
  setWindowFunctions({ createChatWindow, createEditorWindow, closeEditorWindow, createGroupChatWindow, createConversationCreatorWindow, resizeDock, isDockWindow })
  seedDefaultAgentsIfEmpty()
  createDockWindow()
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
