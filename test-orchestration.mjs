// ── 오케스트레이션 통합 테스트 (Mock 기반) ──

// 1) parseDelegationBlocks
function parseDelegationBlocks(text) {
  const blocks = []
  const regex = /\[DELEGATE:([^\]]+)\]([\s\S]*?)\[\/DELEGATE\]/gi
  let match
  while ((match = regex.exec(text)) !== null) {
    const agentName = match[1].trim()
    const task = match[2].trim()
    if (agentName && task) blocks.push({ agentName, task })
  }
  return blocks
}

function hasDelegation(text) {
  return /\[DELEGATE:[^\]]+\]/i.test(text)
}

// 2) Jordan 응답 시뮬레이션
const jordanResponse = `
이 작업은 프론트엔드와 백엔드 모두 수정이 필요합니다.

[DELEGATE:Alex]
src/renderer/src/App.tsx에 다크모드 토글 버튼을 추가해주세요.
- Tailwind CSS의 dark: variant 사용
- 상태는 Zustand store에 저장
[/DELEGATE]

[DELEGATE:Sam]
src/main/services/store.ts에 다크모드 설정 저장/로드 기능을 추가해주세요.
- GlobalSettings에 darkMode: boolean 필드 추가
[/DELEGATE]

[DELEGATE:Casey]
다크모드 전환 시 모든 윈도우에서 정상 동작하는지 테스트해주세요.
[/DELEGATE]
`

let pass = 0
let fail = 0

function check(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`)
    pass++
  } else {
    console.log(`  FAIL: ${name}`)
    fail++
  }
}

console.log('=== 오케스트레이션 통합 테스트 ===\n')

// 3) 위임 감지
console.log('[1] 위임 감지')
check('일반 텍스트는 위임 아님', !hasDelegation('Just a normal response'))
check('DELEGATE 블록 감지', hasDelegation(jordanResponse))

// 4) 블록 파싱
console.log('\n[2] 블록 파싱')
const blocks = parseDelegationBlocks(jordanResponse)
check('3개 블록 파싱됨', blocks.length === 3)
check('Alex 블록 존재', blocks[0]?.agentName === 'Alex')
check('Sam 블록 존재', blocks[1]?.agentName === 'Sam')
check('Casey 블록 존재', blocks[2]?.agentName === 'Casey')
check('Alex 작업 내용 포함', blocks[0]?.task.includes('다크모드 토글'))

// 5) 에이전트 이름 매칭
console.log('\n[3] 에이전트 이름 매칭')
const mockAgents = [
  { id: 'a1', name: 'Jordan', hierarchy: { role: 'leader' } },
  { id: 'a2', name: 'Alex', hierarchy: { role: 'member' } },
  { id: 'a3', name: 'Sam', hierarchy: { role: 'member' } },
  { id: 'a4', name: 'Riley', hierarchy: { role: 'member' } },
  { id: 'a5', name: 'Casey', hierarchy: { role: 'member' } },
  { id: 'a6', name: 'Morgan', hierarchy: { role: 'member' } },
]

function findAgentByName(name) {
  const lowerName = name.toLowerCase()
  return mockAgents.find(a => a.name.toLowerCase() === lowerName) ||
         mockAgents.find(a => a.name.toLowerCase().startsWith(lowerName)) ||
         null
}

check('Alex 매칭', findAgentByName('Alex')?.id === 'a2')
check('sam (소문자) 매칭', findAgentByName('sam')?.id === 'a3')
check('Cas (부분매칭)', findAgentByName('Cas')?.id === 'a5')
check('없는 에이전트 null', findAgentByName('Unknown') === null)

// 6) 리더 자기위임 방지
console.log('\n[4] 리더 자기위임 방지')
const delegationsFiltered = blocks
  .map(b => findAgentByName(b.agentName))
  .filter(a => a && a.id !== 'a1') // Jordan 제외
check('Jordan 제외 후 3명 유지', delegationsFiltered.length === 3)

const jordanDelegateTest = parseDelegationBlocks('[DELEGATE:Jordan]\n셀프 작업\n[/DELEGATE]')
const selfFiltered = jordanDelegateTest
  .map(b => findAgentByName(b.agentName))
  .filter(a => a && a.id !== 'a1')
check('Jordan 자기위임 필터링', selfFiltered.length === 0)

// 7) 재귀 방지
console.log('\n[5] 재귀 방지 플래그')
const delegatingLeaders = new Set()
const leaderId = 'a1'

check('첫 위임 허용', !delegatingLeaders.has(leaderId))
delegatingLeaders.add(leaderId)
check('위임 중 재위임 차단', delegatingLeaders.has(leaderId))
delegatingLeaders.delete(leaderId)
check('위임 완료 후 재허용', !delegatingLeaders.has(leaderId))

// 8) Promise.allSettled 시뮬레이션
console.log('\n[6] 병렬 실행 + 부분 실패 처리')
const results = await Promise.allSettled([
  Promise.resolve({ agentName: 'Alex', response: '다크모드 토글 추가 완료' }),
  Promise.resolve({ agentName: 'Sam', response: 'GlobalSettings에 darkMode 추가 완료' }),
  Promise.reject(new Error('Casey 세션 타임아웃')),
])

const succeeded = results.filter(r => r.status === 'fulfilled').length
const failed2 = results.filter(r => r.status === 'rejected').length
check('성공 2건 수집', succeeded === 2)
check('실패 1건 수집', failed2 === 1)

// 종합 프롬프트 생성
const summaryParts = []
for (const result of results) {
  if (result.status === 'fulfilled') {
    summaryParts.push(`## ${result.value.agentName}: ${result.value.response}`)
  } else {
    summaryParts.push(`## (실패): ${result.reason}`)
  }
}
check('종합 프롬프트 3 파트', summaryParts.length === 3)

// 9) 엣지 케이스
console.log('\n[7] 엣지 케이스')
check('빈 문자열', parseDelegationBlocks('').length === 0)
check('DELEGATE 태그만', parseDelegationBlocks('[DELEGATE:Alex][/DELEGATE]').length === 0) // 빈 task
check('닫는 태그 없음', parseDelegationBlocks('[DELEGATE:Alex]\n작업\n').length === 0)
check('중첩 불가', parseDelegationBlocks('[DELEGATE:Alex]\n[DELEGATE:Sam]\n작업\n[/DELEGATE]\n[/DELEGATE]').length === 1)

// 결과
console.log(`\n=== 결과: ${pass} PASS, ${fail} FAIL ===`)
if (fail > 0) process.exit(1)
