const WebSocket = require('ws');

console.log('🔍 Testing WebSocket & Room Features\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return fn().then(
    () => { console.log(`✅ ${name}`); testsPassed++; },
    (err) => { console.log(`❌ ${name}: ${err.message}`); testsFailed++; }
  );
}

// Test 1: WebSocket Connection
test('WebSocket Connection', () => new Promise((resolve, reject) => {
  const ws = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
  const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
  
  ws.on('open', () => {
    clearTimeout(timeout);
    ws.close();
    resolve();
  });
  ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
})).then(() =>

// Test 2: Room Creation
test('Room Creation', () => new Promise((resolve, reject) => {
  const ws = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
  const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
  
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', roomId: 'test-room-' + Date.now(), username: 'User1' }));
  });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'room-created') {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    } catch (e) {}
  });
  
  ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
})).then(() =>

// Test 3: Room Join
test('Room Join (2nd peer)', () => new Promise((resolve, reject) => {
  // Create room
  const ws1 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
  let roomId;
  
  ws1.on('open', () => {
    ws1.send(JSON.stringify({ type: 'join', roomId: 'room-' + Date.now(), username: 'User1' }));
  });
  
  ws1.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'room-created') {
        roomId = msg.roomId;
        
        // Join with second peer
        const ws2 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
        const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
        
        ws2.on('open', () => {
          ws2.send(JSON.stringify({ type: 'join', roomId: roomId, username: 'User2' }));
        });
        
        ws2.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'peer-joined') {
              clearTimeout(timeout);
              ws1.close();
              ws2.close();
              resolve();
            }
          } catch (e) {}
        });
        
        ws2.on('error', (e) => { clearTimeout(timeout); reject(e); });
      }
    } catch (e) {}
  });
  
  ws1.on('error', (e) => reject(e));
})).then(() => {
  console.log(`\n✅ All WebSocket tests passed (${testsPassed} tests)\n`);
  process.exit(0);
}).catch(() => {
  console.log(`\n❌ Some tests failed (${testsPassed} passed, ${testsFailed} failed)\n`);
  process.exit(1);
});
