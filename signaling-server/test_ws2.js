const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Signaling\n');

const ws = new WebSocket('wss://localhost:8080/signal', {
  rejectUnauthorized: false
});

ws.on('open', () => {
  console.log('✅ WebSocket Connection: Connected');
  
  ws.send(JSON.stringify({
    type: 'create-room',
    username: 'Test User 1'
  }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    console.log(`✅ Message received: ${msg.type}`);
    console.log('   ', JSON.stringify(msg, null, 2).split('\n').slice(0, 5).join('\n'));
    if (msg.type === 'room-created') {
      console.log(`✅ Room Code: ${msg.roomId}`);
      ws.close();
      process.exit(0);
    }
  } catch (e) {
    console.log(`⚠️  Raw message: ${data.substring(0, 100)}`);
  }
});

ws.on('error', (err) => {
  console.log(`❌ Error: ${err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log('❌ Timeout - no response after 5 seconds');
  ws.close();
  process.exit(1);
}, 5000);
