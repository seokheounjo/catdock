import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } from 'electron'
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

import { discoverAll } from './services/mcp-discovery'
import { discoverAllLocalModels } from './services/llm-discovery'
import * as wm from './window-manager'

// ★ GPU 비활성화 → transparent: true 윈도우 크래시 방지
app.disableHardwareAcceleration()

// ★ 미처리 예외/거부 핸들러 — 앱 크래시 방지
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})

// ★ 디버깅용 CDP 포트 (dev 모드에서만)
if (process.argv.includes('--cdp')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
}

// ── 앱 상태 ──
let tray: Tray | null = null
let isQuitting = false

// ── 완전 종료 (트레이 Quit 전용) ──
function forceQuit(): void {
  isQuitting = true
  stopWatchdog()
  stopMonitoring()
  cleanupSessions()
  cleanupConversations()
  stopPermissionServer()
  wm.destroyAllWindows()
  app.quit()
}

// ── Tray 생성 ──
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
        { label: 'Show Dock', click: () => wm.ensureDockVisible() },
        { type: 'separator' },
        { label: 'Quit', click: () => forceQuit() }
      ])
    )
    tray.on('double-click', () => wm.ensureDockVisible())
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

// ── CLI 업데이트 브로드캐스트 ──
function broadcastCliUpdate(): void {
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
}

if (gotLock) {
  // ── Second Instance Handler ──
  app.on('second-instance', () => {
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
          wm.ensureDockVisible()
          const dock = wm.getDockWindow()
          if (dock && !dock.isDestroyed()) dock.focus()
        } else if (response === 1) {
          if (is.dev) {
            wm.destroyAllSubWindows()
            const dock = wm.getDockWindow()
            if (dock && !dock.isDestroyed()) dock.destroy()
            wm.createDockWindow()
            setTimeout(() => {
              const agentCount = agentManager.listAgents().length
              if (agentCount > 0) wm.resizeDock(agentCount)
            }, 500)
          } else {
            app.relaunch()
            forceQuit()
          }
        }
      })
      .catch((err) => console.error('[second-instance] dialog error:', err))
  })

  // ── App ──
  app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.virtual-company.app')

      // ★ 클립보드 단축키 (Ctrl+C/V/X/Z/A) 활성화를 위한 앱 메뉴 등록
      // frame: false 윈도우에서는 메뉴바가 보이지 않지만, 키보드 단축키는 동작함
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'editMenu' }
        ])
      )

      // 프로젝트 루트 설정 — 저장된 경로 없으면 폴더 선택 다이얼로그
      const saved = store.getSettings().defaultWorkingDirectory
      if (!saved) {
        const result = await dialog.showOpenDialog({
          title: '작업 디렉토리 선택',
          message: '에이전트가 작업할 프로젝트 폴더를 선택하세요.',
          properties: ['openDirectory']
        })
        if (result.filePaths.length > 0) {
          store.updateSettings({ defaultWorkingDirectory: result.filePaths[0] })
        }
      }
      store.setProjectRoot(detectProjectRoot())

      // dock 생성 중이면 optimizer 제외
      app.on('browser-window-created', (_, w) => {
        if (!wm.isCreatingDock()) {
          optimizer.watchWindowShortcuts(w)
        }
      })

      registerIpcHandlers()
      setWindowFunctions({
        createChatWindow: wm.createChatWindow,
        createEditorWindow: wm.createEditorWindow,
        closeEditorWindow: wm.closeEditorWindow,
        createGroupChatWindow: wm.createGroupChatWindow,
        createConversationCreatorWindow: wm.createConversationCreatorWindow,
        createDashboardWindow: wm.createDashboardWindow,
        createCommandCenterWindow: wm.createCommandCenterWindow,
        createSettingsWindow: wm.createSettingsWindow,
        resizeDock: wm.resizeDock,
        isDockWindow: wm.isDockWindow,
        forceQuit,
        setDockExpanded: wm.setDockExpanded,
        setDockSize: wm.setDockSize
      })

      // 위임 시 에이전트 동적 생성 후 독 크기 자동 조정
      setDockResizeCallback(wm.resizeDock)

      // 퍼미션 서버 시작
      startPermissionServer().catch((err) => {
        console.error('[permission-server] 시작 실패:', err)
      })

      // 저장된 독 크기 복원
      const savedSettings = store.getSettings()
      wm.restoreDockSize(savedSettings.dockSize)

      // 총괄 1명 체제
      seedDirectorIfEmpty()
      migrateHierarchyIfNeeded()
      migrateSystemPrompts()
      const staleRemoved = cleanStaleTasks()
      if (staleRemoved > 0) console.log(`[startup] 오래된 태스크 ${staleRemoved}건 정리`)

      // MCP 자동 감지 — 프로젝트 디렉토리에서 MCP 설정 파일 스캔
      try {
        const projectRoot = store.getProjectRoot() || detectProjectRoot()
        const discovery = discoverAll(projectRoot)
        if (discovery.servers.length > 0) {
          store.setDiscoveredMcpServers(discovery.servers)
          console.log(`[startup] MCP 자동 감지: ${discovery.servers.length}개 서버 발견`)
          // UI에 알림 (독 윈도우 생성 후 전송될 수 있도록 지연)
          setTimeout(() => {
            BrowserWindow.getAllWindows().forEach((w) =>
              w.webContents.send('mcp:discovered', discovery)
            )
          }, 2000)
        }
      } catch (err) {
        console.error('[startup] MCP 자동 감지 실패:', err)
      }

      // 로컬 LLM 자동 감지 (MCP 감지 후 3초 지연)
      setTimeout(() => {
        discoverAllLocalModels()
          .then((result) => {
            if (result.models.length > 0) {
              store.updateSettings({ discoveredLocalModels: result.models })
              console.log(`[startup] 로컬 LLM 자동 감지: ${result.models.length}개 모델 발견`)
              BrowserWindow.getAllWindows().forEach((w) =>
                w.webContents.send('llm:discovered', result)
              )
            }
          })
          .catch((err) => {
            console.error('[startup] 로컬 LLM 자동 감지 실패:', err)
          })
      }, 3000)

      // 프로세스 워치독 + 모니터링 루프 시작
      startWatchdog()
      startMonitoring()

      wm.createDockWindow()

      // 첫 실행이면 셋업 위자드, 아니면 CLI 확인
      const settings = store.getSettings()
      if (!settings.setupCompleted) {
        wm.createSetupWindow()
      } else {
        await checkCliAndNotify()
      }

      // 시딩 후 독 크기 조정
      setTimeout(() => {
        const count = agentManager.listAgents().length
        if (count > 0) wm.resizeDock(count)
      }, 500)
      setTimeout(createTray, 1000)

      // 2초마다 독 생존 확인
      setInterval(() => {
        if (!isQuitting) {
          const dock = wm.getDockWindow()
          if (!dock || dock.isDestroyed()) wm.createDockWindow()
        }
      }, 2000)

      // 60초마다 만료된 임시 에이전트 정리
      setInterval(() => {
        if (!isQuitting) cleanupExpiredAgents()
      }, 60000)

      // ★ 자동 테스트: 총괄에게 포트폴리오 작업 지시 (5초 후)
      setTimeout(async () => {
        const fs = await import('fs')
        const logFile = 'C:/Users/user/AppData/Local/Temp/vc-auto-test.log'
        const log = (msg: string): void => {
          const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`
          fs.appendFileSync(logFile, line)
        }
        fs.writeFileSync(logFile, `=== Auto Test Start ===\n`)

        const agents = agentManager.listAgents()
        log(`에이전트 수: ${agents.length}`)
        const director = agents.find((a) => a.hierarchy?.role === 'director')
        if (director) {
          log(`총괄 발견: ${director.id}`)
          const { sendMessage } = await import('./services/session-manager')
          const testMsg = `E:\\job\\portfolio 프로젝트. Next.js 16 + React 19 + Tailwind 4 + motion.
app/v1/page.tsx (다크) app/v2/page.tsx (라이트) 두 버전을 처음부터 다시 작성해라.
public/images/에 스크린샷 15개 있음.
모든 섹션: Hero, About, Featured(2개), Projects(7개), Skills, Career, Contact 포함.`
          log(`메시지 전송 시작`)
          sendMessage(director.id, testMsg)
            .then(() => log('메시지 전송 완료'))
            .catch((err) => log(`전송 실패: ${err}`))
        } else {
          log('총괄 에이전트 없음!')
        }
      }, 5000)

      // CLI 업데이트 체크
      setTimeout(() => {
        if (!isQuitting) broadcastCliUpdate()
      }, 10000)
      setInterval(
        () => {
          if (!isQuitting) broadcastCliUpdate()
        },
        24 * 60 * 60 * 1000
      )

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) wm.createDockWindow()
      })
    })
    .catch((err) => {
      console.error('[app] 초기화 실패:', err)
    })

  // 앱 종료 차단 — forceQuit()으로만 종료 가능
  // window-all-closed: Electron은 모든 창이 닫히면 기본적으로 app.quit()을 호출함
  // 빈 핸들러를 등록하면 기본 quit 동작이 비활성화됨
  app.on('window-all-closed', () => {
    if (!isQuitting) {
      // 기본 quit을 막고 독을 복원
      wm.ensureDockVisible()
    }
    // isQuitting이 아닌 한 절대 app.quit()을 호출하지 않음
  })

  app.on('will-quit', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      wm.ensureDockVisible()
    }
  })

  app.on('before-quit', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      wm.ensureDockVisible()
    }
  })
} // else (gotLock)
