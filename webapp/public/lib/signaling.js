/**
 * WebSocket client for signaling server communication
 * Handles room creation/joining, SDP offer/answer exchange, and ICE candidate trickle
 */

export class SignalingClient extends EventTarget {
  constructor(serverUrl = 'ws://localhost:8080') {
    super();
    this.serverUrl = serverUrl;
    this.ws = null;
    this._pingInterval = null;
    this._intentionalClose = false;

    // Log browser and environment info for debugging
    console.log('[Signaling] 🏗️ Constructor - initialized SignalingClient');
    console.log('[Signaling] Environment:', {
      userAgent: navigator.userAgent.substring(0, 60) + '...',
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      port: window.location.port,
      url: this.serverUrl
    });
  }

  /**
   * Connect to a room on the signaling server
   * @param {string} roomId - The room code to join
   * @param {string} peerId - This peer's unique ID
   * @param {string} username - Optional username for the peer
   * @param {string} reconnectToken - Optional token for session recovery
   * @returns {Promise<{roomId: string, peerId: string}>} Resolves when joined or room created
   */
  connect(roomId, peerId, username = null, reconnectToken = null) {
    return new Promise((resolve, reject) => {
      console.log('[Signaling] 🔌 connect() called with:', { roomId, peerId, hasUsername: !!username, hasToken: !!reconnectToken });

      this._intentionalClose = false;
      let connectionResolved = false;

      // Set timeout for WebSocket connection (10 seconds)
      const connectionTimeout = setTimeout(() => {
        console.warn('[Signaling] ⏱️ Connection timeout after 10s');
        if (!connectionResolved && this.ws) {
          connectionResolved = true;
          this._intentionalClose = true;
          console.error('[Signaling] ❌ Closing WebSocket due to timeout');
          this.ws.close();
          reject(new Error(`Connection timeout. Cannot reach signaling server at ${this.serverUrl}. Check that the server is running.`));
        }
      }, 10000);

      try {
        console.log('[Signaling] 🌐 Attempting WebSocket connection to:', this.serverUrl);
        console.log('[Signaling] Browser:', {
          userAgent: navigator.userAgent.substring(0, 50),
          protocol: window.location.protocol,
          host: window.location.host
        });
        this.ws = new WebSocket(this.serverUrl);
        console.log('[Signaling] ✅ WebSocket object created, waiting for onopen...');
      } catch (err) {
        connectionResolved = true;
        clearTimeout(connectionTimeout);
        console.error('[Signaling] ❌ Failed to create WebSocket:', err.message);
        reject(new Error(`Failed to connect: ${err.message}`));
        return;
      }

      this.ws.onopen = () => {
        console.log('[Signaling] 🟢 WebSocket onopen fired');
        if (connectionResolved) {
          console.log('[Signaling] ⚠️ onopen called but connection already resolved, ignoring');
          return;
        }
        connectionResolved = true;
        clearTimeout(connectionTimeout);

        console.log('[Signaling] ✅ Connected to server successfully');
        const joinMsg = {
          type: 'join',
          roomId,
          peerId
        };
        if (username) {
          joinMsg.username = username;
        }
        if (reconnectToken) {
          joinMsg.reconnectToken = reconnectToken;
        }
        console.log('[Signaling] 📤 Sending join message:', { type: 'join', roomId, peerId, hasUsername: !!username, hasToken: !!reconnectToken });
        this.ws.send(JSON.stringify(joinMsg));

        // Start keepalive ping
        console.log('[Signaling] 🔄 Starting ping keepalive (every 25s)');
        this._startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          console.log('[Signaling] 📥 Raw message received, size:', event.data.length, 'bytes');
          const message = JSON.parse(event.data);
          console.log('[Signaling] 📨 Parsed message type:', message.type);
          this._handleMessage(message, resolve, reject);
        } catch (err) {
          console.error('[Signaling] ❌ Failed to parse message:', err, 'Raw data:', event.data.substring(0, 100));
          reject(err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Signaling] 🔴 WebSocket error event fired:', err);
        console.error('[Signaling] Error object:', {
          message: err.message,
          code: err.code,
          type: err.type,
          readyState: this.ws?.readyState
        });
        if (!connectionResolved) {
          connectionResolved = true;
          clearTimeout(connectionTimeout);
          console.error('[Signaling] ❌ Rejecting promise due to error during connection phase');
          reject(new Error(`Cannot reach signaling server at ${this.serverUrl}. The server may not be running or the address is incorrect.`));
        }
        this.dispatchEvent(new CustomEvent('error', {
          detail: { message: 'Connection error: ' + (err.message || 'Unknown error') }
        }));
      };

      this.ws.onclose = () => {
        console.log('[Signaling] 🔌 WebSocket onclose fired, readyState:', this.ws?.readyState);
        clearTimeout(connectionTimeout);
        this._stopPing();
        if (!this._intentionalClose && !connectionResolved) {
          connectionResolved = true;
          console.error('[Signaling] ❌ Connection closed before joining room');
          reject(new Error('Connection closed before joining room'));
        }
        if (!this._intentionalClose) {
          console.log('[Signaling] Unexpected disconnect from server, dispatching disconnected event');
          this.dispatchEvent(new CustomEvent('disconnected', { detail: {} }));
        } else {
          console.log('[Signaling] ✅ Intentional close completed');
        }
      };
    });
  }

  /**
   * Send an SDP offer to the other peer
   * @param {RTCSessionDescription} offer - The SDP offer
   */
  sendOffer(offer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Signaling] 📤 sendOffer() - SDP length:', offer.sdp.length, 'bytes');
      this.ws.send(JSON.stringify({
        type: 'offer',
        sdp: offer.sdp
      }));
      console.log('[Signaling] ✅ Offer sent');
    } else {
      console.warn('[Signaling] ⚠️ sendOffer() - WebSocket not ready, readyState:', this.ws?.readyState);
    }
  }

  /**
   * Send an SDP answer to the other peer
   * @param {RTCSessionDescription} answer - The SDP answer
   */
  sendAnswer(answer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Signaling] 📤 sendAnswer() - SDP length:', answer.sdp.length, 'bytes');
      this.ws.send(JSON.stringify({
        type: 'answer',
        sdp: answer.sdp
      }));
      console.log('[Signaling] ✅ Answer sent');
    } else {
      console.warn('[Signaling] ⚠️ sendAnswer() - WebSocket not ready, readyState:', this.ws?.readyState);
    }
  }

  /**
   * Send an ICE candidate to the other peer
   * @param {RTCIceCandidate} candidate - The ICE candidate
   */
  sendIceCandidate(candidate) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Signaling] 📤 sendIceCandidate() - candidate:', candidate.candidate?.substring(0, 40) + '...');
      this.ws.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid
      }));
    } else {
      console.warn('[Signaling] ⚠️ sendIceCandidate() - WebSocket not ready, readyState:', this.ws?.readyState);
    }
  }

  /**
   * Send media state (mic/camera enabled/disabled)
   */
  sendMediaState(isMicEnabled, isCameraEnabled) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'media-state',
        isMicEnabled,
        isCameraEnabled
      }));
    }
  }

  /**
   * Send leave message and close connection
   */
  sendLeave() {
    console.log('[Signaling] 📤 sendLeave() called');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Signaling] Sending leave message');
      this.ws.send(JSON.stringify({ type: 'leave' }));
    } else {
      console.warn('[Signaling] ⚠️ sendLeave() - WebSocket not ready, still disconnecting');
    }
    this.disconnect();
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect() {
    console.log('[Signaling] 🔌 disconnect() called, readyState:', this.ws?.readyState);
    this._stopPing();
    this._intentionalClose = true;
    if (this.ws) {
      console.log('[Signaling] Closing WebSocket');
      this.ws.close();
      this.ws = null;
      console.log('[Signaling] ✅ WebSocket closed and nulled');
    }
  }

  /**
   * @private
   */
  _handleMessage(message, resolve, reject) {
    const { type } = message;

    console.log(`[Signaling] 📨 _handleMessage() type: ${type}`, message);

    switch (type) {
      case 'room-created':
        console.log('[Signaling] ✅ Room created, roomId:', message.roomId, 'peerId:', message.peerId);
        this.dispatchEvent(new CustomEvent('room-created', { detail: message }));
        resolve(message);
        break;

      case 'room-joined':
        console.log('[Signaling] ✅ Joined existing room, roomId:', message.roomId, 'peerId:', message.peerId);
        this.dispatchEvent(new CustomEvent('room-joined', { detail: message }));
        resolve(message);
        break;

      case 'room-full':
        console.error('[Signaling] ❌ Room is full');
        this.dispatchEvent(new CustomEvent('room-full', { detail: message }));
        reject(new Error('Room is full'));
        break;

      case 'peer-joined':
        console.log('[Signaling] 👥 Peer joined room, peerId:', message.peerId, 'username:', message.username);
        this.dispatchEvent(new CustomEvent('peer-joined', { detail: message }));
        break;

      case 'offer':
        console.log('[Signaling] 🎬 Received offer, SDP length:', message.sdp?.length || 0);
        this.dispatchEvent(new CustomEvent('offer', { detail: message }));
        break;

      case 'answer':
        console.log('[Signaling] 📞 Received answer, SDP length:', message.sdp?.length || 0);
        this.dispatchEvent(new CustomEvent('answer', { detail: message }));
        break;

      case 'ice-candidate':
        console.log('[Signaling] 🧊 Received ICE candidate:', message.candidate?.substring(0, 40) + '...');
        this.dispatchEvent(new CustomEvent('ice-candidate', { detail: message }));
        break;

      case 'peer-left':
        console.log('[Signaling] 👋 Peer left the room');
        this.dispatchEvent(new CustomEvent('peer-left', { detail: {} }));
        break;

      case 'peer-disconnected':
        console.warn('[Signaling] ⚠️ Peer disconnected unexpectedly, grace period started:', message.timeoutSeconds, 'seconds');
        this.dispatchEvent(new CustomEvent('peer-disconnected', { detail: message }));
        break;

      case 'peer-reconnected':
        console.log('[Signaling] 🔄 Peer reconnected during grace period:', message.username);
        console.log('[Signaling] 📤 Dispatching peer-reconnected event to listeners');
        this.dispatchEvent(new CustomEvent('peer-reconnected', { detail: message }));
        break;

      case 'room-rejoined':
        console.log('[Signaling] ✅ Session recovered, room rejoined with new token');
        this.dispatchEvent(new CustomEvent('room-rejoined', { detail: message }));
        resolve(message);
        break;

      case 'room-not-found':
        console.error('[Signaling] ❌ Room not found or session expired');
        this.dispatchEvent(new CustomEvent('room-not-found', { detail: message }));
        reject(new Error('Room not found or session expired'));
        break;

      case 'error':
        console.error('[Signaling] ❌ Server error:', message.message);
        this.dispatchEvent(new CustomEvent('error', { detail: message }));
        reject(new Error(message.message));
        break;

      case 'pong':
        // Keepalive response, log silently to avoid spam
        console.log('[Signaling] 💓 Pong received (keepalive)');
        break;

      default:
        console.warn(`[Signaling] ⚠️ Unknown message type: ${type}`);
    }
  }

  /**
   * @private
   */
  _startPing() {
    console.log('[Signaling] 🔄 _startPing() - setting up keepalive every 25 seconds');
    this._pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[Signaling] 📤 Sending keepalive ping');
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        console.warn('[Signaling] ⚠️ Cannot send ping, WebSocket not open. readyState:', this.ws?.readyState);
      }
    }, 25000); // 25 seconds
  }

  /**
   * @private
   */
  _stopPing() {
    if (this._pingInterval) {
      console.log('[Signaling] 🛑 _stopPing() - clearing keepalive interval');
      clearInterval(this._pingInterval);
      this._pingInterval = null;
      console.log('[Signaling] ✅ Keepalive stopped');
    }
  }
}
