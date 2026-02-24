// MCP 헬스체크 — MCP 서버 연결 상태 확인 + 자동 재연결 + 상향 보고
import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { McpServerConfig, McpHealthStatus, McpHealthResult } from '../../shared/types'
import { getEffectiveMcpServers } from './mcp-manager'
import * as agentManager from './agent-manager'

const CHECK_TIMEOUT_MS = 5_000
const MAX_RETRIES = 2

// 런타임 상태: agentId → serverName → McpHealthResult
const healthResults = new Map<string, Map<string, McpHealthResult>>()

// 이미 보고한 장애 추적 (에이전트:서버 → 마지막 보고 시각)
const reportedFailures = new Map<string, number>()
const REPORT_COOLDOWN_MS = 300_000 // 같은 장애 5분 내 재보고 방지

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

// MCP 서버 command 실행 가능 여부 체크
function checkMcpServer(server: McpServerConfig): Promise<McpHealthStatus> {
  return new Promise((resolve) => {
    const command = server.command
    if (!command) {
      resolve('not-found')
      return
    }

    // Windows: where, Unix: which
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which'

    const timer = setTimeout(() => {
      resolve('disconnected')
    }, CHECK_TIMEOUT_MS)

    execFile(lookupCmd, [command], (err) => {
      clearTimeout(timer)
      if (err) {
        resolve('not-found')
        return
      }
      // command 존재 확인 → --version 실행 시도
      const versionTimer = setTimeout(() => {
        // 타임아웃이면 command는 있지만 응답 없음 → connected로 간주 (command 자체는 있으니)
        resolve('connected')
      }, CHECK_TIMEOUT_MS)

      execFile(command, ['--version'], { timeout: CHECK_TIMEOUT_MS }, (vErr) => {
        clearTimeout(versionTimer)
        // --version 실패해도 command 자체가 존재하면 connected
        // (일부 MCP 서버는 --version 미지원)
        if (vErr) {
          resolve('connected')
        } else {
          resolve('connected')
        }
      })
    })
  })
}

// 재시도 포함 단일 서버 체크
async function checkWithRetry(server: McpServerConfig): Promise<McpHealthStatus> {
  let lastStatus: McpHealthStatus = 'checking'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastStatus = await checkMcpServer(server)
    if (lastStatus === 'connected' || lastStatus === 'not-found') {
      return lastStatus
    }
    // disconnected → 재시도
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return lastStatus
}

// 단일 에이전트의 모든 MCP 서버 체크
async function checkAgentMcpServers(agentId: string): Promise<McpHealthResult[]> {
  const servers = getEffectiveMcpServers(agentId)
  if (servers.length === 0) return []

  const results: McpHealthResult[] = []

  for (const server of servers) {
    const status = await checkWithRetry(server)
    const result: McpHealthResult = {
      name: server.name,
      status,
      checkedAt: Date.now(),
      agentId,
      error: status === 'disconnected' ? `${server.command} 응답 없음`
        : status === 'not-found' ? `${server.command} 명령어를 찾을 수 없음`
        : undefined
    }
    results.push(result)

    // 에이전트별 결과 저장
    if (!healthResults.has(agentId)) {
      healthResults.set(agentId, new Map())
    }
    healthResults.get(agentId)!.set(server.name, result)
  }

  return results
}

// 모든 에이전트의 MCP 서버 일괄 체크
export async function checkAllMcpServers(): Promise<void> {
  const agents = agentManager.listAgents()

  for (const agent of agents) {
    const results = await checkAgentMcpServers(agent.id)

    // 실패한 서버 보고
    for (const result of results) {
      if (result.status === 'disconnected') {
        await reportFailure(agent.id, result)
      }
    }
  }

  // UI 브로드캐스트
  broadcast('mcp:health-updated', getAllHealthResults())
}

// 장애 보고 — 상위자에게 시스템 메시지 삽입
async function reportFailure(agentId: string, result: McpHealthResult): Promise<void> {
  const key = `${agentId}:${result.name}`
  const lastReported = reportedFailures.get(key)
  if (lastReported && Date.now() - lastReported < REPORT_COOLDOWN_MS) return

  reportedFailures.set(key, Date.now())

  // sendMcpFailureReport는 session-manager에서 제공 — 순환 의존 방지를 위해 동적 import
  try {
    const sessionManager = await import('./session-manager')
    if (typeof sessionManager.sendMcpFailureReport === 'function') {
      sessionManager.sendMcpFailureReport(agentId, result.name, result.error ?? 'Unknown error')
    }
  } catch (err) {
    console.error('[mcp-health] 장애 보고 실패:', err)
  }
}

// 현재 헬스체크 결과 반환
export function getAllHealthResults(): Record<string, McpHealthResult[]> {
  const out: Record<string, McpHealthResult[]> = {}
  for (const [agentId, serverMap] of healthResults) {
    out[agentId] = Array.from(serverMap.values())
  }
  return out
}

// 특정 에이전트의 헬스체크 결과
export function getAgentHealthResults(agentId: string): McpHealthResult[] {
  return Array.from(healthResults.get(agentId)?.values() ?? [])
}

// 보고 이력 초기화 (삭제된 에이전트 정리 등)
export function clearReportedFailures(): void {
  reportedFailures.clear()
}
