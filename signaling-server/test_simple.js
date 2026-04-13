const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Features\n');

// Test 1: Room Creation
console.log('Test 1: Room Creation');
const ws1 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
let roomId = null;

ws1.on('open', () => {
  ws1.send(JSON.stringify({ type: 'join', roomId: 'room-' + Date.now(), username: 'User1' }));
});

ws1.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === 'room-created') {
      console.log(`✅ Room Created: ${msg.roomId}`);
      roomId = msg.roomId;
      
      // Now test joining with 2nd peer
      setTimeout(() => {
        console.log('\nTest 2: Join Room (2nd Peer)');
        const ws2 = new WebSocket('wss://localhost:8080/signal', { rejectUnauthorized: false });
        
        ws2.on('open', () => {
          ws2.send(JSON.stringify({ type: 'join', roomId: roomId, username: 'User2' }));
        });
        
        ws2.on('message', (data) => {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'peer-joined') {
              console.log(`✅ Peer Joined: ${msg.username || 'User2'}`);
              console.log(`\n✅ All WebSocket tests PASSED!\n`);
              ws1.close();
              ws2.close();
              process.exit(0);
            }
          } catch (e) {}
        });
        
        ws2.on('error', (e) => {
          console.log(`❌ Error: ${e.message}`);
          ws1.close();
          process.exit(1);
        });
      }, 500);
    }
  } catch (e) {}
});

ws1.on('error', (e) => {
  console.log(`❌ Error: ${e.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log('❌ Timeout');
  ws1.close();
  process.exit(1);
}, 10000);
