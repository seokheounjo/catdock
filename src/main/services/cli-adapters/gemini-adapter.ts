import { execFileSync, spawn } from 'child_process'
import type { AgentConfig, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'
import type { CliAdapter, CliBuildOptions, CliSpawnOptions, CliSpawnResult } from './cli-adapter'

export class GeminiAdapter implements CliAdapter {
  readonly provider = 'gemini' as const

  checkInstalled(): CliCheckResult {
    try {
      const output = execFileSync('gemini', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
      const version = versionMatch ? versionMatch[1] : output

      return { installed: true, version, path: null, error: null, provider: 'gemini' }
    } catch (err) {
      const message = (err as Error).message || String(err)
      return {
        installed: false,
        version: null,
        path: null,
        error: message.includes('ENOENT')
          ? 'Gemini CLI가 설치되지 않았습니다.'
          : `Gemini CLI 확인 실패: ${message}`,
        provider: 'gemini'
      }
    }
  }

  buildArgs(config: AgentConfig, options: CliBuildOptions): string[] {
    const args: string[] = []

    // 모델 지정
    if (config.model && config.model !== 'default') {
      args.push('--model', config.model)
    }

    // JSON 출력 모드
    args.push('--json')

    // 시스템 프롬프트
    const promptParts: string[] = []
    if (options.companyRules?.trim()) {
      promptParts.push(options.companyRules.trim())
    }
    if (config.systemPrompt?.trim()) {
      promptParts.push(config.systemPrompt.trim())
    }
    if (options.agentLanguage) {
      const langMap: Record<string, string> = {
        ko: 'Korean',
        en: 'English',
        ja: 'Japanese',
        zh: 'Chinese'
      }
      promptParts.push(`Always respond in ${langMap[options.agentLanguage] || options.agentLanguage}.`)
    }
    if (promptParts.length > 0) {
      args.push('--system-prompt', promptParts.join('\n\n'))
    }

    return args
  }

  spawnProcess(_config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult {
    const proc = spawn('gemini', args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return { process: proc, writeStdin: true }
  }

  parseStreamLine(line: string): UnifiedStreamEvent[] | null {
    if (!line.trim()) return null
    try {
      const data = JSON.parse(line)
      const events: UnifiedStreamEvent[] = []

      // Gemini JSON 출력 파싱
      if (data.text) {
        events.push({ type: 'text', text: data.text })
      }
      if (data.result) {
        events.push({ type: 'result', resultText: data.result })
      }
      if (data.error) {
        events.push({ type: 'error', errorMessage: data.error })
      }

      return events.length > 0 ? events : null
    } catch {
      // JSON이 아닌 일반 텍스트 출력
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
    return 'npm install -g @anthropic-ai/gemini-cli'
  }
  getDisplayName(): string {
    return 'Gemini CLI'
  }
}
