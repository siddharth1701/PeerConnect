/**
 * WebRTC peer connection management
 * Handles offer/answer, ICE candidates, media tracks, and data channel
 */

// Fetch ICE configuration from signaling server
async function fetchIceConfig() {
  try {
    const response = await fetch('/turn-credentials');
    if (!response.ok) throw new Error('Failed to fetch ICE config');
    const data = await response.json();
    return {
      iceServers: data.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
  } catch (err) {
    console.warn('[WebRTC] Failed to fetch ICE config, using defaults:', err);
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
  }
}

export class WebRTCManager extends EventTarget {
  constructor(signalingClient, chatManager) {
    super();
    this._signalingClient = signalingClient;
    this._chatManager = chatManager;

    this._pc = null;
    this._roomId = null;
    this._isInitiator = false;
    this._pendingCandidates = [];
    this._dataChannel = null;
    this._statsInterval = null;
  }

  /**
   * Initiate a connection (caller side)
   * Creates offer and sends to peer via signaling
   * @param {string} roomId - Room to connect in
   * @param {MediaStream} localStream - Local camera/mic stream
   * @returns {Promise<void>}
   */
  async initiate(roomId, localStream) {
    try {
      this._isInitiator = true;
      this._roomId = roomId;

      const rtcConfig = await fetchIceConfig();
      this._createPeerConnection(rtcConfig);
      this._addTracks(localStream);
      this._createDataChannel();

      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);

      this._signalingClient.sendOffer(offer);
      console.log('[WebRTC] Sent offer');
    } catch (err) {
      console.error('[WebRTC] Failed to initiate:', err);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: err.message } }));
      throw err;
    }
  }

  /**
   * Handle incoming offer (callee side)
   * Creates answer and sends to peer via signaling
   * @param {string} sdp - SDP offer from peer
   * @param {MediaStream} localStream - Local camera/mic stream
   * @returns {Promise<void>}
   */
  async handleOffer(sdp, localStream) {
    try {
      if (!this._pc) {
        this._isInitiator = false;
        const rtcConfig = await fetchIceConfig();
        this._createPeerConnection(rtcConfig);
      }

      this._addTracks(localStream);
      // Do NOT create data channel — wait for ondatachannel event

      await this._pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp
      }));

      this._flushCandidates();

      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);

      this._signalingClient.sendAnswer(answer);
      console.log('[WebRTC] Sent answer');
    } catch (err) {
      console.error('[WebRTC] Failed to handle offer:', err);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: err.message } }));
      throw err;
    }
  }

  /**
   * Handle incoming answer (caller side)
   * @param {string} sdp - SDP answer from peer
   * @returns {Promise<void>}
   */
  async handleAnswer(sdp) {
    try {
      if (!this._pc) {
        throw new Error('Peer connection not initialized. Call initiate() first.');
      }

      await this._pc.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp
      }));

      this._flushCandidates();
      console.log('[WebRTC] Remote description set (answer)');
    } catch (err) {
      console.error('[WebRTC] Failed to handle answer:', err);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: err.message } }));
      throw err;
    }
  }

  /**
   * Add ICE candidate from peer
   * Buffers if remote description not yet set
   * @param {RTCIceCandidate} candidate - ICE candidate from peer
   * @returns {Promise<void>}
   */
  async addIceCandidate(candidate) {
    try {
      if (!this._pc) {
        // Buffer until peer connection is created
        this._pendingCandidates.push(candidate);
        return;
      }

      if (!this._pc.remoteDescription) {
        // Buffer until remote description is set
        this._pendingCandidates.push(candidate);
        return;
      }

      await this._pc.addIceCandidate(candidate);
    } catch (err) {
      // Some candidates fail due to restrictions, that's OK
      console.warn('[WebRTC] Failed to add ICE candidate:', err.message);
    }
  }

  /**
   * Replace the video track (for screen share or camera switching)
   * Does NOT renegotiate — just replaces the sender's track
   * @param {MediaStreamTrack} newTrack - The new video track
   * @returns {Promise<void>}
   */
  async replaceVideoTrack(newTrack) {
    try {
      if (!this._pc) {
        console.warn('[WebRTC] Peer connection not ready, cannot replace video track');
        return;
      }

      const senders = this._pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(newTrack);
        console.log('[WebRTC] Video track replaced');
      }
    } catch (err) {
      console.error('[WebRTC] Failed to replace video track:', err);
      throw err;
    }
  }

  /**
   * Replace the audio track (for noise suppression or microphone switching)
   * Does NOT renegotiate — just replaces the sender's track
   * @param {MediaStreamTrack} newTrack - The new audio track
   * @returns {Promise<void>}
   */
  async replaceAudioTrack(newTrack) {
    try {
      if (!this._pc) {
        console.warn('[WebRTC] Peer connection not ready, cannot replace audio track');
        return;
      }

      const senders = this._pc.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

      if (audioSender) {
        await audioSender.replaceTrack(newTrack);
        console.log('[WebRTC] Audio track replaced');
      }
    } catch (err) {
      console.error('[WebRTC] Failed to replace audio track:', err);
      throw err;
    }
  }

  /**
   * Get connection quality stats
   * @returns {Promise<{rtt: number, packetLoss: number, jitter: number}>}
   */
  async getConnectionStats() {
    try {
      if (!this._pc) {
        return { rtt: 0, packetLoss: 0, jitter: 0 };
      }

      const stats = await this._pc.getStats();
      let rtt = 0;
      let packetLoss = 0;
      let jitter = 0;

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          rtt = report.currentRoundTripTime || 0;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          packetLoss = report.packetsLost || 0;
          jitter = report.jitter || 0;
        }
      });

      return { rtt, packetLoss, jitter };
    } catch (err) {
      console.error('[WebRTC] Failed to get stats:', err);
      return { rtt: 0, packetLoss: 0, jitter: 0 };
    }
  }

  /**
   * Close the peer connection
   */
  close() {
    this._stopStats();
    if (this._pc) {
      this._pc.close();
      this._pc = null;
    }
    console.log('[WebRTC] Connection closed');
  }

  /**
   * @private
   */
  _createPeerConnection(rtcConfig) {
    this._pc = new RTCPeerConnection(rtcConfig);
    this._remoteStream = null;
    this._trackCount = 0;

    // ICE candidate event
    this._pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log('[WebRTC] 🧊 Sending ICE candidate');
        this._signalingClient.sendIceCandidate(candidate);
      }
    };

    // Connection state changes
    this._pc.oniceconnectionstatechange = () => {
      const state = this._pc.iceConnectionState;
      console.log('[WebRTC] 🔗 ICE state changed:', state);

      this.dispatchEvent(new CustomEvent('connection-state-change', {
        detail: { state }
      }));

      if (state === 'connected' || state === 'completed') {
        this._startStats();
      } else if (state === 'failed' || state === 'disconnected') {
        this._stopStats();
      }
    };

    // Remote media track received (fires once per track: video, audio)
    this._pc.ontrack = (event) => {
      console.log('[WebRTC] 🔴 Remote track received:', event.track.kind, '| Stream ID:', event.streams[0]?.id);

      this._trackCount++;

      // Use the first stream if multiple are sent
      if (!this._remoteStream && event.streams && event.streams.length > 0) {
        this._remoteStream = event.streams[0];
        console.log('[WebRTC] 📡 Remote stream created/captured, dispatching event');
        this.dispatchEvent(new CustomEvent('remote-stream', {
          detail: { stream: this._remoteStream }
        }));
      } else if (this._remoteStream && event.streams && event.streams.length > 0) {
        // Subsequent tracks - make sure we have all tracks
        const track = event.track;
        if (!this._remoteStream.getTracks().find(t => t.id === track.id)) {
          console.log('[WebRTC] ➕ Adding', track.kind, 'track to existing remote stream');
          this._remoteStream.addTrack(track);
        }
      }
    };

    // Data channel received (callee side only)
    this._pc.ondatachannel = ({ channel }) => {
      console.log('[WebRTC] 📊 Data channel received');
      this._dataChannel = channel;
      this._chatManager.attachChannel(channel);
    };
  }

  /**
   * @private
   */
  _addTracks(stream) {
    stream.getTracks().forEach(track => {
      this._pc.addTrack(track, stream);
    });
  }

  /**
   * @private - only initiator creates data channel
   */
  _createDataChannel() {
    this._dataChannel = this._pc.createDataChannel('chat', {
      ordered: true
    });
    this._chatManager.attachChannel(this._dataChannel);
    console.log('[WebRTC] Data channel created');
  }

  /**
   * @private - flush buffered ICE candidates
   */
  _flushCandidates() {
    for (const candidate of this._pendingCandidates) {
      try {
        this._pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[WebRTC] Failed to add buffered candidate:', err.message);
      }
    }
    this._pendingCandidates = [];
  }

  /**
   * @private - start monitoring connection quality
   */
  _startStats() {
    if (this._statsInterval) return;

    this._statsInterval = setInterval(async () => {
      const stats = await this.getConnectionStats();
      this.dispatchEvent(new CustomEvent('stats-update', {
        detail: stats
      }));
    }, 2000);
  }

  /**
   * @private
   */
  _stopStats() {
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
    }
  }

  /**
   * Reset internal state for session recovery
   * Called before reconnecting after a crash or close
   */
  reset() {
    this._stopStats();
    if (this._pc) {
      try {
        this._pc.close();
      } catch (err) {
        console.warn('[WebRTC] Error closing peer connection during reset:', err);
      }
    }
    this._pc = null;
    // Note: preserve _isInitiator and _roomId so we can reinitiate correctly
    this._pendingCandidates = [];
    this._dataChannel = null;
    // Do NOT reset _isInitiator or _roomId - these are needed to reinitiate
    console.log('[WebRTC] Reset complete (kept initiator role and room)');
  }

  /**
   * Get the current RTCPeerConnection
   * Used by FileTransfer to access the peer connection for data channel setup
   * @returns {RTCPeerConnection|null}
   */
  getPeerConnection() {
    return this._pc;
  }
}
