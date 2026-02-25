import { execFileSync, spawn } from 'child_process'
import type { AgentConfig, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'
import type { CliAdapter, CliBuildOptions, CliSpawnOptions, CliSpawnResult } from './cli-adapter'

export class CodexAdapter implements CliAdapter {
  readonly provider = 'codex' as const

  checkInstalled(): CliCheckResult {
    try {
      const output = execFileSync('codex', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
      const version = versionMatch ? versionMatch[1] : output

      return { installed: true, version, path: null, error: null, provider: 'codex' }
    } catch (err) {
      const message = (err as Error).message || String(err)
      return {
        installed: false,
        version: null,
        path: null,
        error: message.includes('ENOENT')
          ? 'OpenAI Codex CLI가 설치되지 않았습니다.'
          : `Codex CLI 확인 실패: ${message}`,
        provider: 'codex'
      }
    }
  }

  buildArgs(config: AgentConfig, options: CliBuildOptions): string[] {
    const args: string[] = ['--json']

    if (config.model && config.model !== 'default') {
      args.push('--model', config.model)
    }

    // userMessage를 마지막 arg로 전달
    args.push(options.userMessage)

    return args
  }

  spawnProcess(_config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult {
    const proc = spawn('codex', args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    // codex는 userMessage를 arg로 전달하므로 stdin 불필요
    return { process: proc, writeStdin: false }
  }

  parseStreamLine(line: string): UnifiedStreamEvent[] | null {
    if (!line.trim()) return null
    try {
      const data = JSON.parse(line)
      const events: UnifiedStreamEvent[] = []

      if (data.type === 'message' && data.content) {
        events.push({ type: 'text', text: data.content })
      } else if (data.type === 'result') {
        events.push({ type: 'result', resultText: data.content || data.result || '' })
      } else if (data.type === 'error') {
        events.push({ type: 'error', errorMessage: data.message || data.error || '' })
      } else if (data.text) {
        events.push({ type: 'text', text: data.text })
      }

      return events.length > 0 ? events : null
    } catch {
      return [{ type: 'text', text: line }]
    }
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
    return 'npm install -g @openai/codex'
  }
  getDisplayName(): string {
    return 'OpenAI Codex CLI'
  }
}
