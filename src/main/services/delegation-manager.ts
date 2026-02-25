// 작업 위임 매니저 — 리더 에이전트의 응답에서 위임 블록을 파싱하고 실행
import { BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import * as agentManager from './agent-manager'
import * as store from './store'
import { logActivity } from './activity-logger'
import {
  findMemberDef,
  randomAvatar,
  getProjectRoot,
  generateDynamicLeaderPrompt,
  generateDynamicMemberPrompt
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
  originalMessage: string
): Promise<{ summaryParts: string[]; synthesisResponse: string }> {
  const blocks = parseDelegationBlocks(response)
  if (blocks.length === 0) return { summaryParts: [], synthesisResponse: '' }

  // 위임 대상 에이전트 매칭 (역할 정보도 전달)
  const delegations: { block: DelegationBlock; agentId: string; agentName: string }[] = []
  for (const block of blocks) {
    const agent = findOrCreateAgent(block.agentName, delegatorAgentId, block.agentRole)
    if (agent && agent.id !== delegatorAgentId) {
      delegations.push({ block, agentId: agent.id, agentName: agent.name })
    } else if (!agent) {
      console.warn(`[delegation] 에이전트 '${block.agentName}' 생성 불가, 스킵`)
    }
  }

  if (delegations.length === 0) return { summaryParts: [], synthesisResponse: '' }

  const delegatedNames = delegations.map((d) => d.agentName).join(', ')
  const delegatorRole = delegatorConfig.hierarchy?.role
  const roleLabel = delegatorRole === 'director' ? 'Director' : 'Team Lead'

  // 위임 시작 브로드캐스트
  broadcast('delegation:started', {
    leaderAgentId: delegatorAgentId,
    leaderName: delegatorConfig.name,
    delegatedTo: delegations.map((d) => ({ id: d.agentId, name: d.agentName })),
    totalCount: delegations.length
  })

  console.log(
    `[delegation] ${delegatorConfig.name}(${roleLabel}) → ${delegatedNames} (${delegations.length}건)`
  )

  // 태스크 생성 + 병렬 실행
  const tasks: TaskDelegation[] = []
  for (const d of delegations) {
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

  // 병렬 실행
  let completedCount = 0
  const results = await Promise.allSettled(
    delegations.map(async (d, idx) => {
      try {
        agentManager.setAgentStatus(d.agentId, 'working')
        agentManager.setCurrentTask(d.agentId, d.block.task.slice(0, 100))
        broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'working' })

        const context = `[${delegatorConfig.name}(${roleLabel})로부터 위임받은 작업]\n원래 요청: ${originalMessage}\n\n작업 지시:\n${d.block.task}`
        const agentResponse = await sendMessageAndCapture(d.agentId, context)

        completedCount++
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
          completedCount,
          totalCount: delegations.length,
          remainingCount: delegations.length - completedCount
        })

        agentManager.setAgentStatus(d.agentId, 'idle')
        agentManager.setCurrentTask(d.agentId, undefined)
        broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'idle' })

        return { agentName: d.agentName, response: agentResponse }
      } catch (err) {
        completedCount++
        const errMsg = (err as Error).message || String(err)
        store.updateTask(tasks[idx].id, {
          status: 'failed',
          completedAt: Date.now(),
          result: `오류: ${errMsg}`
        })
        broadcast('task:updated', { ...tasks[idx], status: 'failed' })

        agentManager.setAgentStatus(d.agentId, 'error')
        agentManager.setCurrentTask(d.agentId, undefined)
        broadcast('agent:status-changed', d.agentId, { id: d.agentId, status: 'error' })

        return { agentName: d.agentName, response: `[오류] ${errMsg}` }
      }
    })
  )

  // 결과 수집
  const summaryParts: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { agentName, response: r } = result.value
      summaryParts.push(`## ${agentName}의 결과\n${r}`)
    } else {
      summaryParts.push(`## (실패)\n${result.reason}`)
    }
  }

  // 위임자에게 종합 요청 (sendMessageAndCapture로 응답 캡처)
  broadcast('delegation:synthesizing', {
    leaderAgentId: delegatorAgentId,
    leaderName: delegatorConfig.name
  })

  const synthesisPrompt = [
    `[작업 위임 결과 종합]`,
    `원래 사용자 요청: ${originalMessage}`,
    ``,
    `아래는 팀원들의 작업 결과입니다. 이를 종합하여 사용자에게 최종 답변을 작성해주세요.`,
    `추가 위임이 필요하면 [DELEGATE:이름|역할]...[/DELEGATE] 블록을 포함하세요.`,
    ``,
    ...summaryParts
  ].join('\n')

  const synthesisResponse = await sendMessageAndCapture(delegatorAgentId, synthesisPrompt)

  return { summaryParts, synthesisResponse }
}

// 위임 실행 — 최대 MAX_DELEGATION_ROUNDS 반복
export async function executeDelegation(
  delegatorAgentId: string,
  delegatorResponse: string,
  originalMessage: string
): Promise<void> {
  const delegatorConfig = store.getAgent(delegatorAgentId)
  if (!delegatorConfig) return

  let currentResponse = delegatorResponse

  for (let round = 0; round < MAX_DELEGATION_ROUNDS; round++) {
    const blocks = parseDelegationBlocks(currentResponse)
    if (blocks.length === 0) break

    console.log(
      `[delegation] 라운드 ${round + 1}/${MAX_DELEGATION_ROUNDS} 시작 (${blocks.length}건 위임)`
    )

    const { synthesisResponse } = await executeOneRound(
      delegatorAgentId,
      delegatorConfig,
      currentResponse,
      originalMessage
    )

    // 종합 결과에 재위임 블록이 있으면 다음 라운드
    if (synthesisResponse && hasDelegation(synthesisResponse)) {
      console.log(`[delegation] 라운드 ${round + 1} 종합에서 재위임 블록 발견 → 다음 라운드`)
      currentResponse = synthesisResponse
      continue
    }

    // 재위임 없으면 종료
    break
  }

  broadcast('delegation:completed', {
    leaderAgentId: delegatorAgentId,
    leaderName: delegatorConfig.name
  })
  console.log(`[delegation] 위임 완료: ${delegatorConfig.name}`)
}
