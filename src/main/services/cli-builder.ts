import { AgentConfig, CliProvider, CliCheckResult } from '../../shared/types'
export type { CliCheckResult }
import path from 'path'
import fs from 'fs'
import { execFileSync, spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { generateMcpDocumentation } from './mcp-manager'
import { getAdapter } from './cli-adapters'

// 하위호환 래퍼 — 내부적으로 어댑터에 위임
export function checkClaudeCli(): CliCheckResult {
  return getAdapter('claude').checkInstalled()
}

// 프로바이더별 CLI 설치 확인
export function checkCliForProvider(provider: CliProvider): CliCheckResult {
  return getAdapter(provider).checkInstalled()
}

// 모든 프로바이더 CLI 설치 상태 확인
export function checkAllProviders(): Record<CliProvider, CliCheckResult> {
  const providers: CliProvider[] = ['claude', 'gemini', 'aider', 'codex', 'q']
  const results = {} as Record<CliProvider, CliCheckResult>
  for (const p of providers) {
    results[p] = getAdapter(p).checkInstalled()
  }
  return results
}

// CLI 업데이트 확인
export interface CliUpdateCheckResult {
  currentVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  error: string | null
}

export function checkForCliUpdate(): CliUpdateCheckResult {
  const current = checkClaudeCli()
  if (!current.installed || !current.version) {
    return {
      currentVersion: null,
      latestVersion: null,
      updateAvailable: false,
      error: 'CLI 미설치'
    }
  }

  try {
    const isWin = process.platform === 'win32'
    const npmCmd = isWin ? 'npm.cmd' : 'npm'
    const output = execFileSync(npmCmd, ['view', '@anthropic-ai/claude-code', 'version'], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin
    }).trim()

    const latestVersion = output.match(/(\d+\.\d+\.\d+)/)?.[1] ?? output

    // 버전 비교 (semver)
    const currentParts = current.version!.split('.').map(Number)
    const latestParts = latestVersion.split('.').map(Number)
    let updateAvailable = false
    for (let i = 0; i < 3; i++) {
      if ((latestParts[i] ?? 0) > (currentParts[i] ?? 0)) {
        updateAvailable = true
        break
      }
      if ((latestParts[i] ?? 0) < (currentParts[i] ?? 0)) break
    }

    return { currentVersion: current.version, latestVersion, updateAvailable, error: null }
  } catch (err) {
    return {
      currentVersion: current.version,
      latestVersion: null,
      updateAvailable: false,
      error: (err as Error).message
    }
  }
}

// Claude Code CLI 자동 설치
export function installClaudeCli(): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const npmCmd = isWin ? 'npm.cmd' : 'npm'

    // 설치 시작 브로드캐스트
    BrowserWindow.getAllWindows().forEach((w) =>
      w.webContents.send('cli:install-progress', {
        status: 'installing',
        message: 'Claude Code CLI 설치 중...'
      })
    )

    const proc = spawn(npmCmd, ['install', '-g', '@anthropic-ai/claude-code'], {
      shell: isWin,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let _stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      _stdout += data.toString()
    })
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        // 설치 성공 확인
        const check = checkClaudeCli()
        if (check.installed) {
          BrowserWindow.getAllWindows().forEach((w) =>
            w.webContents.send('cli:install-progress', {
              status: 'success',
              message: `Claude Code CLI v${check.version} 설치 완료!`
            })
          )
          resolve({ success: true, message: `Claude Code CLI v${check.version} 설치 완료` })
        } else {
          BrowserWindow.getAllWindows().forEach((w) =>
            w.webContents.send('cli:install-progress', {
              status: 'error',
              message: '설치는 완료했지만 CLI를 찾을 수 없습니다. 터미널을 새로 열어보세요.'
            })
          )
          resolve({
            success: false,
            message: '설치는 완료했지만 CLI를 찾을 수 없습니다. 터미널을 새로 열어보세요.'
          })
        }
      } else {
        const errorMsg = stderr.trim() || `Exit code ${code}`
        BrowserWindow.getAllWindows().forEach((w) =>
          w.webContents.send('cli:install-progress', {
            status: 'error',
            message: `설치 실패: ${errorMsg}`
          })
        )
        resolve({ success: false, message: `설치 실패: ${errorMsg}` })
      }
    })

    proc.on('error', (err) => {
      const msg = err.message.includes('ENOENT')
        ? 'npm이 설치되지 않았습니다. Node.js를 먼저 설치해주세요.'
        : `설치 실패: ${err.message}`
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('cli:install-progress', { status: 'error', message: msg })
      )
      resolve({ success: false, message: msg })
    })
  })
}

// Node.js/npm 설치 여부 확인
export function checkNodeInstalled(): { installed: boolean; version: string | null } {
  try {
    const output = execFileSync('node', ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    }).trim()
    return { installed: true, version: output }
  } catch {
    return { installed: false, version: null }
  }
}

// CLI 인수 빌드 — session-manager.ts와 conversation-manager.ts에서 공유
export function buildCliArgs(
  config: AgentConfig,
  options: {
    resumeSessionId?: string | null
    hasConversation?: boolean
    userMessage: string
    companyRules?: string
    agentLanguage?: string
  }
): string[] {
  const permissionMode = config.permissionMode ?? 'acceptEdits'
  const isInteractive = permissionMode === 'default'

  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--model',
    config.model,
    '--max-turns',
    String(config.maxTurns ?? 25),
    // 'default'(Interactive) 모드에서는 acceptEdits + permission-prompt-tool 사용
    '--permission-mode',
    isInteractive ? 'acceptEdits' : permissionMode
  ]

  // Interactive 모드: MCP 서버를 통한 퍼미션 프롬프트
  if (isInteractive) {
    args.push('--permission-prompt-tool', 'mcp__permission_prompt__prompt')
  }

  // CLI 플래그
  const flags = config.cliFlags
  if (flags?.verbose !== false) {
    args.push('--verbose')
  }
  if (flags?.debug) {
    args.push('--debug')
  }
  if (flags?.worktree) {
    args.push('--worktree')
  }
  if (flags?.jsonSchema) {
    args.push('--json-schema', flags.jsonSchema)
  }
  if (flags?.continue) {
    args.push('--continue')
  }
  if (flags?.additionalArgs) {
    args.push(...flags.additionalArgs)
  }

  // 이전 CLI 세션이 있으면 --resume으로 이어서 대화
  if (options.hasConversation && options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  }

  // 시스템 프롬프트 조합: [Company Rules] + [Agent systemPrompt] + [Language instruction]
  const systemPromptParts: string[] = []
  if (options.companyRules?.trim()) {
    systemPromptParts.push(`[Company Rules]\n${options.companyRules.trim()}`)
  }
  if (config.systemPrompt?.trim()) {
    systemPromptParts.push(config.systemPrompt.trim())
  }
  if (options.agentLanguage) {
    const langMap: Record<string, string> = {
      ko: 'Korean (한국어)',
      en: 'English',
      ja: 'Japanese (日本語)',
      zh: 'Chinese (中文)'
    }
    const langName = langMap[options.agentLanguage] || options.agentLanguage
    systemPromptParts.push(`[Language] Always respond in ${langName}.`)
  }

  // MCP 자동 문서화 주입
  const mcpDocs = generateMcpDocumentation(config.id)
  if (mcpDocs) {
    systemPromptParts.push(mcpDocs)
  }

  const combinedPrompt = systemPromptParts.join('\n\n')
  if (combinedPrompt) {
    args.push('--system-prompt', combinedPrompt)
  }

  // MCP config 파일이 있으면 추가
  const mcpConfigPath = getMcpConfigPath(config.id)
  if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
    args.push('--mcp-config', mcpConfigPath)
  }

  // userMessage는 args에 포함하지 않음 — stdin으로 전달 (ENAMETOOLONG 방지)

  return args
}

// Claude Code 관련 환경변수 모두 제거 — nested session 감지 우회
export function buildCleanEnv(): NodeJS.ProcessEnv {
  const cleanEnv = { ...process.env }
  for (const key of Object.keys(cleanEnv)) {
    if (key === 'CLAUDECODE' || key === 'CLAUDE_CODE_ENTRYPOINT' || key === 'CLAUDE_CODE_SESSION') {
      delete cleanEnv[key]
    }
  }
  return cleanEnv
}

// 작업 디렉토리 검증
export function validateWorkingDirectory(dir: string): string {
  let cwd = dir || process.cwd()

  // 상대 경로를 절대 경로로 변환
  if (!path.isAbsolute(cwd)) {
    cwd = path.resolve(process.cwd(), cwd)
  }

  // 경로 검증: 존재하고 디렉토리여야 함
  const stats = fs.statSync(cwd)
  if (!stats.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${cwd}`)
  }

  // 위험한 경로 차단 (시스템 디렉토리)
  const dangerousPaths = [
    process.platform === 'win32' ? 'C:\\Windows' : '/usr',
    process.platform === 'win32' ? 'C:\\Program Files' : '/bin',
    process.platform === 'win32' ? 'C:\\Program Files (x86)' : '/sbin',
    '/etc',
    '/sys'
  ]

  const normalizedCwd = path.normalize(cwd).toLowerCase()
  for (const dangerous of dangerousPaths) {
    if (normalizedCwd.startsWith(dangerous.toLowerCase())) {
      throw new Error(`Access to system directory denied: ${cwd}`)
    }
  }

  return cwd
}

// MCP config 파일 경로
function getMcpConfigPath(agentId: string): string | null {
  const dir = path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
    'virtual-company',
    'mcp-configs'
  )
  const filePath = path.join(dir, `${agentId}.json`)
  return filePath
}
