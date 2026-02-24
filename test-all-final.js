const WebSocket = require('ws');
const http = require('http');
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
let msgId = 1, ws;
const pending = new Map();
function send(method, params) {
  params = params || {};
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const tm = setTimeout(() => { pending.delete(id); reject(new Error('Timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, tm });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.result && res.result.exceptionDetails) {
    var d = (res.result.exceptionDetails.exception && res.result.exceptionDetails.exception.description) || res.result.exceptionDetails.text || JSON.stringify(res.result.exceptionDetails);
    throw new Error('JS: ' + d);
  }
  return res.result && res.result.result && res.result.result.value;
}
async function ipc(ch) {
  var a = [].slice.call(arguments, 1);
  var s = a.map(x => JSON.stringify(x)).join(', ');
  return evaluate('window.electron.ipcRenderer.invoke(' + JSON.stringify(ch) + (a.length ? ', ' + s : '') + ')');
}
var results = [], pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); results.push({n:name,s:'PASS'}); pass++; console.log('  PASS  ' + name); }
  catch(e) { results.push({n:name,s:'FAIL',e:e.message}); fail++; console.log('  FAIL  ' + name + ' -- ' + e.message); }
}
(async function() {
  console.log('\n=== Virtual Company Comprehensive Test Suite ===\n');
  var list = await getJSON('http://127.0.0.1:9222/json');
  var targets = list.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!targets.length) { console.error('No targets'); process.exit(1); }
  var tgt = targets[0];
  console.log('Target: ' + (tgt.title || tgt.url) + '\n');
  ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', raw => {
    var msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) { var p = pending.get(msg.id); clearTimeout(p.tm); pending.delete(msg.id); p.resolve(msg); }
  });
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 2000));

  console.log('-- Agent CRUD--');
  var agents = [], cid = null;
  await test('agent:list - defaults', async () => { agents = await ipc('agent:list'); if (!Array.isArray(agents) || agents.length < 1) throw new Error('bad'); });
  await test('agent:create', async () => {
    var a = await ipc('agent:create', { name:'TestBot', role:'QA', avatar:{style:'botts',seed:'tb'}, systemPrompt:'test', workingDirectory:'C:\\Users\\jsh\\virtual-company', model:'claude-sonnet-4-20250514' });
    if (!a||!a.id) throw new Error('no agent'); cid = a.id;
  });
  await test('agent:list - count+1', async () => { var l = await ipc('agent:list'); if (l.length !== agents.length+1) throw new Error('count'); });
  await test('agent:update', async () => { var u = await ipc('agent:update', cid, {name:'TB2'}); if (!u||u.name!=='TB2') throw new Error('upd'); });
  await test('agent:duplicate', async () => { var d = await ipc('agent:duplicate', cid); if (!d||d.id===cid) throw new Error('dup'); await ipc('agent:delete', d.id); });
  await test('agent:delete', async () => { await ipc('agent:delete', cid); var l = await ipc('agent:list'); if (l.find(a=>a.id===cid)) throw new Error('exists'); });

  console.log('\n-- Hierarchy --');
  await test('agent:get-org-chart', async () => { var o = await ipc('agent:get-org-chart'); if (!o||!('leader' in o)||!('members' in o)) throw new Error('bad'); });

  console.log('\n-- Agent States --');
  await test('agent:get-all-states', async () => { var s = await ipc('agent:get-all-states'); if (!Array.isArray(s)||s.length<1) throw new Error('bad'); });
  await test('agent:get-state', async () => { var al = await ipc('agent:list'); var s = await ipc('agent:get-state', al[0].id); if (!s||!s.config||!('status' in s)) throw new Error('bad'); });
  await test('agent:get-process-info', async () => { var al = await ipc('agent:list'); await ipc('agent:get-process-info', al[0].id); });

  console.log('\n-- Session APIs --');
  var sid;
  await test('session:get-history', async () => { var al = await ipc('agent:list'); sid = al[0].id; var h = await ipc('session:get-history', sid); if (!Array.isArray(h)) throw new Error('bad'); });
  await test('session:get-error-log', async () => { var l = await ipc('session:get-error-log', sid); if (!Array.isArray(l)) throw new Error('bad'); });
  await test('session:abort', async () => { await ipc('session:abort', sid); });
  await test('session:clear', async () => { await ipc('session:clear', sid); });
  await test('session:send', async () => { await ipc('session:send', sid, 'Say TEST_OK'); await new Promise(r=>setTimeout(r,1000)); await ipc('session:abort', sid); });

  console.log('\n-- Conversation APIs --');
  var cvid = null;
  await test('conversation:create', async () => {
    var al = await ipc('agent:list'); var pids = al.slice(0,2).map(a=>a.id);
    var c = await ipc('conversation:create', {name:'TestGC', participantIds:pids, mode:'manual', maxRoundsPerChain:3});
    if (!c||!c.id) throw new Error('no conv'); cvid = c.id;
  });
  await test('conversation:list', async () => { var l = await ipc('conversation:list'); if (!l.find(c=>c.id===cvid)) throw new Error('missing'); });
  await test('conversation:get', async () => { var c = await ipc('conversation:get', cvid); if (!c||c.name!=='TestGC') throw new Error('bad'); });
  await test('conversation:update', async () => { var u = await ipc('conversation:update', cvid, {name:'GC2'}); if (!u||u.name!=='GC2') throw new Error('bad'); });
  await test('conversation:get-history', async () => { var h = await ipc('conversation:get-history', cvid); if (!Array.isArray(h)) throw new Error('bad'); });
  await test('conversation:get-state', async () => { var s = await ipc('conversation:get-state', cvid); if (!s||!('status' in s)) throw new Error('bad'); });
  await test('conversation:set-mode', async () => { await ipc('conversation:set-mode', cvid, 'auto-chain'); var c = await ipc('conversation:get', cvid); if (c.mode!=='auto-chain') throw new Error(c.mode); });
  await test('conversation:send', async () => { await ipc('conversation:send', cvid, 'hello'); await new Promise(r=>setTimeout(r,500)); await ipc('conversation:abort', cvid); });
  await test('conversation:clear', async () => { await ipc('conversation:clear', cvid); });
  await test('conversation:delete', async () => { await ipc('conversation:delete', cvid); var l = await ipc('conversation:list'); if (l.find(c=>c.id===cvid)) throw new Error('exists'); });

  console.log('\n-- Settings --');
  await test('settings:get', async () => { var s = await ipc('settings:get'); if (!s||!('defaultModel' in s)||!('defaultPermissionMode' in s)) throw new Error('bad'); });
  await test('settings:update', async () => { var u = await ipc('settings:update', {defaultMaxTurns:50}); if (!u||u.defaultMaxTurns!==50) throw new Error('bad'); await ipc('settings:update', {defaultMaxTurns:25}); });
  await test('settings - setupCompleted accessible', async () => { var s = await ipc('settings:get'); if (!s) throw new Error('bad'); });

  console.log('\n-- Activity --');
  await test('activity:get-recent', async () => { var a = await ipc('activity:get-recent', 10); if (!Array.isArray(a)) throw new Error('bad'); });
  await test('activity:clear', async () => { await ipc('activity:clear'); var a = await ipc('activity:get-recent', 10); if (a.length!==0) throw new Error('got '+a.length); });

  console.log('\n-- Tasks --');
  var tid = null, ta;
  await test('task:create', async () => { ta = await ipc('agent:list'); var t = await ipc('task:create', {title:'TT', description:'desc', fromAgentId:ta[0].id, toAgentId:ta[1].id, status:'pending'}); if (!t||!t.id) throw new Error('bad'); tid = t.id; });
  await test('task:list', async () => { var l = await ipc('task:list'); if (!l.find(t=>t.id===tid)) throw new Error('missing'); });
  await test('task:get-for-agent', async () => { var l = await ipc('task:get-for-agent', ta[1].id); if (!l.find(t=>t.id===tid)) throw new Error('missing'); });
  await test('task:update', async () => { var u = await ipc('task:update', tid, {status:'completed'}); if (!u||u.status!=='completed') throw new Error('bad'); });

  console.log('\n-- CLI --');
  await test('cli:check', async () => { var r = await ipc('cli:check'); if (!r||!('installed' in r)) throw new Error('bad'); });
  await test('cli:install - exists', async () => { try { await ipc('cli:install'); } catch(e) { if (e.message.indexOf('No handler')>=0) throw e; } });
  await test('cli:check-node', async () => { var r = await ipc('cli:check-node'); if (!r||!('installed' in r)) throw new Error('bad'); });

  console.log('\n-- MCP APIs --');
  await test('mcp:get-global', async () => { var s = await ipc('mcp:get-global'); if (s!==undefined&&s!==null&&!Array.isArray(s)) throw new Error('bad'); });
  await test('mcp:set-global', async () => {
    await ipc('mcp:set-global', [{name:'tmcp',command:'echo',args:['hi'],enabled:false}]);
    var s = await ipc('mcp:get-global'); if (!Array.isArray(s)||s.length!==1||s[0].name!=='tmcp') throw new Error('bad');
    await ipc('mcp:set-global', []);
  });
  await test('mcp:get-agent', async () => { var al = await ipc('agent:list'); var s = await ipc('mcp:get-agent', al[0].id); if (!Array.isArray(s)) throw new Error('bad'); });
  await test('mcp:set-agent', async () => {
    var al = await ipc('agent:list');
    await ipc('mcp:set-agent', al[0].id, [{name:'amcp',command:'t',args:[],enabled:true}]);
    var s = await ipc('mcp:get-agent', al[0].id); if (!Array.isArray(s)||s.length!==1||s[0].name!=='amcp') throw new Error('bad');
    await ipc('mcp:set-agent', al[0].id, []);
  });

  console.log('\n-- Window APIs --');
  await test('window:open-chat', async () => { var al = await ipc('agent:list'); await ipc('window:open-chat', al[0].id); await new Promise(r=>setTimeout(r,1000)); });
  await test('window:open-dashboard', async () => { await ipc('window:open-dashboard'); await new Promise(r=>setTimeout(r,500)); });
  await test('window:open-group-chat', async () => {
    var al = await ipc('agent:list');
    var c = await ipc('conversation:create', {name:'WT', participantIds:al.slice(0,2).map(a=>a.id), mode:'manual', maxRoundsPerChain:3});
    await ipc('window:open-group-chat', c.id); await new Promise(r=>setTimeout(r,500));
    await ipc('conversation:delete', c.id);
  });

  console.log('\n-- Temporary Agent --');
  var tmpId = null;
  await test('agent:spawn-temporary', async () => {
    var al = await ipc('agent:list');
    var t = await ipc('agent:spawn-temporary', {requestedBy:al[0].id, name:'TmpB', role:'Tmp', model:'claude-sonnet-4-20250514', systemPrompt:'tmp', ttlMinutes:60});
    if (!t||!t.id) throw new Error('bad'); tmpId = t.id;
  });
  await test('agent:remove-temporary', async () => {
    await ipc('agent:remove-temporary', tmpId);
    var al = await ipc('agent:list'); if (al.find(a=>a.id===tmpId)) throw new Error('exists');
  });

  console.log('\n-- Export/Import --');
  await test('agent:export', async () => { var al = await ipc('agent:list'); var j = await ipc('agent:export', al[0].id); if (typeof j!=='string') throw new Error('bad'); JSON.parse(j); });
  await test('agent:import', async () => {
    var al = await ipc('agent:list'); var j = await ipc('agent:export', al[0].id);
    var imp = await ipc('agent:import', j); if (!imp||imp.id===al[0].id) throw new Error('bad');
    await ipc('agent:delete', imp.id);
  });

  console.log('\n-- setupCompleted --');
  await test('settings - setupCompleted set/read', async () => {
    await ipc('settings:update', {setupCompleted:true});
    var s = await ipc('settings:get'); if (s.setupCompleted!==true) throw new Error('bad');
  });

  console.log('\n====================================');
  console.log('  RESULTS: ' + pass + ' PASS / ' + fail + ' FAIL / ' + (pass+fail) + ' TOTAL');
  console.log('====================================\n');
  if (fail > 0) { console.log('Failed:'); results.filter(r=>r.s==='FAIL').forEach(r=>console.log('  - '+r.n+': '+r.e)); console.log(''); }
  ws.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e); process.exit(2); });
