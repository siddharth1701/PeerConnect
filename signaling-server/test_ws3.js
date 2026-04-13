const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Signaling\n');

const ws = new WebSocket('wss://localhost:8080/signal', {
  rejectUnauthorized: false
});

let roomId = 'TEST-' + Math.random().toString(36).substr(2, 4).toUpperCase();
let messages = [];

ws.on('open', () => {
  console.log('✅ WebSocket Connection: Connected');
  
  ws.send(JSON.stringify({
    type: 'join',
    roomId: roomId,
    username: 'Test User 1'
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    messages.push(msg.type);
    console.log(`✅ Message: ${msg.type}`);
    
    if (msg.type === 'peer-joined' || messages.length >= 3) {
      console.log('\n✅ WebSocket Signaling: Working');
      ws.close();
      process.exit(0);
    }
  } catch (e) {
    console.log(`⚠️  ${data.substring(0, 80)}`);
  }
});

ws.on('error', (err) => {
  console.log(`❌ Error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log('❌ Timeout');
  if (messages.length > 0) {
    console.log(`Messages received: ${messages.join(', ')}`);
  }
  ws.close();
  process.exit(1);
}, 5000);
