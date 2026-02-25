// 윈도우 생성 및 관리 — index.ts에서 분리
import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import * as agentManager from './services/agent-manager'
import * as store from './services/store'
import { DockSize } from '../shared/types'

// ── 공통 webPreferences ──

function defaultWebPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false
  }
}

// ── 테마에 따른 창 배경색 ──

export function getWindowBgColor(): string {
  try {
    const settings = store.getSettings()
    const mode = settings.theme?.mode ?? 'system'
    return mode === 'light' ? '#f5f5fa' : '#1a1a2e'
  } catch {
    return '#1a1a2e'
  }
}

// ── 라우트 로드 ──

export function loadRoute(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

// ── 화면 중앙 좌표 계산 ──

function centerBounds(width: number, height: number) {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  }
}

// ── 윈도우 참조 ──

let dockWindow: BrowserWindow | null = null
const chatWindows = new Map<string, BrowserWindow>()
const groupChatWindows = new Map<string, BrowserWindow>()
let editorWindow: BrowserWindow | null = null
let conversationCreatorWindow: BrowserWindow | null = null
let dashboardWindow: BrowserWindow | null = null
let commandCenterWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let setupWindow: BrowserWindow | null = null
let creatingDock = false

// ── Dock 크기 프리셋 ──

export const DOCK_SIZES = {
  small: { height: 115, slotSize: 40, agentGap: 80 },
  medium: { height: 155, slotSize: 48, agentGap: 110 },
  large: { height: 195, slotSize: 64, agentGap: 140 }
} as const

let currentDockSize: DockSize = 'medium'
let dockExpanded = false
const DOCK_HEIGHT_EXPANDED = 350

function getDockHeight(): number {
  return DOCK_SIZES[currentDockSize].height
}

// ── Dock 복원 ──

export function ensureDockVisible(): void {
  if (!dockWindow || dockWindow.isDestroyed()) {
    createDockWindow()
  } else {
    dockWindow.setAlwaysOnTop(true)
    dockWindow.showInactive()
  }
  setTimeout(() => {
    if (dockWindow && !dockWindow.isDestroyed()) {
      dockWindow.setAlwaysOnTop(true)
      dockWindow.showInactive()
    }
  }, 200)
}

// ── Dock 윈도우 식별 ──

export function isDockWindow(win: BrowserWindow): boolean {
  return win === dockWindow
}

export function getDockWindow(): BrowserWindow | null {
  return dockWindow
}

export function isCreatingDock(): boolean {
  return creatingDock
}

// ── Setup Wizard ──

export function createSetupWindow(): BrowserWindow {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show()
    setupWindow.focus()
    return setupWindow
  }

  setupWindow = new BrowserWindow({
    ...centerBounds(600, 650),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    webPreferences: defaultWebPreferences()
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
  const count = agentManager.listAgents().length
  const gap = DOCK_SIZES[currentDockSize].agentGap
  const w = Math.max(300, Math.min(count * gap + 200, workArea.width - 40))
  const h = getDockHeight()

  creatingDock = true
  dockWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: workArea.y + workArea.height - h,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: defaultWebPreferences()
  })
  creatingDock = false

  loadRoute(dockWindow, '/dock')
  dockWindow.setAlwaysOnTop(true)

  dockWindow.on('close', (e) => {
    e.preventDefault()
  })
  dockWindow.on('closed', () => {
    dockWindow = null
  })
  dockWindow.webContents.on('render-process-gone', () => {
    dockWindow = null
    setTimeout(createDockWindow, 500)
  })

  return dockWindow
}

// ── Dock 크기 관리 ──

export function resizeDock(agentCount: number): void {
  if (!dockWindow || dockWindow.isDestroyed()) return
  const { workArea } = screen.getPrimaryDisplay()
  const maxW = workArea.width - 40

  // 버튼 영역 (추가/커맨드센터/설정) 고정폭 약 160px
  const buttonsW = 160
  const gap = DOCK_SIZES[currentDockSize].agentGap
  const neededW = agentCount * gap + buttonsW + 40
  // 넘치면 maxW로 제한 — 스크롤로 처리
  const newW = Math.max(150, Math.min(neededW, maxW))
  const h = dockExpanded ? DOCK_HEIGHT_EXPANDED : DOCK_SIZES[currentDockSize].height

  dockWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - newW) / 2),
    y: workArea.y + workArea.height - h,
    width: newW,
    height: h
  })
}

export function setDockSize(size: DockSize): void {
  currentDockSize = size
  if (!dockWindow || dockWindow.isDestroyed()) return
  const count = agentManager.listAgents().length
  resizeDock(count)
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

export function restoreDockSize(savedSize?: DockSize): void {
  if (savedSize && DOCK_SIZES[savedSize]) {
    currentDockSize = savedSize
  }
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
    webPreferences: defaultWebPreferences()
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
  // 기존 창이 있으면 닫고 새로 열기 (다른 에이전트 편집 시 라우트 갱신)
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.close()
    editorWindow = null
  }

  editorWindow = new BrowserWindow({
    ...centerBounds(520, 700),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: defaultWebPreferences()
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
    webPreferences: defaultWebPreferences()
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

  conversationCreatorWindow = new BrowserWindow({
    ...centerBounds(460, 520),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: defaultWebPreferences()
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

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }

  settingsWindow = new BrowserWindow({
    ...centerBounds(300, 420),
    frame: false,
    backgroundColor: getWindowBgColor(),
    resizable: false,
    alwaysOnTop: true,
    webPreferences: defaultWebPreferences()
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
    webPreferences: defaultWebPreferences()
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
    webPreferences: defaultWebPreferences()
  })
  loadRoute(commandCenterWindow, '/command-center')
  commandCenterWindow.on('closed', () => {
    commandCenterWindow = null
    ensureDockVisible()
  })
  return commandCenterWindow
}

// ── 모든 서브 윈도우 닫기 (독 제외) ──

export function destroyAllSubWindows(): void {
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
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.destroy()
  setupWindow = null
}

// ── 독 포함 모든 윈도우 파괴 ──

export function destroyAllWindows(): void {
  destroyAllSubWindows()
  if (dockWindow && !dockWindow.isDestroyed()) dockWindow.destroy()
  dockWindow = null
}
