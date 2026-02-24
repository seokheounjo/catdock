// 독 리사이즈 테스트 — 에이전트 수 확인 + 테스트 메시지 전송
const http = require('http')
const WebSocket = require('ws')

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

async function runCDP(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = 1
    ws.on('open', () => ws.send(JSON.stringify({ id, method, params })))
    ws.on('message', (msg) => {
      const data = JSON.parse(msg.toString())
      if (data.id === id) { ws.close(); resolve(data.result) }
    })
    ws.on('error', reject)
    setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 10000)
  })
}

async function main() {
  const targets = await getTargets()
  const dock = targets.find(t => t.url.includes('#/dock'))
  if (!dock) { console.error('Dock not found'); return }

  // 에이전트 목록 확인
  const result = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `window.api.agent.list().then(a => JSON.stringify(a.map(x => x.name + '(' + (x.hierarchy?.role || '?') + ')')))`
    , awaitPromise: true, returnByValue: true
  })
  console.log('현재 에이전트:', result.result.value)

  // Director ID 가져오기
  const dirResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `window.api.agent.list().then(a => { const d = a.find(x => x.hierarchy?.role === 'director' && !x.group); return d ? d.id : null })`
    , awaitPromise: true, returnByValue: true
  })
  const directorId = dirResult.result.value
  console.log('Director ID:', directorId)

  if (!directorId) {
    console.error('Director not found!')
    return
  }

  // 채팅 열기
  const openResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `window.api.window.openChat('${directorId}')`
    , awaitPromise: true, returnByValue: true
  })
  console.log('채팅 열림')

  await new Promise(r => setTimeout(r, 2000))

  // 간단한 테스트 메시지 전송
  const sendResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `window.api.session.send('${directorId}', '간단한 테스트: Hello World를 출력하는 Node.js 스크립트를 test-output/hello.js에 만들어줘. 구현팀장과 QA팀장에게 위임해서 진행해.')`
    , awaitPromise: true, returnByValue: true
  })
  console.log('메시지 전송 완료')

  // 30초간 에이전트 수 모니터링
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const countResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: `window.api.agent.list().then(a => JSON.stringify({ count: a.length, agents: a.map(x => x.name + '(' + (x.hierarchy?.role || '?') + ')') }))`
        , awaitPromise: true, returnByValue: true
      })
      const info = JSON.parse(countResult.result.value)
      console.log(`[${(i+1)*5}s] 에이전트 ${info.count}명:`, info.agents.join(', '))
    } catch (e) {
      console.log(`[${(i+1)*5}s] 확인 실패:`, e.message)
    }
  }
}

main().catch(console.error)
