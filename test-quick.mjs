// Quick chat test - single message, wait for full response
import http from 'http'
import { WebSocket } from 'ws'

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json/list', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

function cdpEval(ws, expr, id) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout`)), 120000)
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === id) {
        clearTimeout(timeout)
        ws.off('message', handler)
        resolve(msg.result?.result)
      }
    }
    ws.on('message', handler)
    ws.send(JSON.stringify({
      id, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    }))
  })
}

async function main() {
  let id = 300
  const targets = await getTargets()
  const dock = targets.find(t => t.url.includes('#/dock'))
  const ws = new WebSocket(dock.webSocketDebuggerUrl)
  await new Promise(r => ws.on('open', r))

  // Create agent
  const agent = await cdpEval(ws, `
    window.api.agent.create({
      name: 'QuickBot',
      role: 'Frontend Developer',
      avatar: { style: 'bottts', seed: 'quick' },
      systemPrompt: 'Reply in one sentence only.',
      workingDirectory: 'C:\\\\Users\\\\jsh',
      model: 'claude-sonnet-4-20250514'
    })
  `, id++)
  console.log(`Agent: ${agent.value.name} (${agent.value.id})`)

  // Open chat
  await cdpEval(ws, `window.api.window.openChat('${agent.value.id}')`, id++)
  await new Promise(r => setTimeout(r, 3000))
  const targets2 = await getTargets()
  const chat = targets2.find(t => t.url.includes(`#/chat/${agent.value.id}`))
  const chatWs = new WebSocket(chat.webSocketDebuggerUrl)
  await new Promise(r => chatWs.on('open', r))

  // Send message and WAIT (120s timeout)
  console.log('Sending: "Say hello"')
  const start = Date.now()
  try {
    await cdpEval(chatWs, `window.api.session.send('${agent.value.id}', 'Say hello')`, id++)
    console.log(`Response received in ${((Date.now() - start) / 1000).toFixed(1)}s`)
  } catch(e) {
    console.log(`Timeout after ${((Date.now() - start) / 1000).toFixed(1)}s`)
  }

  // Check history
  const hist = await cdpEval(chatWs, `window.api.session.getHistory('${agent.value.id}')`, id++)
  console.log(`\nHistory (${hist.value?.length} messages):`)
  for (const m of (hist.value || [])) {
    console.log(`  [${m.role}] ${(m.content || '(empty)').slice(0, 200)}`)
    if (m.costDelta) console.log(`  cost: $${m.costDelta}`)
  }

  // Cleanup
  chatWs.close()
  await cdpEval(ws, `window.api.agent.delete('${agent.value.id}')`, id++)
  ws.close()
  console.log('\nDone')
}

main().catch(err => { console.error(err); process.exit(1) })
