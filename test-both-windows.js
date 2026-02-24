const WebSocket = require('ws');

async function run() {
  const resp = await fetch('http://localhost:9222/json');
  const targets = await resp.json();
  
  console.log('=== 현재 열린 윈도우 ===');
  targets.forEach(t => console.log(`  ${t.type} | ${t.title} | ${t.url}`));
  console.log('');
  
  const dock = targets.find(t => t.url.includes('#/dock'));
  if (!dock) { console.log('FAIL: Dock window not found'); return; }
  console.log('OK: Dock window found');
  
  // Dock 윈도우 테스트
  const ws = new WebSocket(dock.webSocketDebuggerUrl);
  let id = 1;
  const pending = {};
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id]; }
  });
  
  function send(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      pending[msgId] = resolve;
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  
  await new Promise(resolve => ws.on('open', resolve));
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 1. 에이전트 목록 확인
  const r1 = await send('Runtime.evaluate', { 
    expression: `window.api.agent.list().then(a => JSON.stringify(a.map(x => ({name: x.name, role: x.role}))))`,
    awaitPromise: true 
  });
  const agents = JSON.parse(r1.result?.value || '[]');
  console.log(`\n1. 에이전트 ${agents.length}명:`);
  agents.forEach(a => console.log(`   - ${a.name} (${a.role})`));
  
  // 2. 에이전트 상태 확인
  const r2 = await send('Runtime.evaluate', { 
    expression: `window.api.agent.getAllStates().then(s => JSON.stringify(s.map(x => ({name: x.config.name, status: x.status, cost: x.costTotal}))))`,
    awaitPromise: true 
  });
  const states = JSON.parse(r2.result?.value || '[]');
  console.log(`\n2. 에이전트 상태:`);
  states.forEach(s => console.log(`   - ${s.name}: ${s.status} ($${s.cost})`));
  
  // 3. 조직도 확인
  const r3 = await send('Runtime.evaluate', { 
    expression: `window.api.agent.getOrgChart().then(o => JSON.stringify({
      leader: o.leader?.name || null,
      members: o.members.map(m => m.name),
      temporary: o.temporary.map(t => t.name)
    }))`,
    awaitPromise: true 
  });
  console.log('\n3. 조직도:', r3.result?.value);
  
  // 4. CLI 상태 확인
  const r4 = await send('Runtime.evaluate', { 
    expression: `window.api.cli.check().then(r => JSON.stringify(r))`,
    awaitPromise: true 
  });
  console.log('\n4. CLI 상태:', r4.result?.value);
  
  // 5. 설정 확인
  const r5 = await send('Runtime.evaluate', { 
    expression: `window.api.settings.get().then(s => JSON.stringify(s))`,
    awaitPromise: true 
  });
  console.log('\n5. 설정:', r5.result?.value);
  
  // 6. 독 UI 렌더링 확인
  const r6 = await send('Runtime.evaluate', { 
    expression: `document.querySelectorAll('[class*="avatar"]').length || document.querySelectorAll('img').length || document.querySelectorAll('[class*="slot"]').length`
  });
  console.log('\n6. Dock rendered elements:', r6.result?.value);
  
  // 7. 대시보드 열기
  await send('Runtime.evaluate', { 
    expression: `window.api.window.openDashboard()`,
    awaitPromise: true 
  });
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 8. 대시보드 윈도우 확인
  const resp2 = await fetch('http://localhost:9222/json');
  const targets2 = await resp2.json();
  const dashboard = targets2.find(t => t.url.includes('#/dashboard'));
  console.log('\n7. Dashboard opened:', !!dashboard);
  
  if (dashboard) {
    const ws2 = new WebSocket(dashboard.webSocketDebuggerUrl);
    const pending2 = {};
    let id2 = 1;
    ws2.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending2[msg.id]) { pending2[msg.id](msg.result); delete pending2[msg.id]; }
    });
    function send2(method, params = {}) {
      return new Promise(resolve => {
        const msgId = id2++;
        pending2[msgId] = resolve;
        ws2.send(JSON.stringify({ id: msgId, method, params }));
      });
    }
    await new Promise(resolve => ws2.on('open', resolve));
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const r8 = await send2('Runtime.evaluate', { 
      expression: `document.querySelector('h2')?.textContent`
    });
    console.log('8. Dashboard heading:', r8.result?.value);
    
    // CLI 뱃지 확인
    const r9 = await send2('Runtime.evaluate', { 
      expression: `
        const badge = document.querySelector('.text-green-400') || document.querySelector('.text-red-400');
        badge ? badge.textContent : 'No badge'
      `
    });
    console.log('9. CLI badge:', r9.result?.value);
    
    ws2.close();
  }
  
  console.log('\n=== 전체 윈도우 테스트 완료 ===');
  ws.close();
}

run().catch(e => console.error('Error:', e));
