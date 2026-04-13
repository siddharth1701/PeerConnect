const WebSocket = require('ws');

let messages1 = [];
let messages2 = [];

// Test 1: Room Creation
const ws1 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });

ws1.on('open', () => {
  console.log('[1] WebSocket connected');
  ws1.send(JSON.stringify({ type: 'join', roomId: 'debug-room-' + Date.now(), username: 'User1' }));
});

ws1.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    messages1.push(msg.type);
    console.log(`[1] << ${msg.type}`);
    
    if (msg.type === 'room-created') {
      roomId = msg.roomId;
      setTimeout(() => {
        console.log('\n[2] Connecting second peer...');
        const ws2 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
        
        ws2.on('open', () => {
          console.log('[2] WebSocket connected');
          ws2.send(JSON.stringify({ type: 'join', roomId: roomId, username: 'User2' }));
        });
        
        ws2.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            messages2.push(msg.type);
            console.log(`[2] << ${msg.type}`);
          } catch (e) {}
        });
      }, 300);
    }
  } catch (e) {
    console.log(`[1] Error: ${e.message}`);
  }
});

setTimeout(() => {
  console.log('\nMessages from peer 1:', messages1.join(', '));
  console.log('Messages from peer 2:', messages2.join(', '));
  ws1.close();
  process.exit(0);
}, 5000);
