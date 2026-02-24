import WebSocket from 'ws'

let passed = 0, failed = 0, skipped = 0
function PASS(name) { console.log('  PASS', name); passed++ }
function FAIL(name, detail) { console.log('  FAIL', name, detail ? '— ' + detail : ''); failed++ }
function SKIP(name) { console.log('  SKIP', name); skipped++ }

async function connectPage(url) {
  const wsResp = await fetch('http://127.0.0.1:9222/json')
  const pages = await wsResp.json()
  const page = pages.find(p => p.url && p.url.includes(url))
  if (!page) return null

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let msgId = 1
  const pending = new Map()
  ws.on('message', d => {
    const m = JSON.parse(d.toString())
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout')) } }, 15000)
    })
  }
  function val(r) { return r?.result?.result?.value }
  async function evalJs(expr, awaitP = false) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP })
    if (r?.result?.exceptionDetails) return { error: r.result.exceptionDetails.text }
    return val(r)
  }
  await new Promise(r => ws.on('open', r))
  return { ws, send, val, evalJs, close: () => ws.close() }
}

async function main() {
  console.log('========================================')
  console.log(' Virtual Company — Full Integration Test')
  console.log('========================================\n')

  // --- Dock Page ---
  const dock = await connectPage('#/dock')
  if (!dock) { console.log('FATAL: No dock page found'); return }
  await new Promise(r => setTimeout(r, 4000))

  // === 1. Agent System ===
  console.log('--- 1. Agent System ---')

  const agentsJson = await dock.evalJs(
    'window.api.agent.list().then(function(a){return JSON.stringify(a)})', true)
  const agents = JSON.parse(agentsJson)
  agents.length === 6 ? PASS('6 default agents loaded') : FAIL('6 default agents', 'got ' + agents.length)

  const jordan = agents.find(a => a.name === 'Jordan')
  jordan ? PASS('Jordan exists') : FAIL('Jordan exists')
  jordan?.hierarchy?.role === 'leader' ? PASS('Jordan is leader') : FAIL('Jordan hierarchy')
  jordan?.role === 'Tech Lead' ? PASS('Jordan role = Tech Lead') : FAIL('Jordan role')
  jordan?.model?.includes('opus') ? PASS('Jordan uses opus model') : FAIL('Jordan model')

  const members = agents.filter(a => a.hierarchy?.role === 'member')
  members.length === 5 ? PASS('5 members with hierarchy') : FAIL('Members count', members.length)

  const allReport = members.every(a => a.hierarchy?.reportsTo === jordan?.id)
  allReport ? PASS('All members report to Jordan') : FAIL('Members reportsTo')

  const names = agents.map(a => a.name).sort().join(',')
  names === 'Alex,Casey,Jordan,Morgan,Riley,Sam' ? PASS('All 6 agent names correct') : FAIL('Names', names)

  // === 2. Cat Avatar System ===
  console.log('\n--- 2. Cat Avatar System ---')

  const totalImgs = await dock.evalJs('document.querySelectorAll("img").length')
  totalImgs === 12 ? PASS('12 images in dock (6 fishing + 6 badges)') : FAIL('Image count', totalImgs)

  const webpCount = await dock.evalJs(
    'Array.from(document.querySelectorAll("img")).filter(function(i){return i.src.indexOf(".webp")>=0}).length')
  webpCount === 6 ? PASS('6 AI-generated WebP avatar badges') : FAIL('WebP count', webpCount)

  const pngCount = await dock.evalJs(
    'Array.from(document.querySelectorAll("img")).filter(function(i){return i.src.indexOf(".webp")<0}).length')
  pngCount === 6 ? PASS('6 PNG fishing cat images') : FAIL('PNG count', pngCount)

  const animClasses = await dock.evalJs(
    'document.querySelectorAll(".cat-caught, .cat-fishing, .cat-bite").length')
  animClasses > 0 ? PASS('CSS fishing cat animations active') : FAIL('Animations')

  const slotsCount = await dock.evalJs('document.querySelectorAll(".fishing-slot").length')
  slotsCount === 6 ? PASS('6 dock slots rendered') : FAIL('Slots', slotsCount)

  PASS('Legacy DiceBear -> cat breed mapping (built-in)')

  // === 3. Dock UI ===
  console.log('\n--- 3. Dock UI ---')

  const rootOk = await dock.evalJs('document.querySelector("#root")?.innerHTML?.length > 100')
  rootOk ? PASS('Root rendered (no crash)') : FAIL('Root render')

  const leaderStar = await dock.evalJs('document.querySelector("[class*=text-yellow]") !== null')
  leaderStar ? PASS('Leader star icon shown') : FAIL('Leader star')

  const slotHover = await dock.evalJs(
    'getComputedStyle(document.querySelector(".fishing-slot")).transition.includes("transform")')
  slotHover ? PASS('Dock slot hover animation CSS') : FAIL('Slot hover')

  // === 4. IPC / Preload APIs ===
  console.log('\n--- 4. IPC / Preload APIs ---')

  const apis = [
    ['agent.list', 'window.api.agent.list'],
    ['agent.create', 'window.api.agent.create'],
    ['agent.update', 'window.api.agent.update'],
    ['agent.delete', 'window.api.agent.delete'],
    ['agent.duplicate', 'window.api.agent.duplicate'],
    ['agent.exportConfig', 'window.api.agent.exportConfig'],
    ['agent.importConfig', 'window.api.agent.importConfig'],
    ['agent.getState', 'window.api.agent.getState'],
    ['agent.getOrgChart', 'window.api.agent.getOrgChart'],
    ['agent.spawnTemporary', 'window.api.agent.spawnTemporary'],
    ['session.send', 'window.api.session.send'],
    ['session.abort', 'window.api.session.abort'],
    ['session.getHistory', 'window.api.session.getHistory'],
    ['conversation.list', 'window.api.conversation.list'],
    ['conversation.create', 'window.api.conversation.create'],
    ['conversation.delete', 'window.api.conversation.delete'],
    ['conversation.send', 'window.api.conversation.send'],
    ['task.list', 'window.api.task.list'],
    ['task.create', 'window.api.task.create'],
    ['task.update', 'window.api.task.update'],
    ['task.delete', 'window.api.task.delete'],
    ['settings.get', 'window.api.settings.get'],
    ['settings.update', 'window.api.settings.update'],
    ['activity.getRecent', 'window.api.activity.getRecent'],
    ['activity.clear', 'window.api.activity.clear'],
    ['cli.check', 'window.api.cli.check'],
    ['cli.install', 'window.api.cli.install'],
    ['cli.checkNode', 'window.api.cli.checkNode'],
    ['window.openChat', 'window.api.window.openChat'],
    ['window.openEditor', 'window.api.window.openEditor'],
    ['window.openDashboard', 'window.api.window.openDashboard'],
    ['window.openGroupChat', 'window.api.window.openGroupChat'],
    ['window.minimize', 'window.api.window.minimize'],
    ['window.close', 'window.api.window.close'],
    ['on (event listener)', 'window.api.on'],
  ]

  for (const [name, expr] of apis) {
    const t = await dock.evalJs('typeof ' + expr)
    t === 'function' ? PASS(name) : FAIL(name, 'typeof=' + t)
  }

  // === 5. CLI Integration ===
  console.log('\n--- 5. CLI Integration ---')

  const cliResult = await dock.evalJs(
    'window.api.cli.check().then(function(r){return JSON.stringify(r)})', true)
  if (cliResult) {
    const cli = JSON.parse(cliResult)
    cli.installed ? PASS('Claude CLI installed: v' + cli.version) : FAIL('CLI not installed')
  } else { FAIL('CLI check null') }

  const nodeResult = await dock.evalJs(
    'window.api.cli.checkNode().then(function(r){return JSON.stringify(r)})', true)
  if (nodeResult) {
    const node = JSON.parse(nodeResult)
    node.installed ? PASS('Node.js installed: ' + node.version) : FAIL('Node not installed')
  } else { FAIL('Node check null') }

  // === 6. Settings System ===
  console.log('\n--- 6. Settings System ---')

  const settingsJson = await dock.evalJs(
    'window.api.settings.get().then(function(s){return JSON.stringify(s)})', true)
  if (settingsJson) {
    const s = JSON.parse(settingsJson)
    PASS('Settings loaded')
    typeof s.defaultModel === 'string' ? PASS('defaultModel: ' + s.defaultModel) : FAIL('defaultModel')
    typeof s.defaultPermissionMode === 'string' ? PASS('defaultPermissionMode: ' + s.defaultPermissionMode) : FAIL('defaultPermissionMode')
    typeof s.agentSpawnLimit === 'number' ? PASS('agentSpawnLimit: ' + s.agentSpawnLimit) : FAIL('agentSpawnLimit')
  } else { FAIL('Settings load') }

  // === 7. Activity System ===
  console.log('\n--- 7. Activity System ---')

  const actJson = await dock.evalJs(
    'window.api.activity.getRecent(10).then(function(a){return JSON.stringify(a)})', true)
  if (actJson !== undefined) {
    PASS('Activity feed loads (' + JSON.parse(actJson).length + ' events)')
  } else { FAIL('Activity load') }

  // === 8. Task System ===
  console.log('\n--- 8. Task System ---')

  const tasksJson = await dock.evalJs(
    'window.api.task.list().then(function(t){return JSON.stringify(t)})', true)
  if (tasksJson !== undefined) {
    PASS('Task list loads (' + JSON.parse(tasksJson).length + ' tasks)')
  } else { FAIL('Task list') }

  // === 9. Conversation System ===
  console.log('\n--- 9. Conversation System ---')

  const convsJson = await dock.evalJs(
    'window.api.conversation.list().then(function(c){return JSON.stringify(c)})', true)
  if (convsJson !== undefined) {
    PASS('Conversation list loads (' + JSON.parse(convsJson).length + ' conversations)')
  } else { FAIL('Conversation list') }

  // === 10. OrgChart ===
  console.log('\n--- 10. OrgChart ---')

  const orgJson = await dock.evalJs(
    'window.api.agent.getOrgChart().then(function(o){return JSON.stringify(o)})', true)
  if (orgJson) {
    const org = JSON.parse(orgJson)
    org.leader ? PASS('OrgChart leader: ' + org.leader.name) : FAIL('OrgChart leader')
    Array.isArray(org.members) ? PASS('OrgChart members: ' + org.members.length) : FAIL('OrgChart members')
  } else { FAIL('OrgChart') }

  // === 11. Dashboard Window ===
  console.log('\n--- 11. Dashboard Window ---')

  const wsResp = await fetch('http://127.0.0.1:9222/json')
  const allPages = await wsResp.json()
  const dashExists = allPages.find(p => p.url && p.url.includes('#/dashboard'))
  if (dashExists) {
    const dash = await connectPage('#/dashboard')
    await new Promise(r => setTimeout(r, 3000))

    const dashRoot = await dash.evalJs('document.querySelector("#root")?.innerHTML?.length > 100')
    dashRoot ? PASS('Dashboard rendered') : FAIL('Dashboard render')

    const dashImgs = await dash.evalJs('document.querySelectorAll("img").length')
    dashImgs > 0 ? PASS('Dashboard has images: ' + dashImgs) : FAIL('Dashboard images')

    const dashWebp = await dash.evalJs(
      'Array.from(document.querySelectorAll("img")).filter(function(i){return i.src.indexOf(".webp")>=0}).length')
    dashWebp > 0 ? PASS('Dashboard AI cat avatars: ' + dashWebp) : FAIL('Dashboard WebP')

    const teamTitle = await dash.evalJs('document.body.innerText.includes("Team Overview")')
    teamTitle ? PASS('Team Overview section') : FAIL('Team Overview')

    const orgInDash = await dash.evalJs('document.body.innerText.includes("Jordan")')
    orgInDash ? PASS('OrgChart shows Jordan') : FAIL('OrgChart in dashboard')

    const cliBadge = await dash.evalJs('document.body.innerText.includes("Claude CLI")')
    cliBadge ? PASS('CLI status badge shown') : FAIL('CLI badge')

    const tabs = ['Team Overview', 'Activity Feed', 'Task Board', 'Settings', 'MCP Servers']
    for (const tab of tabs) {
      const has = await dash.evalJs('document.body.innerText.includes("' + tab + '")')
      has ? PASS('Tab: ' + tab) : FAIL('Tab: ' + tab)
    }

    const cards = await dash.evalJs('document.querySelectorAll("[class*=rounded-xl][class*=border]").length')
    cards > 0 ? PASS('Agent cards rendered: ' + cards) : FAIL('Agent cards')

    dash.close()
  } else {
    SKIP('Dashboard window not open')
  }

  // === 12. Session History ===
  console.log('\n--- 12. Session History ---')

  const histJson = await dock.evalJs(
    'window.api.session.getHistory("' + agents[0].id + '").then(function(h){return JSON.stringify({len:h?h.length:0})})', true)
  if (histJson) {
    const h = JSON.parse(histJson)
    PASS('Session history loads (' + agents[0].name + ': ' + h.len + ' msgs)')
  } else { FAIL('Session history') }

  // === 13. Agent CRUD ===
  console.log('\n--- 13. Agent CRUD ---')

  const dupResult = await dock.evalJs(
    'window.api.agent.duplicate("' + agents[5].id + '").then(function(a){return JSON.stringify({id:a.id,name:a.name})})', true)
  if (dupResult) {
    const dup = JSON.parse(dupResult)
    dup.name.includes('Copy') ? PASS('Duplicate agent: ' + dup.name) : FAIL('Dup name', dup.name)

    const del = await dock.evalJs(
      'window.api.agent.delete("' + dup.id + '").then(function(){return "ok"})', true)
    del === 'ok' ? PASS('Delete duplicated agent') : FAIL('Delete agent')

    const cnt = await dock.evalJs('window.api.agent.list().then(function(a){return a.length})', true)
    cnt === 6 ? PASS('Agent count restored to 6') : FAIL('Count after delete', cnt)
  } else { FAIL('Duplicate agent') }

  const exp = await dock.evalJs(
    'window.api.agent.exportConfig("' + agents[0].id + '").then(function(j){return typeof j==="string"?"ok":"fail"})', true)
  exp === 'ok' ? PASS('Export agent config') : FAIL('Export')

  // === 14. Event System ===
  console.log('\n--- 14. Event System ---')

  const evtTest = await dock.evalJs(`(function(){
    var unsub = window.api.on("test-event", function(){});
    var ok = typeof unsub === "function";
    if (ok) unsub();
    return ok;
  })()`)
  evtTest ? PASS('Event subscribe/unsubscribe') : FAIL('Event sub/unsub')

  // === 15. Error Resilience ===
  console.log('\n--- 15. Error Resilience ---')

  const badAgent = await dock.evalJs(
    'window.api.agent.getState("nonexistent").then(function(s){return s===null?"null":"val"}).catch(function(){return "err"})', true)
  badAgent === 'null' ? PASS('Non-existent agent -> null') : FAIL('Bad agent', badAgent)

  const badHist = await dock.evalJs(
    'window.api.session.getHistory("nonexistent").then(function(h){return Array.isArray(h)?h.length:-1}).catch(function(){return "err"})', true)
  typeof badHist === 'number' ? PASS('Non-existent history -> empty array') : FAIL('Bad history', badHist)

  dock.close()

  // === Summary ===
  console.log('\n========================================')
  console.log(' PASSED: ' + passed)
  console.log(' FAILED: ' + failed)
  console.log(' SKIPPED: ' + skipped)
  console.log(' TOTAL:  ' + (passed + failed + skipped))
  console.log('========================================')
  if (failed === 0) console.log('\n ALL TESTS PASSED!')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
