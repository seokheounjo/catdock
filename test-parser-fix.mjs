// 코드블록 안의 DELEGATE 무시 테스트

function stripCodeBlocks(text) {
  let stripped = text.replace(/```[\s\S]*?```/g, '')
  stripped = stripped.replace(/`[^`]+`/g, '')
  return stripped
}

function parseDelegationBlocks(text) {
  const cleaned = stripCodeBlocks(text)
  const blocks = []
  const regex = /\[DELEGATE:([^\]]+)\]([\s\S]*?)\[\/DELEGATE\]/gi
  let match
  while ((match = regex.exec(cleaned)) !== null) {
    const agentName = match[1].trim()
    const task = match[2].trim()
    if (agentName && task) blocks.push({ agentName, task })
  }
  return blocks
}

function hasDelegation(text) {
  const cleaned = stripCodeBlocks(text)
  return /\[DELEGATE:[^\]]+\]/i.test(cleaned)
}

// 테스트 1: 코드블록 안의 DELEGATE는 무시
const withCodeBlock = `분석 결과입니다.

\`\`\`
[DELEGATE:Alex]
예시 코드
[/DELEGATE]
\`\`\`

위 예시처럼 동작합니다.`

console.log('Test 1 (코드블록 안):', hasDelegation(withCodeBlock) ? 'FAIL' : 'PASS')

// 테스트 2: 진짜 DELEGATE는 감지
const realDelegate = `작업을 위임합니다.

[DELEGATE:Alex]
다크모드 토글 추가해주세요
[/DELEGATE]`

console.log('Test 2 (진짜 위임):', hasDelegation(realDelegate) ? 'PASS' : 'FAIL')
const blocks2 = parseDelegationBlocks(realDelegate)
console.log('  blocks:', blocks2.length === 1 ? 'PASS' : 'FAIL', blocks2)

// 테스트 3: 코드블록 안 + 진짜 혼합
const mixed = `예시:
\`\`\`
[DELEGATE:Sam]
이건 예시
[/DELEGATE]
\`\`\`

실제 위임:
[DELEGATE:Alex]
이건 진짜 작업
[/DELEGATE]`

const blocks3 = parseDelegationBlocks(mixed)
console.log('Test 3 (혼합):', blocks3.length === 1 && blocks3[0].agentName === 'Alex' ? 'PASS' : 'FAIL')

// 테스트 4: 인라인 코드
const inline = 'Use `[DELEGATE:Alex]task[/DELEGATE]` format'
console.log('Test 4 (인라인):', hasDelegation(inline) ? 'FAIL' : 'PASS')

console.log('\nDone!')
