/**
 * MCP 팀 레벨 설정 + 헬스체크 통합 테스트
 * 실행: node test-mcp-health.mjs
 */
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const isWin = process.platform === 'win32'
const lookupCmd = isWin ? 'where' : 'which'

console.log('=== MCP 헬스체크 + 팀 MCP 병합 테스트 ===\n')

// ── 테스트 1: 커맨드 존재 여부 체크 (헬스체크 핵심 로직) ──

async function checkCommand(cmd) {
  try {
    const { stdout } = await execFileAsync(lookupCmd, [cmd], { timeout: 5000 })
    return { found: true, path: stdout.trim().split('\n')[0] }
  } catch {
    return { found: false, path: null }
  }
}

console.log('── 테스트 1: MCP 커맨드 존재 여부 체크 ──')

const commands = ['node', 'npx', 'git', 'python', 'nonexistent-tool-xyz', 'fake-mcp-server']
for (const cmd of commands) {
  const result = await checkCommand(cmd)
  const icon = result.found ? '✅' : '❌'
  console.log(`  ${icon} ${cmd}: ${result.found ? `발견 → ${result.path}` : 'not-found'}`)
}

// ── 테스트 2: MCP 서버 설정 병합 로직 시뮬레이션 ──

console.log('\n── 테스트 2: 팀 MCP 병합 로직 ──')

// 시뮬레이션 데이터
const globalMcpServers = [
  { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/shared'], enabled: true },
  { name: 'memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], enabled: true }
]

const teamMcpServers = [
  { name: 'github', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], enabled: true },
  { name: 'filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/team-dir'], enabled: true }
]

const agentMcpServers = [
  { name: 'memory', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory', '--custom'], enabled: true }
]

// 병합: 글로벌 → 팀 → 에이전트 (뒤가 같은 name이면 덮어씀)
function mergeServers(global, team, agent) {
  const merged = new Map()
  for (const s of global) merged.set(s.name, s)
  for (const s of team) merged.set(s.name, s)
  for (const s of agent) merged.set(s.name, s)
  return Array.from(merged.values())
}

const merged = mergeServers(globalMcpServers, teamMcpServers, agentMcpServers)

console.log(`  글로벌 MCP: ${globalMcpServers.map(s => s.name).join(', ')}`)
console.log(`  팀 MCP:     ${teamMcpServers.map(s => s.name).join(', ')}`)
console.log(`  에이전트 MCP: ${agentMcpServers.map(s => s.name).join(', ')}`)
console.log(`  병합 결과:  ${merged.map(s => s.name).join(', ')} (${merged.length}개)`)

// 검증
const fsServer = merged.find(s => s.name === 'filesystem')
const memServer = merged.find(s => s.name === 'memory')
const ghServer = merged.find(s => s.name === 'github')

let pass = true

// filesystem은 팀 설정이 글로벌을 덮어써야 함
if (fsServer?.args?.includes('/tmp/team-dir')) {
  console.log('  ✅ filesystem: 팀 설정이 글로벌 덮어씀 (/tmp/team-dir)')
} else {
  console.log('  ❌ filesystem: 병합 우선순위 오류')
  pass = false
}

// memory는 에이전트 설정이 글로벌을 덮어써야 함
if (memServer?.args?.includes('--custom')) {
  console.log('  ✅ memory: 에이전트 설정이 최우선 (--custom)')
} else {
  console.log('  ❌ memory: 병합 우선순위 오류')
  pass = false
}

// github은 팀에서 추가
if (ghServer) {
  console.log('  ✅ github: 팀 MCP에서 추가됨')
} else {
  console.log('  ❌ github: 팀 MCP 누락')
  pass = false
}

if (merged.length === 3) {
  console.log('  ✅ 총 3개 서버 (중복 제거 정상)')
} else {
  console.log(`  ❌ 서버 수 이상: ${merged.length}개 (예상 3개)`)
  pass = false
}

// ── 테스트 3: 헬스체크 시뮬레이션 (실제 커맨드 체크) ──

console.log('\n── 테스트 3: 실제 MCP 서버 헬스체크 시뮬레이션 ──')

const testServers = [
  { name: 'filesystem', command: 'npx', enabled: true },
  { name: 'git-server', command: 'git', enabled: true },
  { name: 'broken-server', command: 'nonexistent-mcp-tool', enabled: true },
  { name: 'disabled-server', command: 'npx', enabled: false }
]

for (const server of testServers) {
  if (!server.enabled) {
    console.log(`  ⏭️  ${server.name}: 비활성화 (스킵)`)
    continue
  }

  const result = await checkCommand(server.command)
  const status = result.found ? 'connected' : 'not-found'
  const icon = status === 'connected' ? '🟢' : '🔴'
  console.log(`  ${icon} ${server.name} (${server.command}): ${status}`)
}

// ── 테스트 4: 재시도 로직 시뮬레이션 ──

console.log('\n── 테스트 4: 재시도 로직 ──')

async function checkWithRetry(command, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await checkCommand(command)
    if (result.found) return { status: 'connected', attempts: attempt + 1 }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return { status: 'disconnected', attempts: maxRetries + 1 }
}

const retryResult = await checkWithRetry('nonexistent-mcp-tool')
console.log(`  비존재 커맨드: ${retryResult.status} (${retryResult.attempts}회 시도)`)
if (retryResult.attempts === 3) {
  console.log('  ✅ 재시도 3회 (초기 1 + 재시도 2) 정상')
} else {
  console.log('  ❌ 재시도 횟수 이상')
  pass = false
}

const goodResult = await checkWithRetry('node')
console.log(`  node: ${goodResult.status} (${goodResult.attempts}회 시도)`)
if (goodResult.status === 'connected' && goodResult.attempts === 1) {
  console.log('  ✅ 성공 시 재시도 없음')
} else {
  console.log('  ❌ 성공인데 재시도 발생')
  pass = false
}

// ── 테스트 5: 장애 보고 쿨다운 시뮬레이션 ──

console.log('\n── 테스트 5: 장애 보고 쿨다운 ──')

const reportedFailures = new Map()
const COOLDOWN = 5000 // 테스트용 5초

function shouldReport(agentId, serverName) {
  const key = `${agentId}:${serverName}`
  const lastReported = reportedFailures.get(key)
  if (lastReported && Date.now() - lastReported < COOLDOWN) return false
  reportedFailures.set(key, Date.now())
  return true
}

const report1 = shouldReport('agent-1', 'filesystem')
const report2 = shouldReport('agent-1', 'filesystem') // 쿨다운 내
const report3 = shouldReport('agent-1', 'github')      // 다른 서버

console.log(`  첫 보고:       ${report1 ? '✅ 보고됨' : '❌ 차단됨'}`)
console.log(`  중복 보고:     ${!report2 ? '✅ 쿨다운 차단' : '❌ 중복 보고됨'}`)
console.log(`  다른 서버:     ${report3 ? '✅ 별도 보고됨' : '❌ 차단됨'}`)

// ── 최종 결과 ──

console.log('\n══════════════════════════════════')
if (pass) {
  console.log('✅ 모든 테스트 통과!')
} else {
  console.log('❌ 일부 테스트 실패')
}
console.log('══════════════════════════════════\n')
