// 작업 위임 매니저 — 리더 에이전트의 응답에서 위임 블록을 파싱하고 실행
import { BrowserWindow, shell } from 'electron'
import { appendFileSync } from 'fs'

const LOG_FILE = 'C:/Users/user/AppData/Local/Temp/vc-delegation.log'
function dlog(msg: string): void {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toLocaleTimeString()}] ${msg}\n`)
  } catch { /* ignore */ }
}
import { v4 as uuid } from 'uuid'
import * as agentManager from './agent-manager'
import * as store from './store'
import { logActivity } from './activity-logger'
import { requestApproval } from './approval-gate'
import {
  findMemberDef,
  randomAvatar,
  getProjectRoot,
  generateDynamicLeaderPrompt,
  generateDynamicMemberPrompt,
  isFrontendRole
} from './default-agents'
import { MODEL_OPTIONS } from '../../shared/constants'
import { TaskDelegation } from '../../shared/types'

// ── 순환 의존 방지: session-manager가 콜백 주입 ──
type SendMessageAndCaptureFn = (agentId: string, message: string) => Promise<string>
let _sendMessageAndCapture: SendMessageAndCaptureFn | null = null

export function setSendMessageAndCapture(fn: SendMessageAndCaptureFn): void {
  _sendMessageAndCapture = fn
}

function sendMessageAndCapture(agentId: string, message: string): Promise<string> {
  if (!_sendMessageAndCapture) throw new Error('[delegation] sendMessageAndCapture 미등록')
  return _sendMessageAndCapture(agentId, message)
}

// 설정에서 기본 모델 조회
function getDefaultModel(): string {
  try {
    const settings = store.getSettings()
    if (settings.defaultModel) return settings.defaultModel
  } catch {
    // 초기화 전이면 무시
  }
  return MODEL_OPTIONS[0]?.value ?? 'claude-sonnet-4-20250514'
}

export interface DelegationBlock {
  agentName: string
  agentRole?: string // 역할 지정 (없으면 자동 결정)
  task: string
}

// 최대 위임 반복 라운드
const MAX_DELEGATION_ROUNDS = 3

// 한 라운드당 최대 동시 위임 수 — 리소스 과부하·synthesis 컨텍스트 폭발 방지
const MAX_CONCURRENT_DELEGATIONS = 2

// 마크다운 코드블록(```) 제거 — 예시 코드 안의 DELEGATE를 무시하기 위함
function stripCodeBlocks(text: string): string {
  // 펜스드 코드블록 (```...```) 제거
  let stripped = text.replace(/```[\s\S]*?```/g, '')
  // 인라인 코드 (`...`) 제거
  stripped = stripped.replace(/`[^`]+`/g, '')
  return stripped
}

// [DELEGATE:Name] 또는 [DELEGATE:Name|Role]...[/DELEGATE] 블록 파싱 (코드블록 안은 무시)
export function parseDelegationBlocks(text: string): DelegationBlock[] {
  const cleaned = stripCodeBlocks(text)
  const blocks: DelegationBlock[] = []
  // 확장 형식: [DELEGATE:이름] 또는 [DELEGATE:이름|역할]
  const regex = /\[DELEGATE:([^\]|]+)(?:\|([^\]]+))?\]([\s\S]*?)\[\/DELEGATE\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleaned)) !== null) {
    const agentName = match[1].trim()
    const agentRole = match[2]?.trim() || undefined
    const task = match[3].trim()
    if (agentName && task) {
      blocks.push({ agentName, agentRole, task })
    }
  }

  return blocks
}

// 위임 블록 존재 여부 (코드블록 안은 무시)
export function hasDelegation(text: string): boolean {
  const cleaned = stripCodeBlocks(text)
  return /\[DELEGATE:[^\]]+\]/i.test(cleaned)
}

// ── MCP 블록 파싱 ──

export interface McpAddBlock {
  name: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

// [MCP:ADD|name|command|args|cwd] 또는 [MCP:ADD|name|command|args|cwd|KEY=val,KEY2=val2] 블록 파싱
export function parseMcpAddBlocks(text: string): McpAddBlock[] {
  const cleaned = stripCodeBlocks(text)
  const blocks: McpAddBlock[] = []
  // 5필드(env 포함) 또는 4필드(기존) 매칭
  const regex = /\[MCP:ADD\|([^|]+)\|([^|]+)\|([^|]*)\|([^|\]]*?)(?:\|([^\]]*))?\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[1].trim()
    const command = match[2].trim()
    const args = match[3].trim()
      ? match[3].split(',').map((s) => s.trim()).filter(Boolean)
      : []
    const cwd = match[4].trim()
    const env: Record<string, string> = {}

    // 5번째 필드: KEY=value,KEY2=value2 파싱
    if (match[5] && match[5].trim()) {
      for (const pair of match[5].split(',')) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx > 0) {
          const key = pair.slice(0, eqIdx).trim()
          const val = pair.slice(eqIdx + 1).trim()
          if (key) env[key] = val
        }
      }
    }

    if (name && command) {
      blocks.push({ name, command, args, cwd, env })
    }
  }

  return blocks
}

// [MCP:REMOVE|name] 블록 파싱
export function parseMcpRemoveBlocks(text: string): string[] {
  const cleaned = stripCodeBlocks(text)
  const names: string[] = []
  const regex = /\[MCP:REMOVE\|([^\]]+)\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[1].trim()
    if (name) names.push(name)
  }

  return names
}

// ── ACTION 블록 파싱 ──

export interface ActionBlock {
  type: 'OPEN_URL' | 'RUN_CMD' | 'OPEN_FILE'
  label: string
  target: string
}

// [ACTION:TYPE|라벨|대상] 블록 파싱
export function parseActionBlocks(text: string): ActionBlock[] {
  const cleaned = stripCodeBlocks(text)
  const blocks: ActionBlock[] = []
  const regex = /\[ACTION:(OPEN_URL|RUN_CMD|OPEN_FILE)\|([^|]+)\|([^\]]+)\]/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(cleaned)) !== null) {
    const type = match[1].toUpperCase() as ActionBlock['type']
    const label = match[2].trim()
    const target = match[3].trim()
    if (label && target) {
      blocks.push({ type, label, target })
    }
  }

  return blocks
}

// OPEN_URL 자동 실행 — http/https만 허용
async function executeAutoActions(text: string): Promise<void> {
  const actions = parseActionBlocks(text)
  for (const action of actions) {
    if (action.type === 'OPEN_URL') {
      try {
        const url = action.target
        if (/^https?:\/\//i.test(url)) {
          console.log(`[action] 자동 URL 열기: ${url}`)
          await shell.openExternal(url)
        } else {
          console.warn(`[action] 안전하지 않은 URL 스킵: ${url}`)
        }
      } catch (err) {
        console.error(`[action] URL 열기 실패: ${(err as Error).message}`)
      }
    }
  }
}

// MCP 블록 존재 여부 확인
export function hasMcpBlocks(text: string): boolean {
  const cleaned = stripCodeBlocks(text)
  return /\[MCP:(ADD|REMOVE)\|/i.test(cleaned)
}

// JSON 형식의 MCP 설정 파싱 (사용자가 직접 붙여넣기)
// { "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }
export function parseJsonMcpConfig(text: string): McpAddBlock[] {
  const blocks: McpAddBlock[] = []

  // JSON 블록 추출 — 코드블록 안이든 밖이든 { "mcpServers" 패턴 찾기
  const jsonPatterns = [
    /```(?:json)?\s*(\{[\s\S]*?"mcpServers"[\s\S]*?\})\s*```/gi,
    /(\{\s*"mcpServers"\s*:\s*\{[\s\S]*?\}\s*\})/gi
  ]

  const jsonCandidates: string[] = []
  for (const pattern of jsonPatterns) {
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      jsonCandidates.push(m[1])
    }
  }

  for (const jsonStr of jsonCandidates) {
    try {
      const parsed = JSON.parse(jsonStr)
      const servers = parsed.mcpServers || parsed.McpServers || parsed.servers
      if (!servers || typeof servers !== 'object') continue

      for (const [name, cfg] of Object.entries(servers)) {
        const c = cfg as Record<string, unknown>
        if (!c.command || typeof c.command !== 'string') continue

        const args: string[] = Array.isArray(c.args)
          ? (c.args as string[]).map(String)
          : []
        const env: Record<string, string> = {}
        if (c.env && typeof c.env === 'object') {
          for (const [k, v] of Object.entries(c.env as Record<string, unknown>)) {
            env[k] = String(v)
          }
        }

        blocks.push({
          name,
          command: c.command,
          args,
          cwd: typeof c.cwd === 'string' ? c.cwd : '',
          env
        })
      }
    } catch {
      // JSON 파싱 실패 — 무시
    }
  }

  return blocks
}

// 사용자 메시지에서 직접 MCP 설정을 감지할 수 있는지 확인
export function hasDirectMcpConfig(text: string): boolean {
  return /\[MCP:(ADD|REMOVE)\|/i.test(text) || /["']?mcpServers["']?\s*:/i.test(text)
}

// [REMOVE:Name] 블록 파싱 — 리더가 불필요한 팀원 삭제 요청
export function parseRemoveBlocks(text: string): string[] {
  const cleaned = stripCodeBlocks(text)
  const names: string[] = []
  const regex = /\[REMOVE:([^\]]+)\]/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(cleaned)) !== null) {
    const name = match[1].trim()
    if (name) names.push(name)
  }
  return names
}

// [REMOVE:Name] 블록 실행 — 에이전트를 아카이브하고 삭제 (하위 팀원 연쇄 삭제)
export function executeRemoveBlocks(leaderAgentId: string, text: string): void {
  const removeNames = parseRemoveBlocks(text)
  if (removeNames.length === 0) return

  const leader = store.getAgent(leaderAgentId)
  if (!leader) return

  // 리더 또는 디렉터만 삭제 가능
  if (leader.hierarchy?.role !== 'leader' && leader.hierarchy?.role !== 'director') return

  for (const name of removeNames) {
    const agents = agentManager.listAgents()
    const target = agents.find(
      (a) =>
        a.name.toLowerCase() === name.toLowerCase() &&
        a.hierarchy?.reportsTo === leaderAgentId
    )

    if (target) {
      // ★ 연쇄 삭제: 대상이 리더(팀장)면 소속 팀원도 함께 삭제
      const members = agents.filter((a) => a.hierarchy?.reportsTo === target.id)
      for (const member of members) {
        console.log(`[remove] ${target.name} 소속 팀원 ${member.name} 연쇄 삭제`)
        agentManager.deleteAgent(member.id, target.id)
        logActivity('agent-deleted', member.id, member.name, `${target.name} 삭제로 인한 팀원 연쇄 제거`)
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:deleted', member.id))
      }

      console.log(`[remove] ${leader.name}이 ${target.name} 삭제 요청 (아카이브 보관)`)
      agentManager.deleteAgent(target.id, leaderAgentId)
      logActivity('agent-deleted', target.id, target.name, `${leader.name}이 ${target.name} 제거 (팀원 ${members.length}명 포함)`)
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('agent:deleted', target.id))

      // 위임자의 subordinates에서도 제거
      const leaderConfig = store.getAgent(leaderAgentId)
      if (leaderConfig?.hierarchy?.subordinates) {
        const updatedSubs = leaderConfig.hierarchy.subordinates.filter((id) => id !== target.id)
        agentManager.updateAgent(leaderAgentId, {
          hierarchy: { ...leaderConfig.hierarchy, subordinates: updatedSubs }
        })
      }
    }
  }

  // 독 크기 조정
  requestDockResize()
}

// 에이전트 이름으로 매칭 — 같은 그룹 우선, 없으면 자동 생성 (동적 포함)
function findOrCreateAgent(
  name: string,
  delegatorId: string,
  role?: string
): { id: string; name: string } | null {
  const agents = agentManager.listAgents()
  const lowerName = name.toLowerCase()

  // 위임자의 그룹을 먼저 확인 — 같은 그룹 내에서 우선 검색
  const delegator = store.getAgent(delegatorId)
  const delegatorGroup = delegator?.group

  if (delegatorGroup) {
    const groupExact = agents.find(
      (a) => a.group === delegatorGroup && a.name.toLowerCase() === lowerName
    )
    if (groupExact) return { id: groupExact.id, name: groupExact.name }
    const groupPartial = agents.find(
      (a) => a.group === delegatorGroup && a.name.toLowerCase().startsWith(lowerName)
    )
    if (groupPartial) return { id: groupPartial.id, name: groupPartial.name }
  }

  // 그룹 내 매칭 실패 시 전체에서 검색
  const exact = agents.find((a) => a.name.toLowerCase() === lowerName)
  if (exact) return { id: exact.id, name: exact.name }

  // startsWith 매칭
  const partial = agents.find((a) => a.name.toLowerCase().startsWith(lowerName))
  if (partial) return { id: partial.id, name: partial.name }

  // 존재하지 않으면 사전 정의에서 찾아 자동 생성
  const memberDef = findMemberDef(name)

  // delegator 역할에 따라 생성할 에이전트의 역할 결정
  const delegatorRole = delegator?.hierarchy?.role

  if (memberDef) {
    // 사전 정의가 있는 경우 — 기존 로직
    const newRole = delegatorRole === 'director' ? 'leader' : 'member'
    console.log(`[delegation] '${memberDef.name}' 사전 정의에서 자동 생성 (role: ${newRole})`)

    const agent = agentManager.createAgent({
      name: memberDef.name,
      role: memberDef.role,
      model: getDefaultModel(),
      avatar: randomAvatar(),
      systemPrompt: memberDef.systemPrompt,
      workingDirectory: getProjectRoot(),
      permissionMode: 'bypassPermissions',
      maxTurns: 50,
      hierarchy: { role: newRole, reportsTo: delegatorId }
    })

    // 위임자의 subordinates 업데이트
    updateDelegatorSubordinates(delegatorId, agent.id)
    broadcast('agent:created', agent)
    requestDockResize()
    logActivity(
      'agent-created',
      agent.id,
      agent.name,
      `${agent.name} 자동 생성 (사전 정의, role: ${newRole})`
    )
    return { id: agent.id, name: agent.name }
  }

  // ★ 사전 정의에 없으면 동적 생성!
  if (delegatorRole === 'director') {
    // 총괄 → 리더 동적 생성
    const leaderRole = role || 'Team Lead'
    console.log(`[delegation] '${name}' 동적 리더 생성 (역할: ${leaderRole})`)

    const agent = agentManager.createAgent({
      name,
      role: leaderRole,
      model: getDefaultModel(),
      avatar: randomAvatar(),
      systemPrompt: generateDynamicLeaderPrompt(name, leaderRole),
      workingDirectory: getProjectRoot(),
      permissionMode: 'bypassPermissions',
      maxTurns: 50,
      hierarchy: { role: 'leader', reportsTo: delegatorId }
    })

    attachWebFetchMcp(agent.id, leaderRole)
    updateDelegatorSubordinates(delegatorId, agent.id)
    broadcast('agent:created', agent)
    requestDockResize()
    logActivity(
      'agent-created',
      agent.id,
      agent.name,
      `${agent.name} 동적 리더 생성 (역할: ${leaderRole})`
    )
    return { id: agent.id, name: agent.name }
  } else if (delegatorRole === 'leader') {
    // 리더 → 팀원 동적 생성
    const memberRole = role || 'Developer'
    console.log(`[delegation] '${name}' 동적 팀원 생성 (역할: ${memberRole})`)

    const agent = agentManager.createAgent({
      name,
      role: memberRole,
      model: getDefaultModel(),
      avatar: randomAvatar(),
      systemPrompt: generateDynamicMemberPrompt(name, memberRole),
      workingDirectory: getProjectRoot(),
      permissionMode: 'bypassPermissions',
      maxTurns: 50,
      hierarchy: { role: 'member', reportsTo: delegatorId }
    })

    attachWebFetchMcp(agent.id, memberRole)
    updateDelegatorSubordinates(delegatorId, agent.id)
    broadcast('agent:created', agent)
    requestDockResize()
    logActivity(
      'agent-created',
      agent.id,
      agent.name,
      `${agent.name} 동적 팀원 생성 (역할: ${memberRole})`
    )
    return { id: agent.id, name: agent.name }
  } else {
    // member나 기타 역할은 동적 생성 불가
    console.warn(`[delegation] '${name}' 정의가 없고 위임자(${delegatorRole})가 동적 생성 불가`)
    return null
  }
}

// ★ 프론트엔드/디자인 역할 에이전트에 web-fetch MCP 자동 추가
function attachWebFetchMcp(agentId: string, role: string): void {
  if (!isFrontendRole(role)) return
  const config = store.getAgent(agentId)
  if (!config) return

  const existing = config.mcpConfig || []
  // 이미 web-fetch가 있으면 스킵
  if (existing.some((s) => s.name === 'web-fetch')) return

  const mcpConfig = [
    ...existing,
    {
      name: 'web-fetch',
      command: 'python',
      args: ['-m', 'mcp_server_fetch', '--ignore-robots-txt'],
      enabled: true
    }
  ]
  agentManager.updateAgent(agentId, { mcpConfig })

  // MCP config 파일 빌드
  try {
    const { buildMcpConfigFile } = require('./mcp-manager')
    buildMcpConfigFile(agentId)
  } catch { /* ignore */ }

  console.log(`[delegation] ${config.name}에 web-fetch MCP 자동 추가`)
}

// 위임자의 subordinates 업데이트 헬퍼
function updateDelegatorSubordinates(delegatorId: string, newAgentId: string): void {
  const delegatorAgent = store.getAgent(delegatorId)
  if (delegatorAgent?.hierarchy) {
    const subs = delegatorAgent.hierarchy.subordinates || []
    agentManager.updateAgent(delegatorId, {
      hierarchy: { ...delegatorAgent.hierarchy, subordinates: [...subs, newAgentId] }
    })
  }
}

function broadcast(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.webContents.send(channel, ...args)
  })
}

// ── 현재 조직 현황 빌드 (Director에게 주입) ──

export function buildOrgContext(delegatorId: string): string {
  const agents = agentManager.listAgents()
  const delegator = store.getAgent(delegatorId)
  if (!delegator) return ''

  // 위임자 직속 부하 목록
  const subordinateIds = new Set(delegator.hierarchy?.subordinates ?? [])
  const subordinates = agents.filter((a) => subordinateIds.has(a.id))

  if (subordinates.length === 0) return ''

  const lines: string[] = [
    '[현재 조직 현황 — 기존 팀장을 반드시 재사용하라!]',
    `현재 ${subordinates.length}명의 팀장이 이미 존재한다:`,
  ]

  for (const sub of subordinates) {
    const status = agentManager.getAgentState(sub.id)?.status ?? 'idle'
    const members = agents.filter(
      (a) => a.hierarchy?.reportsTo === sub.id
    )
    const memberInfo = members.length > 0
      ? members.map((m) => m.name).join(', ')
      : '팀원 없음'
    // 세션 히스토리로 활동 여부 판단
    const history = store.getSessionHistory(sub.id)
    const msgCount = history.length
    const lastActivity = history.length > 0
      ? new Date(history[history.length - 1].timestamp).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '활동 없음'
    lines.push(`- "${sub.name}" (역할: ${sub.role}, 상태: ${status}, 메시지: ${msgCount}건, 마지막: ${lastActivity}, 팀원: ${memberInfo})`)
  }

  lines.push('')
  lines.push('⚠️ 위 팀장에게 위임할 때는 반드시 정확히 같은 이름을 사용하라!')
  lines.push('⚠️ 새 팀장을 만들지 말고 기존 팀장을 재활용하라! 동일/유사한 역할의 팀장이 있으면 그 팀장에게 위임하라.')
  lines.push('⚠️ 조직 정리가 필요하면 [REMOVE:이름] 블록을 사용하라. 팀장 삭제 시 소속 팀원도 자동 삭제된다.')
  lines.push('')

  return lines.join('\n')
}

// 독 크기 조정 콜백 — index.ts에서 등록
let dockResizeCallback: ((count: number) => void) | null = null

export function setDockResizeCallback(cb: (count: number) => void): void {
  dockResizeCallback = cb
}

// 독 크기 조정 요청 — 에이전트 생성 후 호출
function requestDockResize(): void {
  const count = agentManager.listAgents().length
  if (dockResizeCallback) {
    dockResizeCallback(count)
  }
}

// 단일 라운드 위임 실행 → 결과 수집
async function executeOneRound(
  delegatorAgentId: string,
  delegatorConfig: import('../../shared/types').AgentConfig,
  response: string,
  originalMessage: string,
  failedAgentIds?: Set<string>
): Promise<{ summaryParts: string[]; synthesisResponse: string; newFailedIds: string[] }> {
  const blocks = parseDelegationBlocks(response)
  if (blocks.length === 0) return { summaryParts: [], synthesisResponse: '', newFailedIds: [] }

  // 위임 대상 에이전트 매칭 (역할 정보도 전달)
  const delegations: { block: DelegationBlock; agentId: string; agentName: string }[] = []
  for (const block of blocks) {
    dlog(`findOrCreateAgent: ${block.agentName}|${block.agentRole}`)
    const agent = findOrCreateAgent(block.agentName, delegatorAgentId, block.agentRole)
    if (agent && agent.id !== delegatorAgentId) {
      // ★ 이전 라운드에서 실패한 에이전트는 스킵
      if (failedAgentIds?.has(agent.id)) {
        dlog(`  → ${agent.name} 이전 라운드 실패 — 재위임 스킵`)
        console.log(`[delegation] ${agent.name} 이전 라운드 실패 에이전트, 스킵`)
        continue
      }
      dlog(`  → 에이전트 매칭 성공: ${agent.name} (${agent.id.slice(0, 8)})`)
      delegations.push({ block, agentId: agent.id, agentName: agent.name })
    } else if (!agent) {
      dlog(`  → 에이전트 생성 불가!`)
      console.warn(`[delegation] 에이전트 '${block.agentName}' 생성 불가, 스킵`)
    }
  }

  if (delegations.length === 0) return { summaryParts: [], synthesisResponse: '', newFailedIds: [] }

  // ★ 에러 상태 에이전트 리셋 — 위임 전에 idle로 전환
  for (const d of delegations) {
    const state = agentManager.getAgentState(d.agentId)
    if (state?.status === 'error') {
      console.log(`[delegation] ${d.agentName} error 상태 → idle로 리셋 후 위임`)
      agentManager.setAgentStatus(d.agentId, 'idle')
      agentManager.setCurrentTask(d.agentId, undefined)
      broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'idle' })
    }
  }

  // ★ 동시 위임 수 제한 — 초과분은 배치 나눠서 순차 실행
  if (delegations.length > MAX_CONCURRENT_DELEGATIONS) {
    console.log(
      `[delegation] 위임 ${delegations.length}건 → ${MAX_CONCURRENT_DELEGATIONS}건씩 배치 처리`
    )
  }

  const delegatorRole = delegatorConfig.hierarchy?.role
  const roleLabel = delegatorRole === 'director' ? 'Director' : 'Team Lead'
  const allSummaryParts: string[] = []
  const roundFailedIds: string[] = []
  const totalCount = delegations.length
  let globalCompletedCount = 0

  // 배치 분할
  const batches: typeof delegations[] = []
  for (let i = 0; i < delegations.length; i += MAX_CONCURRENT_DELEGATIONS) {
    batches.push(delegations.slice(i, i + MAX_CONCURRENT_DELEGATIONS))
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    const batchNames = batch.map((d) => d.agentName).join(', ')

    if (batches.length > 1) {
      console.log(
        `[delegation] 배치 ${batchIdx + 1}/${batches.length}: ${delegatorConfig.name}(${roleLabel}) → ${batchNames}`
      )
    }

    // 위임 시작 브로드캐스트 (배치별)
    broadcast('delegation:started', {
      leaderAgentId: delegatorAgentId,
      leaderName: delegatorConfig.name,
      delegatedTo: batch.map((d) => ({ id: d.agentId, name: d.agentName })),
      totalCount,
      batchIndex: batchIdx,
      batchTotal: batches.length
    })

    // 태스크 생성
    const tasks: TaskDelegation[] = []
    for (const d of batch) {
      const task: TaskDelegation = {
        id: uuid(),
        title: `${delegatorConfig.name}의 위임: ${d.block.task.slice(0, 50)}`,
        description: d.block.task,
        fromAgentId: delegatorAgentId,
        toAgentId: d.agentId,
        status: 'in-progress',
        createdAt: Date.now()
      }
      store.addTask(task)
      tasks.push(task)
      broadcast('task:created', task)
      logActivity(
        'task-delegated',
        delegatorAgentId,
        delegatorConfig.name,
        `${delegatorConfig.name}이 ${d.agentName}에게 작업 위임`
      )
    }

    // 배치 내 병렬 실행
    const results = await Promise.allSettled(
      batch.map(async (d, idx) => {
        try {
          agentManager.setAgentStatus(d.agentId, 'working')
          agentManager.setCurrentTask(d.agentId, d.block.task.slice(0, 100))
          broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'working' })

          const context = `[${delegatorConfig.name}(${roleLabel})로부터 위임받은 작업]\n원래 요청: ${originalMessage}\n\n작업 지시:\n${d.block.task}`
          const agentResponse = await sendMessageAndCapture(d.agentId, context)

          globalCompletedCount++
          store.updateTask(tasks[idx].id, {
            status: 'completed',
            completedAt: Date.now(),
            result: agentResponse.slice(0, 2000)
          })
          broadcast('task:updated', { ...tasks[idx], status: 'completed' })
          broadcast('delegation:agent-completed', {
            leaderAgentId: delegatorAgentId,
            agentId: d.agentId,
            agentName: d.agentName,
            completedCount: globalCompletedCount,
            totalCount,
            remainingCount: totalCount - globalCompletedCount
          })

          agentManager.setAgentStatus(d.agentId, 'idle')
          agentManager.setCurrentTask(d.agentId, undefined)
          broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'idle' })

          return { agentName: d.agentName, response: agentResponse }
        } catch (err) {
          globalCompletedCount++
          const errMsg = (err as Error).message || String(err)
          store.updateTask(tasks[idx].id, {
            status: 'failed',
            completedAt: Date.now(),
            result: `오류: ${errMsg}`
          })
          broadcast('task:updated', { ...tasks[idx], status: 'failed' })

          // ★ 실패 에이전트를 idle로 전환 (error가 아닌!) — 무한 에러 보고 루프 방지
          agentManager.setAgentStatus(d.agentId, 'idle')
          agentManager.setCurrentTask(d.agentId, undefined)
          broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'idle' })
          roundFailedIds.push(d.agentId)

          return { agentName: d.agentName, response: `[오류] ${errMsg}` }
        }
      })
    )

    // 배치 결과 수집
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { agentName, response: r } = result.value
        allSummaryParts.push(`## ${agentName}의 결과\n${r}`)
      } else {
        allSummaryParts.push(`## (실패)\n${result.reason}`)
      }
    }
  } // end batch loop

  // summaryParts를 allSummaryParts로 통합
  const summaryParts = allSummaryParts

  // ★ 각 팀원 응답을 요약 길이로 트리밍 — synthesis 컨텍스트 폭발 방지
  const MAX_SUMMARY_CHARS = 3000
  const trimmedParts = summaryParts.map((part) => {
    if (part.length <= MAX_SUMMARY_CHARS) return part
    return part.slice(0, MAX_SUMMARY_CHARS) + '\n\n... (응답이 길어 일부 생략됨)'
  })

  // ★ 종합 생략 최적화 — 모든 결과가 사소하면 CLI 호출 없이 로컬 조합
  const TRIVIAL_THRESHOLD = 200
  const allTrivial = summaryParts.length > 0 &&
    summaryParts.length <= 2 &&
    summaryParts.every((part) => part.length < TRIVIAL_THRESHOLD)

  if (allTrivial) {
    const localSynthesis = summaryParts.join('\n\n')
    console.log(
      `[delegation] 종합 CLI 생략: 모든 결과가 경미함 (${summaryParts.length}건, 각 <${TRIVIAL_THRESHOLD}자)`
    )
    return { summaryParts, synthesisResponse: localSynthesis, newFailedIds: roundFailedIds }
  }

  // 위임자에게 종합 요청 (sendMessageAndCapture로 응답 캡처)
  broadcast('delegation:synthesizing', {
    leaderAgentId: delegatorAgentId,
    leaderName: delegatorConfig.name
  })

  // 재위임 시 기존 조직 현황 주입
  const orgContext = buildOrgContext(delegatorAgentId)

  const synthesisPrompt = [
    `[작업 위임 결과 종합]`,
    `원래 사용자 요청: ${originalMessage}`,
    ``,
    orgContext,
    `아래는 팀원들의 작업 결과입니다. 이를 종합하여 사용자에게 최종 답변을 작성해주세요.`,
    `추가 위임이 필요하면 기존 팀장 이름을 정확히 사용하여 [DELEGATE:이름|역할]...[/DELEGATE] 블록을 포함하세요.`,
    ``,
    ...trimmedParts
  ].join('\n')

  const synthesisResponse = await sendMessageAndCapture(delegatorAgentId, synthesisPrompt)

  // 모든 배치에서 수집한 실패 에이전트 ID 반환
  return { summaryParts, synthesisResponse, newFailedIds: roundFailedIds }
}

// 위임 실행 — 최대 MAX_DELEGATION_ROUNDS 반복
export async function executeDelegation(
  delegatorAgentId: string,
  delegatorResponse: string,
  originalMessage: string
): Promise<void> {
  const delegatorConfig = store.getAgent(delegatorAgentId)
  if (!delegatorConfig) return

  // ── 승인 게이트: 위임 전 사용자 승인 요청 ──
  const blocks = parseDelegationBlocks(delegatorResponse)
  const targetNames = blocks.map((b) => b.agentName).join(', ')
  const approved = await requestApproval(
    'delegation',
    delegatorAgentId,
    delegatorConfig.name,
    `${delegatorConfig.name}이 ${blocks.length}건 작업을 위임하려 합니다 → ${targetNames}`,
    { targets: targetNames, taskCount: blocks.length }
  )
  if (!approved) {
    console.log(`[delegation] 사용자가 위임을 거부: ${delegatorConfig.name}`)
    broadcast('delegation:rejected', { leaderAgentId: delegatorAgentId, leaderName: delegatorConfig.name })
    return
  }

  dlog(`=== executeDelegation 시작: ${delegatorConfig.name} (${delegatorConfig.role}) ===`)
  dlog(`응답 길이: ${delegatorResponse.length}자`)
  dlog(`응답 앞부분: ${delegatorResponse.slice(0, 300)}`)

  let currentResponse = delegatorResponse
  // ★ 실패한 에이전트 누적 추적 — 다음 라운드에서 재위임 방지
  const failedAgentIds = new Set<string>()

  for (let round = 0; round < MAX_DELEGATION_ROUNDS; round++) {
    const blocks = parseDelegationBlocks(currentResponse)
    dlog(`라운드 ${round + 1}: DELEGATE 블록 ${blocks.length}개 파싱됨`)
    blocks.forEach((b, i) => dlog(`  블록 ${i + 1}: ${b.agentName}|${b.agentRole} → ${b.task.slice(0, 100)}`))
    if (blocks.length === 0) break

    console.log(
      `[delegation] 라운드 ${round + 1}/${MAX_DELEGATION_ROUNDS} 시작 (${blocks.length}건 위임)`
    )

    const { synthesisResponse, newFailedIds } = await executeOneRound(
      delegatorAgentId,
      delegatorConfig,
      currentResponse,
      originalMessage,
      failedAgentIds
    )

    // 실패 에이전트 누적
    for (const id of newFailedIds) failedAgentIds.add(id)

    // 종합 결과에 재위임 블록이 있으면 다음 라운드
    if (synthesisResponse && hasDelegation(synthesisResponse)) {
      console.log(`[delegation] 라운드 ${round + 1} 종합에서 재위임 블록 발견 → 다음 라운드`)
      currentResponse = synthesisResponse
      continue
    }

    // 재위임 없으면 — ACTION 블록 자동 실행 후 종료
    await executeAutoActions(synthesisResponse)
    break
  }

  broadcast('delegation:completed', {
    leaderAgentId: delegatorAgentId,
    leaderName: delegatorConfig.name
  })
  console.log(`[delegation] 위임 완료: ${delegatorConfig.name}`)
}
