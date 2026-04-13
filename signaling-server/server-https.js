/**
 * PeerConnect Signaling Server with HTTPS/WSS Support
 * Wraps the existing signaling server with TLS
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocketServer = require('ws').Server;

const PORT = process.env.PORT || 8080;
const CERT_FILE = process.env.CERT || '../cert.pem';
const KEY_FILE = process.env.KEY || '../key.pem';

// Load certificates
let options = {};
try {
  options.cert = fs.readFileSync(CERT_FILE);
  options.key = fs.readFileSync(KEY_FILE);
  console.log('[HTTPS] Certificates loaded from', CERT_FILE, KEY_FILE);
} catch (err) {
  console.error('[HTTPS] Certificate error:', err.message);
  console.log('[HTTPS] Falling back to HTTP (ws://) mode');
  // Continue with HTTP if certs not found
}

// Create HTTPS server or HTTP fallback
let server;
if (options.cert && options.key) {
  server = https.createServer(options, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server running on wss://');
  });
} else {
  const http = require('http');
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server running on ws://');
  });
}

// WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const rooms = new Map();
const peers = new Map();

wss.on('connection', (ws) => {
  console.log('[Signaling] New connection');

  let peerId = null;
  let roomId = null;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (err) {
      console.error('[Signaling] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    if (roomId && peerId) {
      console.log('[Signaling] Peer disconnected:', peerId, 'from room:', roomId);
      const room = rooms.get(roomId);
      if (room) {
        room.delete(peerId);
        if (room.size === 0) {
          rooms.delete(roomId);
        } else {
          // Notify other peer
          room.forEach(peer => {
            if (peer.ws && peer.ws.readyState === 1) {
              peer.ws.send(JSON.stringify({ type: 'peer-left' }));
            }
          });
        }
      }
    }
    peers.delete(ws);
  });

  function handleMessage(ws, message) {
    switch (message.type) {
      case 'join':
        roomId = message.roomId;
        peerId = message.peerId;
        const username = message.username || 'User';

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Map());
          ws.send(JSON.stringify({ type: 'room-created', roomId }));
          console.log('[Signaling] Room created:', roomId);
        }

        const room = rooms.get(roomId);
        const peerInfo = { peerId, username, ws };
        room.set(peerId, peerInfo);
        peers.set(ws, { roomId, peerId, username });

        // Notify other peers
        if (room.size > 1) {
          console.log(`[Room] ${peerId.slice(0, 8)} (${username}) joined - room now has ${room.size} peers`);
          room.forEach((peer) => {
            if (peer.ws !== ws && peer.ws.readyState === 1) {
              console.log(`[Room] Sending peer-joined to ${peer.peerId.slice(0, 8)} with ${username}`);
              peer.ws.send(JSON.stringify({ type: 'peer-joined', peerId, username }));
            }
          });
          console.log(`[Room] Sending room-joined to ${peerId.slice(0, 8)}`);
          ws.send(JSON.stringify({ type: 'room-joined', roomId }));
        } else {
          console.log(`[Room] ${peerId.slice(0, 8)} (${username}) joined room ${roomId} - waiting for another peer`);
        }
        break;

      case 'offer':
      case 'answer':
        relayToRoom(roomId, peerId, message);
        break;

      case 'ice-candidate':
        relayToRoom(roomId, peerId, {
          type: 'ice-candidate',
          candidate: message.candidate,
          sdpMLineIndex: message.sdpMLineIndex,
          sdpMid: message.sdpMid
        });
        break;

      case 'leave':
        if (roomId) {
          const room = rooms.get(roomId);
          if (room) {
            room.delete(peerId);
            if (room.size === 0) {
              rooms.delete(roomId);
            } else {
              room.forEach(peer => {
                if (peer.ws && peer.ws.readyState === 1) {
                  peer.ws.send(JSON.stringify({ type: 'peer-left' }));
                }
              });
            }
          }
        }
        break;
    }
  }

  function relayToRoom(roomId, fromPeerId, message) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.forEach((peer) => {
      if (peer.peerId !== fromPeerId && peer.ws.readyState === 1) {
        peer.ws.send(JSON.stringify(message));
      }
    });
  }
});

server.listen(PORT, () => {
  const protocol = options.cert ? 'wss' : 'ws';
  console.log('[Signaling] Server listening on port', PORT);
  console.log('[Signaling] URL:', protocol + '://localhost:' + PORT + '/signal');
  console.log('[Signaling] Health check: http://localhost:' + PORT + '/health');
});

// Health check endpoint
server.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      rooms: rooms.size,
      protocol: options.cert ? 'wss' : 'ws'
    }));
  }
});

process.on('SIGINT', () => {
  console.log('[Signaling] Shutting down...');
  server.close();
  process.exit(0);
});
