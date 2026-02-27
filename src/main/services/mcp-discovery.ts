// MCP 자동 감지 서비스 — 프로젝트 디렉토리 및 홈 디렉토리에서 MCP 설정 파일 검색
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { DiscoveredMcpServer, McpDiscoveryResult, McpServerConfig } from '../../shared/types'

// MCP 설정 파일 패턴
const MCP_FILE_PATTERNS = [
  '.claude/mcp.json',
  'claude_desktop_config.json',
  '.mcp/config.json'
]

// 홈 디렉토리 MCP 설정 파일
const HOME_MCP_PATTERNS = [
  '.claude/mcp.json'
]

// MCP 설정 파일 파싱: { "mcpServers": { "name": { "command", "args" } } }
function parseMcpConfigFile(filePath: string): McpServerConfig[] {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)

    const mcpServers = parsed.mcpServers || parsed.mcpServer || {}
    const servers: McpServerConfig[] = []

    for (const [name, config] of Object.entries(mcpServers)) {
      const cfg = config as Record<string, unknown>
      if (cfg && typeof cfg === 'object' && cfg.command) {
        servers.push({
          name,
          command: String(cfg.command),
          args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
          env: cfg.env && typeof cfg.env === 'object'
            ? cfg.env as Record<string, string>
            : undefined,
          cwd: cfg.cwd ? String(cfg.cwd) : undefined,
          enabled: false // 발견된 서버는 기본 비활성화 (사용자가 활성화)
        })
      }
    }

    return servers
  } catch (err) {
    console.error(`[mcp-discovery] 파일 파싱 실패: ${filePath}`, err)
    return []
  }
}

// 특정 디렉토리에서 MCP 설정 파일 검색
export function discoverMcpInDirectory(dir: string): DiscoveredMcpServer[] {
  const discovered: DiscoveredMcpServer[] = []
  const now = Date.now()

  for (const pattern of MCP_FILE_PATTERNS) {
    const filePath = join(dir, pattern)
    if (existsSync(filePath)) {
      console.log(`[mcp-discovery] 발견: ${filePath}`)
      const servers = parseMcpConfigFile(filePath)
      for (const server of servers) {
        discovered.push({
          ...server,
          source: 'discovered-project',
          sourcePath: filePath,
          discoveredAt: now
        })
      }
    }
  }

  return discovered
}

// 홈 디렉토리에서 MCP 설정 파일 검색
export function discoverUserHomeMcp(): DiscoveredMcpServer[] {
  const discovered: DiscoveredMcpServer[] = []
  const home = homedir()
  const now = Date.now()

  for (const pattern of HOME_MCP_PATTERNS) {
    const filePath = join(home, pattern)
    if (existsSync(filePath)) {
      console.log(`[mcp-discovery] 홈 디렉토리 발견: ${filePath}`)
      const servers = parseMcpConfigFile(filePath)
      for (const server of servers) {
        discovered.push({
          ...server,
          source: 'discovered-home',
          sourcePath: filePath,
          discoveredAt: now
        })
      }
    }
  }

  return discovered
}

// 프로젝트 + 홈 디렉토리 통합 스캔
export function discoverAll(projectDir: string): McpDiscoveryResult {
  const scannedPaths: string[] = []
  let servers: DiscoveredMcpServer[] = []

  // 프로젝트 디렉토리 스캔
  if (projectDir) {
    scannedPaths.push(projectDir)
    servers = servers.concat(discoverMcpInDirectory(projectDir))
  }

  // 홈 디렉토리 스캔
  const home = homedir()
  scannedPaths.push(home)
  servers = servers.concat(discoverUserHomeMcp())

  // 중복 제거 (같은 이름 + 같은 command)
  const unique = new Map<string, DiscoveredMcpServer>()
  for (const server of servers) {
    const key = `${server.name}|${server.command}`
    if (!unique.has(key)) {
      unique.set(key, server)
    }
  }

  const result: McpDiscoveryResult = {
    servers: Array.from(unique.values()),
    scannedPaths,
    scannedAt: Date.now()
  }

  console.log(`[mcp-discovery] 스캔 완료: ${result.servers.length}개 서버 발견 (${scannedPaths.length}개 경로)`)
  return result
}
