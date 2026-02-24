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
    setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 5000)
  })
}

async function main() {
  const targets = await getTargets()
  const dock = targets.find(t => t.url.includes('#/dock'))
  if (!dock) { console.error('Dock not found'); return }

  // 에이전트 수 + 역할 확인
  const agentResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `window.api.agent.list().then(a => JSON.stringify(a.map(x => ({ name: x.name, role: x.role, hRole: x.hierarchy?.role }))))`,
    awaitPromise: true, returnByValue: true
  })
  const agents = JSON.parse(agentResult.result.value)
  console.log(`에이전트 ${agents.length}명:`)
  agents.forEach(a => console.log(`  ${a.name} [${a.hRole}] — ${a.role}`))

  // 독 윈도우 크기 확인
  const sizeResult = await runCDP(dock.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `JSON.stringify({ outerWidth: window.outerWidth, outerHeight: window.outerHeight, screenWidth: screen.availWidth })`,
    returnByValue: true
  })
  console.log('독 창 크기:', sizeResult.result.value)
}

main().catch(console.error)
