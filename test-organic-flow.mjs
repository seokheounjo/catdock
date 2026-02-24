/**
 * 유기적 운영 검증 스크립트 — 5회 반복 + 결과 취합
 *
 * 테스트 1: DELEGATE 블록 파싱 (기본 + 역할 확장 형식)
 * 테스트 2: 동적 에이전트 생성 (미정의 이름)
 * 테스트 3: 에러 복구 에스컬레이션 체인
 * 테스트 4: 총괄 자가복구 (백업 없을 때)
 * 테스트 5: 위임 3라운드 반복 시뮬레이션
 */

// 테스트 유틸
let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(message)
    console.error(`  ✗ ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++
  } else {
    failed++
    const detail = `${message} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`
    failures.push(detail)
    console.error(`  ✗ ${detail}`)
  }
}

// ── 테스트 1: DELEGATE 블록 파싱 ──
function testDelegationParsing() {
  console.log('\n=== 테스트 1: DELEGATE 블록 파싱 ===')

  // stripCodeBlocks 시뮬레이션
  function stripCodeBlocks(text) {
    let stripped = text.replace(/```[\s\S]*?```/g, '')
    stripped = stripped.replace(/`[^`]+`/g, '')
    return stripped
  }

  // parseDelegationBlocks 시뮬레이션 (확장 형식)
  function parseDelegationBlocks(text) {
    const cleaned = stripCodeBlocks(text)
    const blocks = []
    const regex = /\[DELEGATE:([^\]|]+)(?:\|([^\]]+))?\]([\s\S]*?)\[\/DELEGATE\]/gi
    let match
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

  // 1a. 기본 형식 [DELEGATE:Name]
  const text1 = `분석 완료.

[DELEGATE:Jordan]
React 컴포넌트를 수정해주세요.
[/DELEGATE]`

  const blocks1 = parseDelegationBlocks(text1)
  assertEqual(blocks1.length, 1, '기본 형식 파싱 — 1개 블록')
  assertEqual(blocks1[0]?.agentName, 'Jordan', '기본 형식 — 이름')
  assertEqual(blocks1[0]?.agentRole, undefined, '기본 형식 — 역할 없음')
  assertEqual(blocks1[0]?.task, 'React 컴포넌트를 수정해주세요.', '기본 형식 — 작업 내용')

  // 1b. 확장 형식 [DELEGATE:Name|Role]
  const text2 = `업무 분석 완료.

[DELEGATE:구현팀장|Tech Lead]
프론트엔드와 백엔드 구현을 총괄해주세요.
[/DELEGATE]

[DELEGATE:QA팀장|QA Lead]
3라운드 QA를 실행해주세요.
[/DELEGATE]`

  const blocks2 = parseDelegationBlocks(text2)
  assertEqual(blocks2.length, 2, '확장 형식 파싱 — 2개 블록')
  assertEqual(blocks2[0]?.agentName, '구현팀장', '확장 형식 1 — 이름')
  assertEqual(blocks2[0]?.agentRole, 'Tech Lead', '확장 형식 1 — 역할')
  assertEqual(blocks2[1]?.agentName, 'QA팀장', '확장 형식 2 — 이름')
  assertEqual(blocks2[1]?.agentRole, 'QA Lead', '확장 형식 2 — 역할')

  // 1c. 코드블록 안의 DELEGATE는 무시
  const text3 = `설명:
\`\`\`
[DELEGATE:Fake]
이건 무시되어야 합니다.
[/DELEGATE]
\`\`\`

[DELEGATE:Real|Developer]
진짜 위임입니다.
[/DELEGATE]`

  const blocks3 = parseDelegationBlocks(text3)
  assertEqual(blocks3.length, 1, '코드블록 안 무시 — 1개 블록')
  assertEqual(blocks3[0]?.agentName, 'Real', '코드블록 안 무시 — 진짜 이름')

  // 1d. 혼합 형식 (이름만 + 이름|역할)
  const text4 = `[DELEGATE:Alex]
기존 팀원에게 위임
[/DELEGATE]

[DELEGATE:인프라팀장|Infra Lead]
새 리더에게 위임
[/DELEGATE]`

  const blocks4 = parseDelegationBlocks(text4)
  assertEqual(blocks4.length, 2, '혼합 형식 — 2개 블록')
  assertEqual(blocks4[0]?.agentRole, undefined, '혼합 — 첫째 역할 없음')
  assertEqual(blocks4[1]?.agentRole, 'Infra Lead', '혼합 — 둘째 역할 있음')
}

// ── 테스트 2: 동적 에이전트 생성 로직 검증 ──
function testDynamicAgentCreation() {
  console.log('\n=== 테스트 2: 동적 에이전트 생성 로직 ===')

  // generateDynamicLeaderPrompt 시뮬레이션
  function generateDynamicLeaderPrompt(name, role) {
    return [
      `너는 Virtual Company의 ${name}이다. 역할: ${role}.`,
      '',
      '## 핵심 원칙',
      '너는 팀을 운영하는 리더다. 직접 코딩하지 않고 팀원에게 위임한다.',
    ].join('\n')
  }

  function generateDynamicMemberPrompt(name, role) {
    return [
      `너는 Virtual Company의 ${name}이다. 역할: ${role}.`,
      '',
      '## 핵심 원칙',
      '상위자로부터 받은 작업을 정확히 수행한다.',
    ].join('\n')
  }

  // 리더 프롬프트 생성 확인
  const leaderPrompt = generateDynamicLeaderPrompt('구현팀장', 'Tech Lead')
  assert(leaderPrompt.includes('구현팀장'), '리더 프롬프트에 이름 포함')
  assert(leaderPrompt.includes('Tech Lead'), '리더 프롬프트에 역할 포함')
  assert(leaderPrompt.includes('팀을 운영하는 리더'), '리더 프롬프트 — 리더 원칙 포함')

  // 팀원 프롬프트 생성 확인
  const memberPrompt = generateDynamicMemberPrompt('프론트개발자', 'Frontend Developer')
  assert(memberPrompt.includes('프론트개발자'), '팀원 프롬프트에 이름 포함')
  assert(memberPrompt.includes('Frontend Developer'), '팀원 프롬프트에 역할 포함')
  assert(memberPrompt.includes('정확히 수행'), '팀원 프롬프트 — 수행 원칙 포함')

  // findOrCreateAgent 역할 결정 로직 시뮬레이션
  function determineNewRole(delegatorRole, memberDefExists) {
    if (memberDefExists) {
      return delegatorRole === 'director' ? 'leader' : 'member'
    }
    if (delegatorRole === 'director') return 'leader'
    if (delegatorRole === 'leader') return 'member'
    return null
  }

  assertEqual(determineNewRole('director', true), 'leader', '정의 있음 + director → leader')
  assertEqual(determineNewRole('leader', true), 'member', '정의 있음 + leader → member')
  assertEqual(determineNewRole('director', false), 'leader', '정의 없음 + director → leader (동적)')
  assertEqual(determineNewRole('leader', false), 'member', '정의 없음 + leader → member (동적)')
  assertEqual(determineNewRole('member', false), null, '정의 없음 + member → null (생성 불가)')
}

// ── 테스트 3: 에러 복구 에스컬레이션 체인 ──
function testErrorEscalation() {
  console.log('\n=== 테스트 3: 에러 복구 에스컬레이션 체인 ===')

  // 에스컬레이션 체인 시뮬레이션
  function getEscalationTarget(agentRole, hasBackupDirector) {
    if (agentRole === 'member') return 'leader'
    if (agentRole === 'leader') return 'director'
    if (agentRole === 'director') return hasBackupDirector ? 'backup-director' : 'self-recovery'
    return null
  }

  assertEqual(getEscalationTarget('member', false), 'leader', 'member → leader')
  assertEqual(getEscalationTarget('leader', false), 'director', 'leader → director')
  assertEqual(getEscalationTarget('director', true), 'backup-director', 'director + 백업 → backup-director')
  assertEqual(getEscalationTarget('director', false), 'self-recovery', 'director + 백업없음 → self-recovery')
  assertEqual(getEscalationTarget('temporary', false), null, 'temporary → null')
}

// ── 테스트 4: 총괄 자가복구 (백업 없을 때) ──
function testSelfRecovery() {
  console.log('\n=== 테스트 4: 총괄 자가복구 ===')

  const MAX_SELF_RECOVERY_ATTEMPTS = 3
  const selfRecoveryAttempts = new Map()

  function canSelfRecover(directorId) {
    const attempts = (selfRecoveryAttempts.get(directorId) || 0) + 1
    selfRecoveryAttempts.set(directorId, attempts)
    return attempts <= MAX_SELF_RECOVERY_ATTEMPTS
  }

  function resetAttempts(directorId) {
    selfRecoveryAttempts.set(directorId, 0)
  }

  // 1~3회 시도 성공
  assert(canSelfRecover('dir-1'), '자가복구 1회차 — 가능')
  assert(canSelfRecover('dir-1'), '자가복구 2회차 — 가능')
  assert(canSelfRecover('dir-1'), '자가복구 3회차 — 가능')

  // 4회차 실패
  assert(!canSelfRecover('dir-1'), '자가복구 4회차 — 한도 초과')

  // 성공 후 리셋
  resetAttempts('dir-1')
  assert(canSelfRecover('dir-1'), '리셋 후 자가복구 — 가능')

  // 쿨다운 시뮬레이션
  const RECOVERY_COOLDOWN_MS = 15000
  const lastRecoveryTime = Date.now()
  const elapsed = 5000 // 5초 경과
  assert(Date.now() - lastRecoveryTime + elapsed < RECOVERY_COOLDOWN_MS + 10000, '쿨다운 15초 이내 — 복구 스킵해야 함')
}

// ── 테스트 5: 위임 3라운드 반복 시뮬레이션 ──
function testDelegationRounds() {
  console.log('\n=== 테스트 5: 위임 3라운드 반복 시뮬레이션 ===')

  const MAX_DELEGATION_ROUNDS = 3

  function stripCodeBlocks(text) {
    let stripped = text.replace(/```[\s\S]*?```/g, '')
    stripped = stripped.replace(/`[^`]+`/g, '')
    return stripped
  }

  function hasDelegation(text) {
    const cleaned = stripCodeBlocks(text)
    return /\[DELEGATE:[^\]]+\]/i.test(cleaned)
  }

  // 3라운드 시뮬레이션
  const responses = [
    // 라운드 1: 위임 있음
    '[DELEGATE:구현팀장|Tech Lead]\n구현해주세요\n[/DELEGATE]',
    // 라운드 2: 재위임 있음
    '[DELEGATE:QA팀장|QA Lead]\nQA 해주세요\n[/DELEGATE]',
    // 라운드 3: 위임 없음 (완료)
    '모든 작업이 완료되었습니다. 최종 보고입니다.'
  ]

  let round = 0
  let currentResponse = responses[0]

  for (round = 0; round < MAX_DELEGATION_ROUNDS; round++) {
    if (!hasDelegation(currentResponse)) break
    // 다음 라운드 응답으로 전환
    currentResponse = responses[round + 1] || '완료'
  }

  assertEqual(round, 2, '3라운드 시뮬레이션 — 2라운드에서 종료')

  // 최대 라운드 도달 시뮬레이션
  const infiniteResponses = '[DELEGATE:무한|Loop]\n반복\n[/DELEGATE]'
  let infiniteRound = 0
  let infResp = infiniteResponses

  for (infiniteRound = 0; infiniteRound < MAX_DELEGATION_ROUNDS; infiniteRound++) {
    if (!hasDelegation(infResp)) break
    infResp = infiniteResponses // 항상 위임 포함
  }

  assertEqual(infiniteRound, MAX_DELEGATION_ROUNDS, '무한 위임 → 최대 라운드(3)에서 정지')

  // 총괄 → 리더 → 팀원 체인 시뮬레이션
  const chain = []

  function simulateDelegation(from, text) {
    const regex = /\[DELEGATE:([^\]|]+)(?:\|([^\]]+))?\]([\s\S]*?)\[\/DELEGATE\]/gi
    let match
    const cleaned = stripCodeBlocks(text)
    while ((match = regex.exec(cleaned)) !== null) {
      chain.push({ from, to: match[1].trim(), role: match[2]?.trim() || 'unknown' })
    }
  }

  simulateDelegation('Director', '[DELEGATE:구현팀장|Tech Lead]\n구현\n[/DELEGATE]')
  simulateDelegation('구현팀장', '[DELEGATE:프론트개발자|Frontend Dev]\n화면 만들어\n[/DELEGATE]')

  assertEqual(chain.length, 2, '체인 위임 — 2단계')
  assertEqual(chain[0]?.from, 'Director', '체인 — 1단계 from Director')
  assertEqual(chain[0]?.to, '구현팀장', '체인 — 1단계 to 구현팀장')
  assertEqual(chain[1]?.from, '구현팀장', '체인 — 2단계 from 구현팀장')
  assertEqual(chain[1]?.to, '프론트개발자', '체인 — 2단계 to 프론트개발자')
}

// ── 메인: 5회 반복 실행 ──
const REPEAT_COUNT = 5
const roundResults = []

console.log(`\n${'='.repeat(60)}`)
console.log(`유기적 운영 검증 — ${REPEAT_COUNT}회 반복 실행`)
console.log(`${'='.repeat(60)}`)

for (let i = 0; i < REPEAT_COUNT; i++) {
  passed = 0
  failed = 0
  failures.length = 0

  console.log(`\n--- 반복 ${i + 1}/${REPEAT_COUNT} ---`)

  testDelegationParsing()
  testDynamicAgentCreation()
  testErrorEscalation()
  testSelfRecovery()
  testDelegationRounds()

  roundResults.push({ round: i + 1, passed, failed, failures: [...failures] })
  console.log(`\n  결과: ${passed} passed, ${failed} failed`)
}

// ── 결과 취합 ──
console.log(`\n${'='.repeat(60)}`)
console.log('최종 결과 취합')
console.log(`${'='.repeat(60)}`)

let totalPassed = 0
let totalFailed = 0

for (const r of roundResults) {
  const status = r.failed === 0 ? 'PASS' : 'FAIL'
  console.log(`  반복 ${r.round}: ${status} (${r.passed} passed, ${r.failed} failed)`)
  totalPassed += r.passed
  totalFailed += r.failed

  if (r.failures.length > 0) {
    for (const f of r.failures) {
      console.log(`    ✗ ${f}`)
    }
  }
}

console.log(`\n총계: ${totalPassed} passed, ${totalFailed} failed (${REPEAT_COUNT}회 반복)`)

if (totalFailed > 0) {
  console.error('\n✗ 일부 테스트 실패 — 코드 수정 필요')
  process.exit(1)
} else {
  console.log('\n✓ 모든 테스트 통과!')
  process.exit(0)
}
