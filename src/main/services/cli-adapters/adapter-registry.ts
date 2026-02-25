import type { AgentConfig, CliProvider } from '../../../shared/types'
import type { CliAdapter } from './cli-adapter'
import { ClaudeAdapter } from './claude-adapter'
import { GeminiAdapter } from './gemini-adapter'
import { AiderAdapter } from './aider-adapter'
import { CodexAdapter } from './codex-adapter'
import { QAdapter } from './q-adapter'

// 싱글톤 캐시
const adapterCache = new Map<CliProvider, CliAdapter>()

// 프로바이더별 어댑터 반환 (싱글톤)
export function getAdapter(provider: CliProvider): CliAdapter {
  if (!adapterCache.has(provider)) {
    switch (provider) {
      case 'claude':
        adapterCache.set(provider, new ClaudeAdapter())
        break
      case 'gemini':
        adapterCache.set(provider, new GeminiAdapter())
        break
      case 'aider':
        adapterCache.set(provider, new AiderAdapter())
        break
      case 'codex':
        adapterCache.set(provider, new CodexAdapter())
        break
      case 'q':
        adapterCache.set(provider, new QAdapter())
        break
      default:
        adapterCache.set(provider, new ClaudeAdapter())
    }
  }
  return adapterCache.get(provider)!
}

// config에서 프로바이더 결정 (기본값: claude)
export function resolveProvider(config: AgentConfig): CliProvider {
  return config.cliProvider ?? 'claude'
}
