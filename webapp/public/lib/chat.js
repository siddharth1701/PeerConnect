/**
 * P2P chat over WebRTC Data Channel
 * Handles text messages and typing indicators
 */

export class ChatManager extends EventTarget {
  constructor(senderName = 'User') {
    super();
    this._channel = null;
    this._typingTimer = null;
    this._senderName = senderName;
  }

  setSenderName(name) {
    this._senderName = name;
  }

  /**
   * Attach to a WebRTC data channel
   * Sets up message handlers
   * @param {RTCDataChannel} dataChannel - The data channel from WebRTC connection
   */
  attachChannel(dataChannel) {
    this._channel = dataChannel;

    this._channel.onopen = () => {
      console.log('[Chat] Data channel opened');
      this.dispatchEvent(new CustomEvent('channel-open', { detail: {} }));
    };

    this._channel.onclose = () => {
      console.log('[Chat] Data channel closed');
      this.dispatchEvent(new CustomEvent('channel-closed', { detail: {} }));
    };

    this._channel.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this._channel.onerror = (err) => {
      console.error('[Chat] Data channel error:', err);
    };
  }

  /**
   * Send a text message to the peer
   * @param {string} text - The message text
   * @throws {Error} If data channel not open
   */
  sendMessage(text) {
    if (!this.isOpen()) {
      throw new Error('Data channel not open');
    }

    const message = {
      type: 'chat',
      text,
      sender: this._senderName,
      timestamp: Date.now()
    };

    this._channel.send(JSON.stringify(message));

    // Dispatch local message event
    this.dispatchEvent(new CustomEvent('message', {
      detail: {
        text,
        sender: this._senderName,
        timestamp: message.timestamp,
        fromSelf: true
      }
    }));

    console.log('[Chat] Sent message:', text);
  }

  /**
   * Notify peer that this user is typing
   * Debounced: only sends 'typing-stopped' after 2 seconds of inactivity
   */
  notifyTyping() {
    if (!this.isOpen()) return;

    // Clear existing timer
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
    } else {
      // Send typing indicator on first keystroke
      this._channel.send(JSON.stringify({ type: 'typing' }));
    }

    // Set timer to send typing-stopped after 2 seconds
    this._typingTimer = setTimeout(() => {
      if (this.isOpen()) {
        this._channel.send(JSON.stringify({ type: 'typing-stopped' }));
      }
      this._typingTimer = null;
    }, 2000);
  }

  /**
   * Check if data channel is open
   * @returns {boolean} True if channel ready to send
   */
  isOpen() {
    return this._channel && this._channel.readyState === 'open';
  }

  /**
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'chat':
          this.dispatchEvent(new CustomEvent('message', {
            detail: {
              text: message.text,
              sender: message.sender || 'Peer',
              timestamp: message.timestamp,
              fromSelf: false
            }
          }));
          console.log('[Chat] Received message:', message.text, 'from', message.sender);
          break;

        case 'typing':
          this.dispatchEvent(new CustomEvent('peer-typing', { detail: {} }));
          break;

        case 'typing-stopped':
          this.dispatchEvent(new CustomEvent('peer-typing-stopped', { detail: {} }));
          break;

        default:
          console.warn('[Chat] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[Chat] Failed to parse message:', err);
    }
  }
}
