import path from 'path'
import fs from 'fs'
import * as store from './store'
import * as agentManager from './agent-manager'
import { getPort as getPermissionPort } from './permission-server'
import { McpServerConfig } from '../../shared/types'

// MCP config 디렉토리 — 프로젝트별 저장
function getMcpConfigDir(): string {
  const dir = path.join(store.getProjectStoreDir(), 'mcp-configs')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// 팀(리더) MCP 서버 가져오기 — 에이전트의 리더를 찾아 teamMcpConfig 반환
function getTeamMcpServers(agentId: string): McpServerConfig[] {
  const agent = store.getAgent(agentId)
  if (!agent) return []

  // 리더 자신이면 자기 teamMcpConfig 사용
  if (agent.hierarchy?.role === 'leader' || agent.hierarchy?.role === 'director') {
    return agent.teamMcpConfig?.filter((s) => s.enabled) ?? []
  }

  // 멤버면 리더의 teamMcpConfig 사용
  const leader = agentManager.findLeaderForAgent(agentId)
  if (!leader) return []

  return leader.teamMcpConfig?.filter((s) => s.enabled) ?? []
}

// 에이전트의 유효 MCP 서버 목록 반환 (글로벌 + 팀 + 에이전트별 병합, 뒤가 우선)
export function getEffectiveMcpServers(agentId: string): McpServerConfig[] {
  const settings = store.getSettings()
  const agent = store.getAgent(agentId)

  const globalServers = settings.globalMcpServers?.filter((s) => s.enabled) ?? []
  const teamServers = getTeamMcpServers(agentId)
  const agentServers = agent?.mcpConfig?.filter((s) => s.enabled) ?? []

  // 병합: 글로벌 → 팀 → 에이전트 (뒤가 같은 name이면 덮어씀)
  const merged = new Map<string, McpServerConfig>()
  for (const s of globalServers) merged.set(s.name, s)
  for (const s of teamServers) merged.set(s.name, s)
  for (const s of agentServers) merged.set(s.name, s)

  return Array.from(merged.values())
}

// 에이전트별 MCP 설정 파일 빌드 (글로벌 + 팀 + 에이전트별 병합)
export function buildMcpConfigFile(agentId: string): string | null {
  const agent = store.getAgent(agentId)
  const settings = store.getSettings()

  const allServers = [...getEffectiveMcpServers(agentId)]

  // 퍼미션 MCP 서버 자동 주입 (default 모드일 때)
  const permissionMode = agent?.permissionMode ?? settings.defaultPermissionMode
  if (permissionMode === 'default') {
    const port = getPermissionPort()
    if (port > 0) {
      const mcpServerPath = path.join(__dirname, 'permission-mcp-server.cjs')
      allServers.push({
        name: 'permission_prompt',
        command: 'node',
        args: [mcpServerPath],
        env: {
          PERMISSION_SERVER_PORT: String(port),
          PERMISSION_AGENT_ID: agentId
        },
        enabled: true
      })
    }
  }

  if (allServers.length === 0) return null

  // Claude CLI의 MCP config 포맷으로 변환
  const mcpConfig: Record<string, Record<string, unknown>> = {}
  for (const server of allServers) {
    const entry: Record<string, unknown> = {
      command: server.command
    }
    if (server.args && server.args.length > 0) entry.args = server.args
    if (server.env && Object.keys(server.env).length > 0) entry.env = server.env
    if (server.cwd) entry.cwd = server.cwd

    mcpConfig[server.name] = entry
  }

  const configContent = JSON.stringify({ mcpServers: mcpConfig }, null, 2)

  // 파일에 쓰기
  const dir = getMcpConfigDir()
  const filePath = path.join(dir, `${agentId}.json`)
  fs.writeFileSync(filePath, configContent, 'utf-8')

  return filePath
}

// MCP config 파일 삭제
export function removeMcpConfigFile(agentId: string): void {
  const dir = getMcpConfigDir()
  const filePath = path.join(dir, `${agentId}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

// MCP 자동 문서화 — 에이전트의 사용 가능한 MCP 도구를 마크다운으로 생성
export function generateMcpDocumentation(agentId: string): string {
  const allServers = getEffectiveMcpServers(agentId)
  if (allServers.length === 0) return ''

  const lines: string[] = [
    '## 사용 가능한 MCP 도구',
    ''
  ]

  for (const server of allServers) {
    const args = server.args?.join(' ') ?? ''
    const envKeys = server.env ? Object.keys(server.env).join(', ') : ''
    lines.push(`- **${server.name}**: \`${server.command} ${args}\``)
    if (envKeys) {
      lines.push(`  - 환경변수: ${envKeys}`)
    }
    if (server.cwd) {
      lines.push(`  - 작업 디렉토리: ${server.cwd}`)
    }
  }

  lines.push('')
  lines.push('MCP 도구를 활용하여 외부 서비스(GitHub, DB 등)와 연동할 수 있습니다.')

  return lines.join('\n')
}
