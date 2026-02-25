import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import { is } from '@electron-toolkit/utils'
import * as path from 'path'
import * as fs from 'fs'

export type AppUpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

function broadcast(status: AppUpdateStatus): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('app-update:status', status)
  })
}

/**
 * Private 레포 접근용 GH_TOKEN 로드
 * 우선순위: 환경변수 > appData/gh-token.txt > 하드코딩 폴백
 */
function loadGitHubToken(): void {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return

  // appData에서 토큰 파일 읽기
  const tokenPath = path.join(app.getPath('userData'), 'gh-token.txt')
  try {
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf-8').trim()
      if (token) {
        process.env.GH_TOKEN = token
        console.log('[app-updater] gh-token.txt에서 토큰 로드 완료')
        return
      }
    }
  } catch {
    // 무시
  }
  console.warn('[app-updater] GH_TOKEN 없음 — private 레포 업데이트 불가')
}

/** autoUpdater 초기화 — app.whenReady() 이후 한 번만 호출 */
export function initAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // private 레포 인증 토큰 설정
  loadGitHubToken()

  // dev 모드에선 실제 업데이트 불가 — 로그만
  if (is.dev) {
    console.log('[app-updater] dev 모드 — 실제 업데이트 비활성화')
    return
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[app-updater] 업데이트 확인 중...')
    broadcast({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[app-updater] 업데이트 발견: v${info.version}`)
    broadcast({
      state: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log(`[app-updater] 최신 버전 사용 중: v${info.version}`)
    broadcast({ state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[app-updater] 다운로드 ${Math.round(progress.percent)}%`)
    broadcast({
      state: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[app-updater] 다운로드 완료: v${info.version}`)
    broadcast({ state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('[app-updater] 오류:', err.message)
    broadcast({ state: 'error', message: err.message })
  })
}

/** 업데이트 확인 */
export async function checkForAppUpdate(): Promise<void> {
  if (is.dev) {
    console.log('[app-updater] dev 모드 — 체크 스킵')
    broadcast({ state: 'not-available', version: app.getVersion() })
    return
  }
  await autoUpdater.checkForUpdates()
}

/** 업데이트 다운로드 시작 */
export async function downloadAppUpdate(): Promise<void> {
  if (is.dev) return
  await autoUpdater.downloadUpdate()
}

/** 다운로드 완료된 업데이트 설치 + 앱 재시작 */
export function installAppUpdate(): void {
  if (is.dev) return
  autoUpdater.quitAndInstall(false, true)
}
