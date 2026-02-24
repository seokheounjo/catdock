const WebSocket = require('ws');

async function run() {
  const resp = await fetch('http://localhost:9222/json');
  const targets = await resp.json();
  const setup = targets.find(t => t.url.includes('#/setup'));
  if (!setup) { console.log('FAIL: Setup window not found'); return; }
  
  console.log('OK: Setup window found:', setup.url);
  
  const ws = new WebSocket(setup.webSocketDebuggerUrl);
  let id = 1;
  const pending = {};
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg.result);
      delete pending[msg.id];
    }
  });
  
  function send(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      pending[msgId] = resolve;
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  
  await new Promise(resolve => ws.on('open', resolve));
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 1. 셋업 위자드 표시 확인
  const result1 = await send('Runtime.evaluate', { expression: `document.querySelector('h1')?.textContent` });
  console.log('1. Title:', result1.result?.value);
  
  // 2. "시작하기" 버튼 존재 확인
  const result2 = await send('Runtime.evaluate', { expression: `
    Array.from(document.querySelectorAll('button')).map(b => b.textContent).join(', ')
  `});
  console.log('2. Buttons:', result2.result?.value);
  
  // 3. "시작하기" 클릭
  await send('Runtime.evaluate', { expression: `
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === '시작하기')?.click()
  `});
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 4. CLI 체크 스텝 확인
  const result4 = await send('Runtime.evaluate', { expression: `document.querySelector('h2')?.textContent` });
  console.log('3. Step 2 Title:', result4.result?.value);
  
  // 5. CLI 상태 확인
  const result5 = await send('Runtime.evaluate', { expression: `
    const green = document.querySelector('.text-green-400');
    const yellow = document.querySelector('.text-yellow-400');
    green ? 'CLI installed: ' + green.textContent : (yellow ? 'CLI missing: ' + yellow.textContent : 'Loading...')
  `});
  console.log('4. CLI status:', result5.result?.value);
  
  // 6. "다음" 클릭
  await send('Runtime.evaluate', { expression: `
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === '다음')?.click()
  `});
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 7. 작업 디렉토리 스텝 확인
  const result7 = await send('Runtime.evaluate', { expression: `document.querySelector('h2')?.textContent` });
  console.log('5. Step 3 Title:', result7.result?.value);
  
  // 8. "다음" 클릭
  await send('Runtime.evaluate', { expression: `
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === '다음')?.click()
  `});
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 9. 완료 스텝 확인
  const result9 = await send('Runtime.evaluate', { expression: `document.querySelector('h2')?.textContent` });
  console.log('6. Final Step Title:', result9.result?.value);
  
  // 10. "시작하기" 클릭 (완료)
  await send('Runtime.evaluate', { expression: `
    Array.from(document.querySelectorAll('button')).find(b => b.textContent === '시작하기')?.click()
  `});
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 11. setupCompleted 설정 확인 (다른 윈도우에서 확인 - setup 윈도우가 닫혔을 수 있으므로)
  const resp2 = await fetch('http://localhost:9222/json');
  const targets2 = await resp2.json();
  const dock = targets2.find(t => t.url.includes('#/dock'));
  if (dock) {
    const ws2 = new WebSocket(dock.webSocketDebuggerUrl);
    const pending2 = {};
    let id2 = 1;
    ws2.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.id && pending2[msg.id]) { pending2[msg.id](msg.result); delete pending2[msg.id]; }
    });
    await new Promise(resolve => ws2.on('open', resolve));
    
    function send2(method, params = {}) {
      return new Promise(resolve => {
        const msgId = id2++;
        pending2[msgId] = resolve;
        ws2.send(JSON.stringify({ id: msgId, method, params }));
      });
    }
    
    const result11 = await send2('Runtime.evaluate', { expression: `
      window.api.settings.get().then(s => JSON.stringify({ setupCompleted: s.setupCompleted }))
    `, awaitPromise: true });
    console.log('7. Settings after completion:', result11.result?.value);
    ws2.close();
  }
  
  console.log('\n=== Setup Wizard Test Complete ===');
  ws.close();
}

run().catch(e => console.error('Error:', e));
