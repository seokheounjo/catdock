import { execFileSync, spawn } from 'child_process'
import type { AgentConfig, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'
import type { CliAdapter, CliBuildOptions, CliSpawnOptions, CliSpawnResult } from './cli-adapter'

export class AiderAdapter implements CliAdapter {
  readonly provider = 'aider' as const

  checkInstalled(): CliCheckResult {
    try {
      const output = execFileSync('aider', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
      const version = versionMatch ? versionMatch[1] : output

      return { installed: true, version, path: null, error: null, provider: 'aider' }
    } catch (err) {
      const message = (err as Error).message || String(err)
      return {
        installed: false,
        version: null,
        path: null,
        error: message.includes('ENOENT')
          ? 'Aider가 설치되지 않았습니다.'
          : `Aider 확인 실패: ${message}`,
        provider: 'aider'
      }
    }
  }

  buildArgs(config: AgentConfig, options: CliBuildOptions): string[] {
    const args: string[] = [
      '--message',
      options.userMessage,
      '--no-auto-commits',
      '--yes',
      '--no-pretty'
    ]

    // 모델 지정
    if (config.model && config.model !== 'default') {
      args.push('--model', config.model)
    }

    return args
  }

  spawnProcess(_config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult {
    const proc = spawn('aider', args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    // aider는 --message로 입력을 전달하므로 stdin 불필요
    return { process: proc, writeStdin: false }
  }

  parseStreamLine(line: string): UnifiedStreamEvent[] | null {
    if (!line.trim()) return null
    // aider는 일반 텍스트 출력 → text 이벤트로 래핑
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
    return 'pip install aider-chat'
  }
  getDisplayName(): string {
    return 'Aider'
  }
}
