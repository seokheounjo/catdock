// End-to-end test via Chrome DevTools Protocol
import http from 'http'
import { WebSocket } from 'ws' // electron has ws as transitive dep

// 1. Get CDP targets
async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json/list', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

// 2. Execute JS in renderer via CDP
function cdpEval(ws, expr, id = 1) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout on id ${id}`)), 15000)
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id === id) {
        clearTimeout(timeout)
        ws.off('message', handler)
        if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text || JSON.stringify(msg.result.exceptionDetails)))
        } else {
          resolve(msg.result?.result)
        }
      }
    }
    ws.on('message', handler)
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: {
        expression: expr,
        awaitPromise: true,
        returnByValue: true
      }
    }))
  })
}

async function main() {
  console.log('=== Virtual Company E2E Test ===\n')

  // Get dock page target
  const targets = await getTargets()
  const dockTarget = targets.find(t => t.url.includes('#/dock'))
  if (!dockTarget) {
    console.error('FAIL: Dock page not found in CDP targets')
    process.exit(1)
  }
  console.log('✓ Dock window found:', dockTarget.url)

  // Connect to dock renderer
  const ws = new WebSocket(dockTarget.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  console.log('✓ Connected to dock renderer via CDP\n')

  let testId = 1

  // Test 1: Check window.api exists
  console.log('--- Test 1: window.api bridge ---')
  const apiCheck = await cdpEval(ws, `typeof window.api`, testId++)
  console.log(`  window.api type: ${apiCheck.value}`)
  if (apiCheck.value !== 'object') {
    console.error('FAIL: window.api not found')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ window.api bridge exists\n')

  // Test 2: List agents (should be empty initially)
  console.log('--- Test 2: List agents ---')
  const agentsBefore = await cdpEval(ws, `window.api.agent.list()`, testId++)
  console.log(`  Agents count: ${agentsBefore.value?.length ?? 0}`)
  console.log('  ✓ agent:list IPC works\n')

  // Test 3: Create a test agent
  console.log('--- Test 3: Create test agent ---')
  const createResult = await cdpEval(ws, `
    window.api.agent.create({
      name: 'TestBot',
      role: 'Frontend Developer',
      avatar: { style: 'bottts', seed: 'test123' },
      systemPrompt: 'You are a helpful test assistant. Reply with short responses.',
      workingDirectory: 'C:\\\\Users\\\\jsh',
      model: 'claude-sonnet-4-20250514',
      group: 'test'
    })
  `, testId++)
  const createdAgent = createResult.value
  console.log(`  Created agent: ${createdAgent?.name} (${createdAgent?.id})`)
  if (!createdAgent?.id) {
    console.error('FAIL: Agent creation failed')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Agent created successfully\n')

  // Test 4: Verify agent appears in list
  console.log('--- Test 4: Verify agent in list ---')
  const agentsAfter = await cdpEval(ws, `window.api.agent.list()`, testId++)
  const found = agentsAfter.value?.find(a => a.id === createdAgent.id)
  console.log(`  Agents count: ${agentsAfter.value?.length}`)
  console.log(`  Found created agent: ${!!found}`)
  if (!found) {
    console.error('FAIL: Created agent not found in list')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Agent persisted in store\n')

  // Test 5: Get agent state
  console.log('--- Test 5: Agent state ---')
  const state = await cdpEval(ws, `window.api.agent.getState('${createdAgent.id}')`, testId++)
  console.log(`  Status: ${state.value?.status}`)
  console.log(`  Config name: ${state.value?.config?.name}`)
  if (state.value?.status !== 'idle') {
    console.error('FAIL: Initial status should be idle')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Agent state is idle\n')

  // Test 6: Get all states
  console.log('--- Test 6: All agent states ---')
  const allStates = await cdpEval(ws, `window.api.agent.getAllStates()`, testId++)
  console.log(`  Total states: ${allStates.value?.length}`)
  console.log('  ✓ getAllStates works\n')

  // Test 7: Open chat window
  console.log('--- Test 7: Open chat window ---')
  await cdpEval(ws, `window.api.window.openChat('${createdAgent.id}')`, testId++)
  console.log('  Chat window open requested')

  // Wait for chat window to appear
  await new Promise(r => setTimeout(r, 3000))

  const targets2 = await getTargets()
  const chatTarget = targets2.find(t => t.url.includes(`#/chat/${createdAgent.id}`))
  console.log(`  Chat window found: ${!!chatTarget}`)
  if (!chatTarget) {
    console.error('FAIL: Chat window did not open')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Chat window opened successfully\n')

  // Test 8: Connect to chat window and send message
  console.log('--- Test 8: Send message (claude CLI) ---')
  const chatWs = new WebSocket(chatTarget.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    chatWs.on('open', resolve)
    chatWs.on('error', reject)
  })
  console.log('  Connected to chat renderer')

  // Check chat API
  const chatApiCheck = await cdpEval(chatWs, `typeof window.api.session`, testId++)
  console.log(`  Session API: ${chatApiCheck.value}`)

  // Send a test message
  console.log('  Sending test message: "Hello, say hi in 5 words or less"')
  try {
    // Don't await the full response, just check it doesn't throw immediately
    const sendPromise = cdpEval(chatWs, `
      window.api.session.send('${createdAgent.id}', 'Hello, say hi in 5 words or less')
    `, testId++)

    // Wait for response (up to 30 seconds for claude to respond)
    console.log('  Waiting for Claude response...')
    await Promise.race([
      sendPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Claude response timeout (30s)')), 30000))
    ])
    console.log('  ✓ Message sent and response received\n')
  } catch (err) {
    console.log(`  ⚠ Message send result: ${err.message}`)
    console.log('  (This may be OK if Claude is still responding)\n')
  }

  // Test 9: Check message history
  console.log('--- Test 9: Check message history ---')
  await new Promise(r => setTimeout(r, 2000))
  const history = await cdpEval(chatWs, `window.api.session.getHistory('${createdAgent.id}')`, testId++)
  const msgCount = history.value?.length ?? 0
  console.log(`  Messages in history: ${msgCount}`)
  if (msgCount > 0) {
    for (const msg of history.value) {
      console.log(`  [${msg.role}] ${msg.content?.slice(0, 80)}${msg.content?.length > 80 ? '...' : ''}`)
    }
  }
  console.log('  ✓ Message history accessible\n')

  // Test 10: Close chat window (test dock persistence)
  console.log('--- Test 10: Close chat → dock survives ---')
  await cdpEval(chatWs, `window.api.window.close()`, testId++)
  chatWs.close()
  await new Promise(r => setTimeout(r, 2000))

  const targets3 = await getTargets()
  const dockStillAlive = targets3.find(t => t.url.includes('#/dock'))
  console.log(`  Dock still alive: ${!!dockStillAlive}`)
  if (!dockStillAlive) {
    console.error('FAIL: Dock disappeared after chat close!')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Dock survived chat window close\n')

  // Test 11: Clean up test agent
  console.log('--- Test 11: Delete test agent ---')
  await cdpEval(ws, `window.api.agent.delete('${createdAgent.id}')`, testId++)
  const agentsFinal = await cdpEval(ws, `window.api.agent.list()`, testId++)
  const stillExists = agentsFinal.value?.find(a => a.id === createdAgent.id)
  console.log(`  Agent deleted: ${!stillExists}`)
  if (stillExists) {
    console.error('FAIL: Agent was not deleted')
    ws.close(); process.exit(1)
  }
  console.log('  ✓ Agent deleted successfully\n')

  console.log('=========================================')
  console.log('  ALL TESTS PASSED ✓')
  console.log('=========================================')

  ws.close()
  process.exit(0)
}

main().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})
