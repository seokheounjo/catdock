// Quick test: Send message and wait for Claude response
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

function cdpEval(ws, expr, id = 1) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout`)), 60000)
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === id) {
        clearTimeout(timeout)
        ws.off('message', handler)
        if (msg.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
        } else {
          resolve(msg.result?.result)
        }
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
  let testId = 100
  console.log('=== Chat Response Test ===\n')

  const targets = await getTargets()
  const dockTarget = targets.find(t => t.url.includes('#/dock'))
  const ws = new WebSocket(dockTarget.webSocketDebuggerUrl)
  await new Promise(r => ws.on('open', r))

  // Create agent
  const result = await cdpEval(ws, `
    window.api.agent.create({
      name: 'QuickTest',
      role: 'Frontend Developer',
      avatar: { style: 'bottts', seed: 'quick' },
      systemPrompt: 'Reply with exactly one word only.',
      workingDirectory: 'C:\\\\Users\\\\jsh',
      model: 'claude-sonnet-4-20250514'
    })
  `, testId++)
  const agentId = result.value.id
  console.log(`Agent created: ${agentId}`)

  // Open chat
  await cdpEval(ws, `window.api.window.openChat('${agentId}')`, testId++)
  await new Promise(r => setTimeout(r, 3000))

  const targets2 = await getTargets()
  const chatTarget = targets2.find(t => t.url.includes(`#/chat/${agentId}`))
  const chatWs = new WebSocket(chatTarget.webSocketDebuggerUrl)
  await new Promise(r => chatWs.on('open', r))

  // Send message and wait for response (60s timeout)
  console.log('Sending message: "Hi"')
  console.log('Waiting for Claude response (up to 60s)...')

  try {
    await cdpEval(chatWs, `window.api.session.send('${agentId}', 'Hi')`, testId++)
    console.log('Session.send completed')
  } catch(e) {
    console.log('Session.send error:', e.message)
  }

  // Check history
  await new Promise(r => setTimeout(r, 2000))
  const history = await cdpEval(chatWs, `window.api.session.getHistory('${agentId}')`, testId++)
  console.log(`\nMessages (${history.value?.length}):`)
  for (const msg of (history.value || [])) {
    const preview = msg.content?.slice(0, 200) || '(empty)'
    console.log(`  [${msg.role}] ${preview}`)
  }

  // Check for errors
  const hasError = history.value?.some(m => m.role === 'system' && m.content.includes('Error'))
  const hasAssistant = history.value?.some(m => m.role === 'assistant' && m.content.length > 0)

  if (hasAssistant) {
    console.log('\n✓ Claude responded successfully!')
  } else if (hasError) {
    console.log('\n✗ Claude returned an error')
  } else {
    console.log('\n⚠ No response yet (might still be processing)')
  }

  // Cleanup
  chatWs.close()
  await cdpEval(ws, `window.api.agent.delete('${agentId}')`, testId++)
  console.log('Agent cleaned up')
  ws.close()
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
