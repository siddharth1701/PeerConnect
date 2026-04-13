const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// Try to load SSL certificates if available (for WSS support)
let server;
let useHTTPS = false;

try {
  const certPath = path.join(__dirname, '..', 'webapp', 'public', 'cert.pem');
  const keyPath = path.join(__dirname, '..', 'webapp', 'public', 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    server = https.createServer({ cert, key });
    useHTTPS = true;
    console.log('[Server] Using HTTPS/WSS (certificates found)');
  } else {
    server = http.createServer();
    console.log('[Server] Using HTTP/WS (no certificates found)');
  }
} catch (err) {
  console.warn('[Server] Could not load certificates, falling back to HTTP/WS:', err.message);
  server = http.createServer();
}

const wss = new WebSocket.Server({
  server,
  path: '/signal'  // WebSocket path must match client expectations
});

// Map of rooms: roomId -> { createdAt, peers: [ws1, ws2] }
const rooms = new Map();

// Track IP-based room creation rate for basic rate limiting
const ipCreateCounts = new Map();
const RATE_LIMIT = 10; // rooms per minute per IP
const RATE_WINDOW = 60000; // 1 minute

/// Room expiration: 30 minutes (allows users to rejoin after extended disconnects)
const ROOM_EXPIRY = 30 * 60 * 1000;

// Grace period for disconnect: 5 minutes
const GRACE_PERIOD = 5 * 60 * 1000;

// Reconnect token TTL: 30 minutes
const RECONNECT_TOKEN_TTL = 30 * 60 * 1000;

// Cleanup expired rooms every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_EXPIRY) {
      // Notify remaining peers
      room.peers.forEach(ws => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'room-expired' }));
          ws.close();
        }
      });
      // Clear grace period timers
      if (room.gracePeriodTimers) {
        room.gracePeriodTimers.forEach(timer => clearTimeout(timer));
        room.gracePeriodTimers.clear();
      }
      rooms.delete(roomId);
      console.log(`[Cleanup] Deleted expired room: ${roomId}`);
    }
  }

  // Clean up rate limit counters
  for (const [ip, { count, timestamp }] of ipCreateCounts.entries()) {
    if (now - timestamp > RATE_WINDOW) {
      ipCreateCounts.delete(ip);
    }
  }
}, 60000);

// Heartbeat to detect dead connections
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ============================================================================
// WEBSOCKET CONNECTION HANDLER
// ============================================================================
wss.on('connection', (ws, req) => {
  // Generate unique peer ID for this connection
  console.log('[WSS] 🔌 New WebSocket connection incoming');
  console.log('[WSS] Connection details:', {
    url: req.url,
    protocol: req.headers['sec-websocket-protocol'],
    userAgent: req.headers['user-agent']?.substring(0, 50),
    remoteAddress: req.socket.remoteAddress,
    tlsVersion: req.socket.remoteAddress ? 'checking...' : 'N/A'
  });
  ws.isAlive = true;
  ws.peerId = generatePeerId();
  ws.currentRoomId = null;

  // Get client IP for logging and rate limiting
  const clientIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  console.log(`[WSS] ✅ Client connected: ${ws.peerId} from ${clientIp}`);

  console.log(`[Connect] Peer ${ws.peerId.slice(0, 8)} from ${req.socket.remoteAddress}`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`[WSS] 📨 Message from ${ws.peerId}: type=${message.type}`);
      handleMessage(ws, message, req.socket.remoteAddress);
    } catch (err) {
      console.error(`[WSS] ❌ Failed to parse message: ${err.message}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log(`[WSS] 🔌 Client disconnected: ${ws.peerId}`);
    handleDisconnect(ws);
  });

  // Handle WebSocket errors
  ws.on('error', (err) => {
    console.error(`[WSS] ⚠️  WebSocket error for ${ws.peerId}: ${err.message}`);
  });

  // Handle pong responses (heartbeat)
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// ============================================================================
// MESSAGE HANDLER - Routes incoming WebSocket messages
// ============================================================================
function handleMessage(ws, message, clientIp) {
  const { type } = message;

  console.log(`[Handler] Processing message type: ${type}`);

  // Check for rejoin (has reconnectToken) before regular join
  if (type === 'join' && message.reconnectToken) {
    console.log(`[Handler] 🔄 Rejoin request with token: ${message.reconnectToken.slice(0, 10)}...`);
    handleRejoin(ws, message, clientIp);
  } else if (type === 'join') {
    handleJoin(ws, message, clientIp);
  } else if (type === 'offer') {
    relayMessage(ws, { type: 'offer', sdp: message.sdp });
  } else if (type === 'answer') {
    relayMessage(ws, { type: 'answer', sdp: message.sdp });
  } else if (type === 'ice-candidate') {
    relayMessage(ws, {
      type: 'ice-candidate',
      candidate: message.candidate,
      sdpMLineIndex: message.sdpMLineIndex,
      sdpMid: message.sdpMid
    });
  } else if (type === 'leave') {
    ws._intentionalLeave = true;
    handleLeave(ws);
  } else if (type === 'media-state') {
    // Relay media state (mic/camera enabled) to peer
    relayMessage(ws, {
      type: 'media-state',
      isMicEnabled: message.isMicEnabled,
      isCameraEnabled: message.isCameraEnabled
    });
  } else if (type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  } else {
    console.warn(`[Warning] Unknown message type: ${type}`);
  }
}

// ============================================================================
// HANDLE JOIN - Create or join existing room
// ============================================================================
function handleJoin(ws, message, clientIp) {
  const { roomId, peerId: clientPeerId, username } = message;

  console.log(`[Join] 🔓 Peer ${ws.peerId} attempting to join room: ${roomId}`);

  // Basic rate limiting
  const now = Date.now();
  const entry = ipCreateCounts.get(clientIp);
  if (entry && now - entry.timestamp < RATE_WINDOW) {
    if (entry.count >= RATE_LIMIT) {
      console.warn(`[Join] ⛔ Rate limit exceeded for ${clientIp}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limited. Try again later.' }));
      return;
    }
  }

  if (!rooms.has(roomId)) {
    // Create new room
    console.log(`[Join] ✨ Creating new room: ${roomId}`);
    const token = issueToken(ws.peerId);
    rooms.set(roomId, {
      createdAt: now,
      peers: [ws],
      disconnectedPeers: new Map(),
      gracePeriodTimers: new Map(),
      reconnectTokens: new Map([[token, { peerId: ws.peerId, expiresAt: now + RECONNECT_TOKEN_TTL }]])
    });

    // Store peer info for this room
    ws.currentRoomId = roomId;
    ws.username = username;

    // Update rate limit counter
    if (entry) {
      entry.count++;
    } else {
      ipCreateCounts.set(clientIp, { count: 1, timestamp: now });
    }

    ws.currentRoomId = roomId;
    ws.send(JSON.stringify({
      type: 'room-created',
      roomId,
      peerId: ws.peerId,
      reconnectToken: token
    }));
    console.log(`[Room] Created room ${roomId} with peer ${ws.peerId.slice(0, 8)}`);
  } else {
    const room = rooms.get(roomId);

    if (room.peers.length >= 2) {
      ws.send(JSON.stringify({
        type: 'room-full',
        roomId
      }));
      console.log(`[Room] Peer ${ws.peerId.slice(0, 8)} tried to join full room ${roomId}`);
      return;
    }

    // Store username for peer-joined relay
    ws.username = message.username || 'Guest';

    // Check if there's a peer in grace period - if so, this might be a reconnection attempt
    // Restore the disconnected peer instead of adding a new one
    let restoredPeerId = null;
    if (room.peers.length === 1 && room.disconnectedPeers.size > 0) {
      console.log(`[Room] Room has 1 active peer and ${room.disconnectedPeers.size} disconnected peer(s)`);
      console.log(`[Room] New join with username "${ws.username}" - checking for reconnection match...`);

      // For now, restore the only disconnected peer (simple case: 2-peer rooms only)
      const [disconnectedPeerId, disconnectedData] = room.disconnectedPeers.entries().next().value;
      if (disconnectedData) {
        console.log(`[Room] 🔄 Restoring disconnected peer ${disconnectedPeerId.slice(0, 8)} to active peers (likely cache clear reconnection)`);

        // Cancel grace timer for this peer
        const graceTimer = room.gracePeriodTimers.get(disconnectedPeerId);
        if (graceTimer) {
          clearTimeout(graceTimer);
          room.gracePeriodTimers.delete(disconnectedPeerId);
        }

        // Move from disconnected to active
        room.disconnectedPeers.delete(disconnectedPeerId);
        restoredPeerId = disconnectedPeerId;

        // Use the restored peer's ID for the new connection
        ws.peerId = disconnectedPeerId;
        ws.currentRoomId = roomId;

        // Update username if provided
        if (message.username) {
          ws.username = message.username;
        }

        // Add to active peers
        room.peers.push(ws);

        // Issue new token for the restored session
        const token = issueToken(disconnectedPeerId);
        room.reconnectTokens.set(token, { peerId: disconnectedPeerId, expiresAt: now + RECONNECT_TOKEN_TTL });

        // Send room-rejoined (not room-joined, because we're restoring)
        ws.send(JSON.stringify({
          type: 'room-rejoined',
          roomId,
          peerId: disconnectedPeerId,
          reconnectToken: token
        }));
        console.log(`[Room] Peer ${disconnectedPeerId.slice(0, 8)} has been restored and notified`);

        // Notify remaining active peer about reconnection
        const otherPeer = room.peers.find(p => p !== ws);
        if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
          console.log(`[Room] Notifying other peer about reconnection`);
          otherPeer.send(JSON.stringify({
            type: 'peer-reconnected',
            peerId: disconnectedPeerId,
            username: ws.username
          }));
        }

        console.log(`[Room] Peer ${disconnectedPeerId.slice(0, 8)} (${ws.username}) reconnected via cache-clear (new WebSocket)`);
        return;
      }
    }

    // Normal join flow - add as new peer
    ws.peerId = generatePeerId();
    ws.currentRoomId = roomId;

    // Add peer to existing room
    room.peers.push(ws);

    // Issue reconnect token for this peer
    const token = issueToken(ws.peerId);
    room.reconnectTokens.set(token, { peerId: ws.peerId, expiresAt: now + RECONNECT_TOKEN_TTL });

    // Notify the new peer
    ws.send(JSON.stringify({
      type: 'room-joined',
      roomId,
      peerId: ws.peerId,
      reconnectToken: token
    }));

    // Notify the existing peer that someone joined (with username fix)
    const existingPeer = room.peers[0];
    console.log(`[Room] Existing peer at index 0: ${existingPeer?.peerId?.slice(0, 8) || 'unknown'}, readyState: ${existingPeer?.readyState}`);
    if (existingPeer && existingPeer.readyState === WebSocket.OPEN) {
      console.log(`[Room] Sending peer-joined notification to ${existingPeer.peerId.slice(0, 8)}`);
      existingPeer.send(JSON.stringify({
        type: 'peer-joined',
        peerId: ws.peerId,
        username: ws.username
      }));
      console.log(`[Room] peer-joined sent successfully`);
    } else {
      console.log(`[Room] ERROR: Could not send peer-joined - existing peer not found or not open`);
    }

    console.log(`[Room] Peer ${ws.peerId.slice(0, 8)} (${ws.username}) joined room ${roomId}`);
  }
}

function relayMessage(ws, message) {
  const roomId = ws.currentRoomId;
  if (!roomId) {
    console.warn(`[Warning] Peer ${ws.peerId.slice(0, 8)} tried to relay but not in a room`);
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    console.warn(`[Warning] Room ${roomId} not found`);
    return;
  }

  // Find the other peer
  const otherPeer = room.peers.find(p => p !== ws);
  if (otherPeer && otherPeer.readyState === WebSocket.OPEN) {
    otherPeer.send(JSON.stringify(message));
  }
}

function handleLeave(ws) {
  handleDisconnect(ws);
}

function handleDisconnect(ws) {
  const roomId = ws.currentRoomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  // Remove this peer from the room
  const index = room.peers.indexOf(ws);
  if (index !== -1) {
    room.peers.splice(index, 1);
  }

  // Determine if this is intentional or accidental
  const isIntentional = ws._intentionalLeave || room.peers.length === 0;

  if (isIntentional || room.peers.length === 0) {
    // Normal cleanup: intentional leave OR no peers left
    if (room.peers.length === 1) {
      const remainingPeer = room.peers[0];
      if (remainingPeer && remainingPeer.readyState === WebSocket.OPEN) {
        remainingPeer.send(JSON.stringify({
          type: 'peer-disconnected',
          username: ws.username || 'Peer',
          canReconnect: false,
          timeoutSeconds: 0
        }));
      }
    }

    // Delete room if empty
    if (room.peers.length === 0) {
      rooms.delete(roomId);
      console.log(`[Room] Deleted empty room ${roomId}`);
    }

    console.log(`[Disconnect] Peer ${ws.peerId.slice(0, 8)} left room ${roomId} (intentional)`);
  } else {
    // Unexpected disconnect with remaining peers: activate grace period
    const disconnectedPeer = {
      peerId: ws.peerId,
      username: ws.username || 'Peer',
      disconnectedAt: Date.now()
    };

    room.disconnectedPeers.set(ws.peerId, disconnectedPeer);

    // Start 5-minute grace timer
    const graceTimer = setTimeout(() => {
      // Grace period expired, remove from disconnectedPeers and delete room if applicable
      room.disconnectedPeers.delete(ws.peerId);
      room.gracePeriodTimers.delete(ws.peerId);

      if (room.peers.length === 0 && room.disconnectedPeers.size === 0) {
        rooms.delete(roomId);
        console.log(`[Cleanup] Deleted room ${roomId} after grace period expiry`);
      }
    }, GRACE_PERIOD);

    room.gracePeriodTimers.set(ws.peerId, graceTimer);

    // Notify remaining peers
    room.peers.forEach(peer => {
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({
          type: 'peer-disconnected',
          username: disconnectedPeer.username,
          canReconnect: true,
          timeoutSeconds: Math.ceil(GRACE_PERIOD / 1000)
        }));
      }
    });

    console.log(`[Disconnect] Peer ${ws.peerId.slice(0, 8)} disconnected from room ${roomId} (grace period ${GRACE_PERIOD / 1000}s)`);
  }

  ws.currentRoomId = null;
}

function handleRejoin(ws, message, clientIp) {
  const { roomId, reconnectToken } = message;

  if (!roomId || !reconnectToken) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing roomId or reconnectToken' }));
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    ws.send(JSON.stringify({ type: 'room-not-found', roomId }));
    return;
  }

  // Look up token in room's reconnectTokens
  const tokenData = room.reconnectTokens.get(reconnectToken);
  if (!tokenData) {
    ws.send(JSON.stringify({ type: 'room-not-found', roomId }));
    return;
  }

  const now = Date.now();
  if (now > tokenData.expiresAt) {
    // Token expired
    ws.send(JSON.stringify({ type: 'room-not-found', roomId }));
    return;
  }

  const peerId = tokenData.peerId;

  // Check if peer was in disconnectedPeers
  if (room.disconnectedPeers.has(peerId)) {
    // Cancel grace timer
    const graceTimer = room.gracePeriodTimers.get(peerId);
    if (graceTimer) {
      clearTimeout(graceTimer);
      room.gracePeriodTimers.delete(peerId);
    }

    // Remove from disconnectedPeers
    room.disconnectedPeers.delete(peerId);

    // Restore peer to active peers
    ws.peerId = peerId;
    ws.username = message.username || 'Guest';
    ws.currentRoomId = roomId;
    room.peers.push(ws);

    // Issue new token
    const newToken = issueToken(peerId);
    room.reconnectTokens.set(newToken, { peerId, expiresAt: now + RECONNECT_TOKEN_TTL });

    // Send room-rejoined to rejoining peer
    ws.send(JSON.stringify({
      type: 'room-rejoined',
      roomId,
      peerId,
      reconnectToken: newToken
    }));

    // Notify remaining peers that peer reconnected
    room.peers.forEach(peer => {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({
          type: 'peer-reconnected',
          peerId,
          username: ws.username
        }));
      }
    });

    console.log(`[Room] Peer ${peerId.slice(0, 8)} rejoined room ${roomId}`);
  } else {
    // Peer not in grace period, reject rejoin
    ws.send(JSON.stringify({ type: 'room-not-found', roomId }));
  }
}

function generatePeerId() {
  return Math.random().toString(36).substr(2, 9);
}

function issueToken(peerId) {
  return 'tok_' + Math.random().toString(36).substr(2, 16);
}

// HTTP handler for TURN credentials and health check
server.on('request', (req, res) => {
  // CORS headers for all endpoints
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/turn-credentials' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }));
  } else if (req.url === '/health' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      rooms: rooms.size
    }));
  } else if (req.url === '/check' && req.method === 'GET') {
    // Comprehensive system health check
    const checks = {
      timestamp: new Date().toISOString(),
      protocol: useHTTPS ? 'WSS/HTTPS' : 'WS/HTTP',
      port: PORT,
      endpoints: {
        '/signal': {
          status: 'working',
          type: 'WebSocket',
          description: 'Main signaling WebSocket endpoint',
          clients: wss.clients.size,
          allowed: true
        },
        '/turn-credentials': {
          status: 'working',
          type: 'HTTP GET',
          description: 'STUN server configuration',
          allowed: true
        },
        '/health': {
          status: 'working',
          type: 'HTTP GET',
          description: 'Basic health check',
          allowed: true
        },
        '/check': {
          status: 'working',
          type: 'HTTP GET',
          description: 'Comprehensive system diagnostics',
          allowed: true
        },
        '/capabilities': {
          status: 'working',
          type: 'HTTP GET',
          description: 'Browser device capabilities check',
          allowed: true
        }
      },
      features: {
        websocket: {
          status: 'working',
          description: 'WebSocket signaling',
          clients_connected: wss.clients.size,
          mandatory: true,
          allowed: true
        },
        rooms: {
          status: 'working',
          description: 'Room management',
          active_rooms: rooms.size,
          max_peers_per_room: 2,
          mandatory: true,
          allowed: true
        },
        rate_limiting: {
          status: 'working',
          description: 'IP-based rate limiting',
          limit: `${RATE_LIMIT} rooms per ${RATE_WINDOW / 1000}s`,
          mandatory: true,
          allowed: true
        },
        grace_period: {
          status: 'working',
          description: 'Peer disconnect grace period',
          duration_seconds: GRACE_PERIOD / 1000,
          mandatory: true,
          allowed: true
        },
        reconnect_tokens: {
          status: 'working',
          description: 'Session recovery tokens',
          ttl_seconds: RECONNECT_TOKEN_TTL / 1000,
          mandatory: true,
          allowed: true
        },
        room_expiry: {
          status: 'working',
          description: 'Room auto-cleanup',
          expiry_seconds: ROOM_EXPIRY / 1000,
          mandatory: true,
          allowed: true
        },
        https_wss: {
          status: useHTTPS ? 'enabled' : 'disabled',
          description: 'Secure HTTPS/WSS',
          mandatory: true,
          allowed: useHTTPS
        }
      },
      system: {
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        node_version: process.version,
        platform: process.platform
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(checks, null, 2));
  } else if (req.url === '/capabilities' && req.method === 'GET') {
    // Browser device capabilities check endpoint
    // This returns capabilities that are typically checked on client side
    // but we provide server-side detection helpers and recommendations
    const capabilities = {
      timestamp: new Date().toISOString(),
      message: 'Browser capabilities must be detected on client-side. Use this endpoint reference for implementation.',
      server_supported_features: {
        webrtc: {
          name: 'WebRTC Peer Connections',
          mandatory: true,
          status: 'enabled',
          description: 'Required for video/audio calls'
        },
        websocket: {
          name: 'WebSocket',
          mandatory: true,
          status: 'enabled',
          description: 'Required for signaling'
        },
        datachannel: {
          name: 'WebRTC Data Channel',
          mandatory: true,
          status: 'enabled',
          description: 'Required for chat and file transfer'
        }
      },
      client_side_checks: {
        note: 'These must be checked in the browser. Client will report back to server.',
        camera: {
          name: 'Camera/Video Input',
          mandatory: true,
          check: 'navigator.mediaDevices?.enumerateDevices() for videoinput devices',
          description: 'Required for video calls'
        },
        microphone: {
          name: 'Microphone/Audio Input',
          mandatory: true,
          check: 'navigator.mediaDevices?.enumerateDevices() for audioinput devices',
          description: 'Required for audio calls'
        },
        speaker: {
          name: 'Speaker/Audio Output',
          mandatory: true,
          check: 'navigator.mediaDevices?.enumerateDevices() for audiooutput devices',
          description: 'Required for hearing peers'
        },
        geolocation: {
          name: 'Geolocation',
          mandatory: false,
          check: 'navigator.geolocation?.getCurrentPosition()',
          description: 'Optional - for location-based features',
          status: 'disabled'
        },
        screen_capture: {
          name: 'Screen Capture',
          mandatory: false,
          check: 'navigator.mediaDevices?.getDisplayMedia()',
          description: 'Optional - for screen sharing',
          status: 'enabled'
        },
        permission_camera: {
          name: 'Camera Permission',
          mandatory: true,
          check: 'navigator.permissions?.query({ name: "camera" })',
          description: 'Must be granted by user',
          user_action_required: true
        },
        permission_microphone: {
          name: 'Microphone Permission',
          mandatory: true,
          check: 'navigator.permissions?.query({ name: "microphone" })',
          description: 'Must be granted by user',
          user_action_required: true
        },
        permission_location: {
          name: 'Location Permission',
          mandatory: false,
          check: 'navigator.permissions?.query({ name: "geolocation" })',
          description: 'Must be granted by user if location is used',
          user_action_required: true,
          status: 'disabled'
        }
      },
      recommendations: {
        all_features_enabled: {
          priority: 'high',
          message: 'Enable camera, microphone, and speaker for best experience'
        },
        allow_permissions: {
          priority: 'high',
          message: 'Browser will ask for camera and microphone permissions when starting a call'
        },
        optional_features: {
          priority: 'low',
          message: 'Geolocation is optional and not required for calling'
        },
        security_note: {
          priority: 'high',
          message: 'All connections are encrypted with DTLS-SRTP'
        }
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(capabilities, null, 2));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'Endpoint not found',
      available_endpoints: ['/signal', '/turn-credentials', '/health', '/check', '/capabilities']
    }));
  }
});

// ============================================================================
// START SERVER
// ============================================================================
server.listen(PORT, '0.0.0.0', () => {
  const protocol = useHTTPS ? 'WSS/HTTPS' : 'WS/HTTP';
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 PeerConnect Signaling Server Started                       ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  Port:     ${PORT.toString().padEnd(55)} ║`);
  console.log(`║  Protocol: ${protocol.padEnd(55)} ║`);
  console.log(`║  Rooms:    ${rooms.size.toString().padEnd(55)} ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  if (useHTTPS) {
    console.log(`║  ✅ HTTPS/WSS ENABLED (certificates loaded)                   ║`);
    console.log(`║  WSS URL:  wss://localhost:8080/signal                        ║`);
    console.log(`║  WSS URL:  wss://192.168.1.2:8080/signal                      ║`);
    console.log(`║  WebSocket Path: /signal                                      ║`);
  } else {
    console.log(`║  ⚠️  HTTP/WS MODE (no certificates)                           ║`);
    console.log(`║  WS URL:   ws://localhost:8080/signal                         ║`);
    console.log(`║  WS URL:   ws://192.168.1.2:8080/signal                       ║`);
  }
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  Listening on: 0.0.0.0:${PORT} (all interfaces)${' '.repeat(41 - PORT.toString().length)}║`);
  console.log(`║  Ready to accept WebSocket connections                        ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

  // Log diagnostic info
  console.log('[Server] 🔍 Diagnostic Info:');
  console.log('[Server]   Node.js version:', process.version);
  console.log('[Server]   Platform:', process.platform);
  console.log('[Server]   Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB');
  console.log('[Server]   WebSocket Server path: /signal');
  console.log('[Server]   Ready to accept connections from web clients');
  console.log('[Server]   💡 Clients should connect to: ' + (useHTTPS ? 'wss' : 'ws') + '://localhost:8080/signal\n');
});
