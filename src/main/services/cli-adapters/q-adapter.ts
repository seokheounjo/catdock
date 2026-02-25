import { execFileSync, spawn } from 'child_process'
import type { AgentConfig, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'
import type { CliAdapter, CliBuildOptions, CliSpawnOptions, CliSpawnResult } from './cli-adapter'

export class QAdapter implements CliAdapter {
  readonly provider = 'q' as const

  checkInstalled(): CliCheckResult {
    try {
      const output = execFileSync('q', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
      const version = versionMatch ? versionMatch[1] : output

      return { installed: true, version, path: null, error: null, provider: 'q' }
    } catch (err) {
      const message = (err as Error).message || String(err)
      return {
        installed: false,
        version: null,
        path: null,
        error: message.includes('ENOENT')
          ? 'Amazon Q CLI가 설치되지 않았습니다.'
          : `Amazon Q CLI 확인 실패: ${message}`,
        provider: 'q'
      }
    }
  }

  buildArgs(_config: AgentConfig, _options: CliBuildOptions): string[] {
    // q chat 서브커맨드 사용
    return ['chat']
  }

  spawnProcess(_config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult {
    const proc = spawn('q', args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    // q chat은 stdin으로 입력 전달
    return { process: proc, writeStdin: true }
  }

  parseStreamLine(line: string): UnifiedStreamEvent[] | null {
    if (!line.trim()) return null
    // Amazon Q CLI는 일반 텍스트 출력 → text 이벤트로 래핑
    return [{ type: 'text', text: line }]
  }

  supportsMcp(): boolean {
    return false
  }
  supportsResume(): boolean {
    return false
  }
  supportsPermissionMode(): boolean {
    return false
  }

  getInstallCommand(): string {
    return 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-installing.html'
  }
  getDisplayName(): string {
    return 'Amazon Q CLI'
  }
}
