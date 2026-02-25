import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import type { AgentConfig, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'
import type { CliAdapter, CliBuildOptions, CliSpawnOptions, CliSpawnResult } from './cli-adapter'
import { generateMcpDocumentation } from '../mcp-manager'
import path from 'path'

// MCP config 파일 경로 (cli-builder.ts에서 이동)
function getMcpConfigPath(agentId: string): string | null {
  const dir = path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
    'virtual-company',
    'mcp-configs'
  )
  return path.join(dir, `${agentId}.json`)
}

export class ClaudeAdapter implements CliAdapter {
  readonly provider = 'claude' as const

  checkInstalled(): CliCheckResult {
    try {
      const output = execFileSync('claude', ['--version'], {
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      }).trim()

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/)
      const version = versionMatch ? versionMatch[1] : output

      let claudePath: string | null = null
      try {
        const whereCmd = process.platform === 'win32' ? 'where' : 'which'
        claudePath = execFileSync(whereCmd, ['claude'], {
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32'
        })
          .trim()
          .split('\n')[0]
      } catch {
        // where/which 실패해도 버전은 나왔으므로 설치됨
      }

      return { installed: true, version, path: claudePath, error: null, provider: 'claude' }
    } catch (err) {
      const message = (err as Error).message || String(err)
      if (
        message.includes('ENOENT') ||
        message.includes('not found') ||
        message.includes('not recognized')
      ) {
        return {
          installed: false,
          version: null,
          path: null,
          error: 'Claude Code CLI가 설치되지 않았습니다.',
          provider: 'claude'
        }
      }
      return {
        installed: false,
        version: null,
        path: null,
        error: `Claude Code CLI 확인 실패: ${message}`,
        provider: 'claude'
      }
    }
  }

  buildArgs(config: AgentConfig, options: CliBuildOptions): string[] {
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
      '--permission-mode',
      isInteractive ? 'acceptEdits' : permissionMode
    ]

    if (isInteractive) {
      args.push('--permission-prompt-tool', 'mcp__permission_prompt__prompt')
    }

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

    // 시스템 프롬프트 조합
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

    const mcpDocs = generateMcpDocumentation(config.id)
    if (mcpDocs) {
      systemPromptParts.push(mcpDocs)
    }

    const combinedPrompt = systemPromptParts.join('\n\n')
    if (combinedPrompt) {
      args.push('--system-prompt', combinedPrompt)
    }

    const mcpConfigPath = getMcpConfigPath(config.id)
    if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
      args.push('--mcp-config', mcpConfigPath)
    }

    return args
  }

  spawnProcess(_config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult {
    const proc = spawn('claude', args, {
      cwd: opts.cwd,
      env: opts.env,
      signal: opts.signal,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return { process: proc, writeStdin: true }
  }

  parseStreamLine(line: string): UnifiedStreamEvent[] | null {
    if (!line.trim()) return null
    try {
      const event = JSON.parse(line)
      return this._convertEvent(event)
    } catch {
      return null
    }
  }

  private _convertEvent(event: Record<string, unknown>): UnifiedStreamEvent[] {
    const type = event.type as string
    const events: UnifiedStreamEvent[] = []

    if (type === 'system' && event.subtype === 'init' && event.session_id) {
      events.push({ type: 'init', sessionId: event.session_id as string })
    } else if (type === 'assistant') {
      const message = event.message as Record<string, unknown> | undefined
      if (!message) return events
      const contentBlocks = message.content as Array<Record<string, unknown>> | undefined
      if (!contentBlocks || !Array.isArray(contentBlocks)) return events

      for (const block of contentBlocks) {
        const blockType = block.type as string
        if (blockType === 'text') {
          const text = block.text as string
          if (text) events.push({ type: 'text', text })
        } else if (blockType === 'tool_use') {
          events.push({
            type: 'tool-use',
            toolName: block.name as string,
            toolInput: block.input as Record<string, unknown>
          })
        } else if (blockType === 'tool_result') {
          const content = block.content as string
          if (content) events.push({ type: 'tool-result', toolOutput: content })
        }
      }
    } else if (type === 'result') {
      const cost = (event.total_cost_usd as number) || 0
      events.push({ type: 'cost', totalCostUsd: cost })
      const rt = event.result as string | undefined
      if (rt) events.push({ type: 'result', resultText: rt })
    }

    return events
  }

  supportsMcp(): boolean {
    return true
  }
  supportsResume(): boolean {
    return true
  }
  supportsPermissionMode(): boolean {
    return true
  }

  getInstallCommand(): string {
    return 'npm install -g @anthropic-ai/claude-code'
  }
  getDisplayName(): string {
    return 'Claude Code CLI'
  }
}
