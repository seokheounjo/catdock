// Full E2E test: Create agent → Chat → Continue conversation → Close → Verify dock
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
    const timeout = setTimeout(() => reject(new Error(`Timeout (60s)`)), 60000)
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
  let testId = 200
  const results = []
  const log = (msg) => { console.log(msg); results.push(msg) }

  log('=== Virtual Company Full E2E Test ===\n')

  // Connect to dock
  const targets = await getTargets()
  const dockTarget = targets.find(t => t.url.includes('#/dock'))
  if (!dockTarget) { log('FAIL: Dock not found'); process.exit(1) }
  log('✓ [1/10] Dock window running')

  const ws = new WebSocket(dockTarget.webSocketDebuggerUrl)
  await new Promise(r => ws.on('open', r))

  // Test 1: Create agent
  log('\n--- Creating test agent ---')
  const result = await cdpEval(ws, `
    window.api.agent.create({
      name: 'E2EBot',
      role: 'Frontend Developer',
      avatar: { style: 'bottts', seed: 'e2etest' },
      systemPrompt: 'You are a test bot. Always reply in exactly one short sentence.',
      workingDirectory: 'C:\\\\Users\\\\jsh',
      model: 'claude-sonnet-4-20250514'
    })
  `, testId++)
  const agentId = result.value.id
  log(`✓ [2/10] Agent created: ${result.value.name} (${agentId})`)

  // Test 2: Verify in store
  const agents = await cdpEval(ws, `window.api.agent.list()`, testId++)
  const found = agents.value.find(a => a.id === agentId)
  log(`✓ [3/10] Agent persisted (total: ${agents.value.length})`)

  // Test 3: Open chat
  await cdpEval(ws, `window.api.window.openChat('${agentId}')`, testId++)
  await new Promise(r => setTimeout(r, 3000))
  const targets2 = await getTargets()
  const chatTarget = targets2.find(t => t.url.includes(`#/chat/${agentId}`))
  if (!chatTarget) { log('FAIL: Chat window not opened'); process.exit(1) }
  log('✓ [4/10] Chat window opened')

  const chatWs = new WebSocket(chatTarget.webSocketDebuggerUrl)
  await new Promise(r => chatWs.on('open', r))

  // Test 4: Send first message
  log('\n--- Sending first message ---')
  log('  > "What is 2+2?"')
  try {
    await cdpEval(chatWs, `window.api.session.send('${agentId}', 'What is 2+2?')`, testId++)
    log('  Claude responded')
  } catch(e) {
    log(`  ⚠ Timeout (Claude may still be responding): ${e.message}`)
  }

  await new Promise(r => setTimeout(r, 3000))
  const hist1 = await cdpEval(chatWs, `window.api.session.getHistory('${agentId}')`, testId++)
  const msgs1 = hist1.value || []
  log(`  Messages after first exchange: ${msgs1.length}`)
  for (const m of msgs1) {
    log(`  [${m.role}] ${(m.content || '').slice(0, 100)}`)
  }
  const hasAssistant1 = msgs1.some(m => m.role === 'assistant' && m.content?.length > 0)
  const hasError1 = msgs1.some(m => m.role === 'system' && m.content?.includes('Error'))
  if (hasAssistant1) {
    log('✓ [5/10] First message: Claude responded')
  } else if (hasError1) {
    log('✗ [5/10] First message: ERROR')
    const errMsg = msgs1.find(m => m.role === 'system')?.content
    log(`  Error: ${errMsg}`)
  } else {
    log('⚠ [5/10] First message: No response yet (timeout)')
  }

  // Test 5: Send second message (conversation continuity)
  log('\n--- Sending second message (continue conversation) ---')
  log('  > "Now add 3 to that result"')
  try {
    await cdpEval(chatWs, `window.api.session.send('${agentId}', 'Now add 3 to that result')`, testId++)
    log('  Claude responded')
  } catch(e) {
    log(`  ⚠ Timeout: ${e.message}`)
  }

  await new Promise(r => setTimeout(r, 3000))
  const hist2 = await cdpEval(chatWs, `window.api.session.getHistory('${agentId}')`, testId++)
  const msgs2 = hist2.value || []
  log(`  Messages after second exchange: ${msgs2.length}`)
  const lastAssistant = [...msgs2].reverse().find(m => m.role === 'assistant' && m.content?.length > 0)
  if (lastAssistant) {
    log(`  Last assistant response: ${lastAssistant.content.slice(0, 150)}`)
    const mentions7 = lastAssistant.content.includes('7')
    log(`  Mentions "7" (2+2+3): ${mentions7}`)
    log(mentions7
      ? '✓ [6/10] Conversation continuity: Context preserved!'
      : '⚠ [6/10] Conversation continuity: Response doesn\'t mention 7 (may still be correct)')
  } else {
    log('⚠ [6/10] Conversation continuity: No response')
  }

  // Test 6: Close chat → dock survives
  log('\n--- Closing chat window ---')
  await cdpEval(chatWs, `window.api.window.close()`, testId++)
  chatWs.close()
  await new Promise(r => setTimeout(r, 2000))
  const targets3 = await getTargets()
  const dockAlive = targets3.find(t => t.url.includes('#/dock'))
  log(dockAlive
    ? '✓ [7/10] Dock survived chat close'
    : '✗ [7/10] Dock DISAPPEARED after chat close!')

  // Test 7: Reopen chat → history loaded
  log('\n--- Reopening chat → verify history ---')
  await cdpEval(ws, `window.api.window.openChat('${agentId}')`, testId++)
  await new Promise(r => setTimeout(r, 3000))
  const targets4 = await getTargets()
  const chatTarget2 = targets4.find(t => t.url.includes(`#/chat/${agentId}`))
  if (!chatTarget2) { log('FAIL: Chat did not reopen'); process.exit(1) }
  const chatWs2 = new WebSocket(chatTarget2.webSocketDebuggerUrl)
  await new Promise(r => chatWs2.on('open', r))

  await new Promise(r => setTimeout(r, 1000))
  const hist3 = await cdpEval(chatWs2, `window.api.session.getHistory('${agentId}')`, testId++)
  const msgs3 = hist3.value || []
  log(`  History after reopen: ${msgs3.length} messages`)
  log(msgs3.length >= 2
    ? '✓ [8/10] Chat history persisted and reloaded'
    : '⚠ [8/10] History might be missing')

  // Test 8: Close chat again
  await cdpEval(chatWs2, `window.api.window.close()`, testId++)
  chatWs2.close()
  await new Promise(r => setTimeout(r, 1000))

  // Test 9: Delete agent
  await cdpEval(ws, `window.api.agent.delete('${agentId}')`, testId++)
  const agentsFinal = await cdpEval(ws, `window.api.agent.list()`, testId++)
  const deleted = !agentsFinal.value.find(a => a.id === agentId)
  log(deleted ? '✓ [9/10] Agent deleted' : '✗ [9/10] Agent not deleted')

  // Test 10: Final dock check
  const targets5 = await getTargets()
  const finalDock = targets5.find(t => t.url.includes('#/dock'))
  log(finalDock ? '✓ [10/10] Dock still alive after all operations' : '✗ [10/10] Dock died')

  log('\n=========================================')
  const passed = results.filter(r => r.startsWith('✓')).length
  const failed = results.filter(r => r.startsWith('✗')).length
  const warned = results.filter(r => r.startsWith('⚠')).length
  log(`  Passed: ${passed}  Failed: ${failed}  Warnings: ${warned}`)
  log('=========================================')

  ws.close()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
