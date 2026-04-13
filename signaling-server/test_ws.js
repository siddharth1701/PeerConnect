const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Signaling\n');

function testWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://localhost:8080/signal', {
      rejectUnauthorized: false
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Connection timeout'));
    }, 5000);

    ws.on('open', () => {
      console.log('✅ WebSocket Connection: Connected');
      
      ws.send(JSON.stringify({
        type: 'create-room',
        username: 'Test User 1'
      }));
      
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'room-created') {
            console.log(`✅ Room Creation: Room created`);
            console.log(`   - Room Code: ${msg.roomId}`);
            console.log(`   - Reconnect Token: ${msg.reconnectToken ? 'provided' : 'not provided'}`);
            clearTimeout(timeout);
            ws.close();
            resolve(msg.roomId);
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

testWebSocket().then(
  roomId => {
    console.log('\n✅ WebSocket test PASSED');
    process.exit(0);
  }
).catch(
  error => {
    console.log(`\n❌ WebSocket test FAILED: ${error.message}`);
    process.exit(1);
  }
);
