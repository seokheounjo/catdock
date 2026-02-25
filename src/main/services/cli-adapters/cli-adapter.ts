import { ChildProcess } from 'child_process'
import type { AgentConfig, CliProvider, CliCheckResult, UnifiedStreamEvent } from '../../../shared/types'

// CLI 프로세스 빌드 옵션
export interface CliBuildOptions {
  resumeSessionId?: string | null
  hasConversation?: boolean
  userMessage: string
  companyRules?: string
  agentLanguage?: string
}

// CLI 스폰 결과
export interface CliSpawnResult {
  process: ChildProcess
  writeStdin: boolean // true면 userMessage를 stdin으로 전달
}

// CLI 스폰 옵션
export interface CliSpawnOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  signal: AbortSignal
}

// CLI 어댑터 인터페이스 — 각 프로바이더가 구현
export interface CliAdapter {
  readonly provider: CliProvider

  // CLI 설치 여부 확인
  checkInstalled(): CliCheckResult

  // CLI 인수 빌드
  buildArgs(config: AgentConfig, options: CliBuildOptions): string[]

  // CLI 프로세스 스폰
  spawnProcess(config: AgentConfig, args: string[], opts: CliSpawnOptions): CliSpawnResult

  // stdout 한 줄 파싱 → UnifiedStreamEvent 배열 (파싱 실패 시 null)
  parseStreamLine(line: string): UnifiedStreamEvent[] | null

  // 기능 지원 여부
  supportsMcp(): boolean
  supportsResume(): boolean
  supportsPermissionMode(): boolean

  // 사용자 안내
  getInstallCommand(): string
  getDisplayName(): string
}
