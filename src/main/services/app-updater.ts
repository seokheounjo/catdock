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

// ── GitHub Token 관리 (private 레포 업데이트용) ──

function getTokenPath(): string {
  return path.join(app.getPath('userData'), 'gh-token.txt')
}

/** 저장된 GH 토큰 조회 (마스킹 여부 선택) */
export function getGitHubToken(masked: boolean = true): { hasToken: boolean; token: string } {
  const tokenPath = getTokenPath()
  try {
    if (fs.existsSync(tokenPath)) {
      const token = fs.readFileSync(tokenPath, 'utf-8').trim()
      if (token) {
        return {
          hasToken: true,
          token: masked ? token.slice(0, 8) + '...' + token.slice(-4) : token
        }
      }
    }
  } catch {
    // 무시
  }
  // 환경변수 체크
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (envToken) {
    return {
      hasToken: true,
      token: masked ? envToken.slice(0, 8) + '...' + envToken.slice(-4) : envToken
    }
  }
  return { hasToken: false, token: '' }
}

/** GH 토큰 저장 + 즉시 환경변수 반영 */
export function saveGitHubToken(token: string): { success: boolean; message: string } {
  const tokenPath = getTokenPath()
  try {
    const trimmed = token.trim()
    if (!trimmed) {
      // 토큰 삭제
      if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath)
      delete process.env.GH_TOKEN
      console.log('[app-updater] GH 토큰 삭제됨')
      return { success: true, message: '토큰이 삭제되었습니다.' }
    }
    fs.writeFileSync(tokenPath, trimmed, 'utf-8')
    process.env.GH_TOKEN = trimmed
    console.log('[app-updater] GH 토큰 저장 및 적용됨')
    return { success: true, message: '토큰이 저장되었습니다.' }
  } catch (err) {
    console.error('[app-updater] GH 토큰 저장 실패:', err)
    return { success: false, message: (err as Error).message }
  }
}
