/**
 * SessionManager — Handle session persistence and duplicate tab detection
 *
 * Features:
 * - Tab identity via sessionStorage (isolated per tab, cleared in incognito)
 * - Duplicate tab detection via BroadcastChannel (claim-and-ack pattern)
 * - Session persistence via localStorage (survives crashes, cleared on intentional hangup)
 * - Session restoration with 30-minute expiry window
 */

export class SessionManager extends EventTarget {
  constructor() {
    super();
    this._tabId = this._initTabId();
    this._broadcastChannel = null;
    this._sessionKey = 'peerconnect_session';
    this._tabIdKey = 'peerconnect_tab_id';
    this._claimTimeout = null;
    this._isActive = false;

    // Try to initialize BroadcastChannel (graceful fallback if not available)
    try {
      this._broadcastChannel = new BroadcastChannel('peerconnect_tabs');
      this._broadcastChannel.addEventListener('message', (event) => this._handleBroadcastMessage(event));
    } catch (err) {
      console.warn('[SessionManager] BroadcastChannel not available, duplicate tab detection disabled');
    }
  }

  /**
   * Initialize or retrieve tab ID from sessionStorage
   * Each tab gets a unique ID (isolated per tab + per incognito window)
   */
  _initTabId() {
    const existing = sessionStorage.getItem(this._tabIdKey);
    if (existing) return existing;

    const newTabId = 'tab_' + Math.random().toString(36).substr(2, 12);
    sessionStorage.setItem(this._tabIdKey, newTabId);
    return newTabId;
  }

  /**
   * Handle incoming BroadcastChannel messages
   */
  _handleBroadcastMessage(event) {
    const { type, tabId } = event.data;

    if (type === 'claim-session' && tabId !== this._tabId) {
      // Another tab is trying to claim the session
      if (this._isActive) {
        // We are active, tell them they are a duplicate
        this._broadcastChannel.postMessage({
          type: 'claim-response',
          tabId: this._tabId,
          isActive: true
        });
      }
    } else if (type === 'claim-response' && event.data.isActive) {
      // Another tab responded saying they are active
      // Dispatch event so app can show duplicate banner
      this.dispatchEvent(new CustomEvent('duplicate-tab-found', {
        detail: { activeTabId: event.data.tabId }
      }));
    } else if (type === 'focus-request') {
      // Another tab is asking us to focus (only works if user initiated)
      if (this._isActive) {
        window.focus();
      }
    }
  }

  /**
   * Claim this tab as the active session
   * Returns: Promise<boolean> — true if successfully claimed, false if duplicate found
   *
   * Uses 200ms timeout for other tabs to respond
   */
  async claimSession() {
    if (!this._broadcastChannel) {
      // BroadcastChannel not available, assume active
      this._isActive = true;
      return true;
    }

    return new Promise((resolve) => {
      let responseReceived = false;

      // Send claim message to other tabs
      this._broadcastChannel.postMessage({
        type: 'claim-session',
        tabId: this._tabId
      });

      // If we get a response, we are a duplicate
      const onResponse = (event) => {
        if (event.type === 'claim-response' && event.data.isActive && event.data.tabId !== this._tabId) {
          responseReceived = true;
          clearTimeout(this._claimTimeout);
          this._isActive = false;
          this._broadcastChannel.removeEventListener('message', onResponse);
          resolve(false);
        }
      };

      this._broadcastChannel.addEventListener('message', onResponse);

      // Wait 200ms for any responses
      this._claimTimeout = setTimeout(() => {
        // Remove listener and resolve regardless of response
        this._broadcastChannel.removeEventListener('message', onResponse);

        if (!responseReceived) {
          // No other tabs claimed to be active, this tab is active
          this._isActive = true;
          resolve(true);
        }
      }, 200);
    });
  }

  /**
   * Ask the active tab to focus (for duplicate tab redirect)
   */
  focusActiveTab() {
    if (this._broadcastChannel) {
      this._broadcastChannel.postMessage({
        type: 'focus-request',
        tabId: this._tabId
      });
    }
  }

  /**
   * Release session (mark this tab as inactive)
   * Called on intentional leave or hangup
   */
  releaseSession() {
    this._isActive = false;
    if (this._claimTimeout) {
      clearTimeout(this._claimTimeout);
    }
  }

  /**
   * Save session to localStorage for crash recovery
   * Called after successful room creation or join
   *
   * @param {Object} data — { roomId, peerId, username, reconnectToken }
   */
  saveSession(data) {
    const sessionData = {
      roomId: data.roomId,
      peerId: data.peerId,
      username: data.username || 'Guest',
      reconnectToken: data.reconnectToken,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(this._sessionKey, JSON.stringify(sessionData));
      console.log('[SessionManager] Session saved:', {
        roomId: sessionData.roomId,
        peerId: sessionData.peerId.slice(0, 8),
        age: new Date(sessionData.savedAt).toISOString()
      });
    } catch (err) {
      console.error('[SessionManager] Failed to save session:', err);
    }
  }

  /**
   * Load session from localStorage for crash recovery
   * Returns: { roomId, peerId, username, reconnectToken } or null
   *
   * Returns null if:
   * - No saved session
   * - Session is > 30 minutes old
   */
  loadSession() {
    try {
      const stored = localStorage.getItem(this._sessionKey);
      if (!stored) return null;

      const sessionData = JSON.parse(stored);
      const now = Date.now();
      const ageMs = now - sessionData.savedAt;
      const AGE_LIMIT = 30 * 60 * 1000; // 30 minutes

      if (ageMs > AGE_LIMIT) {
        console.log('[SessionManager] Session expired (>30 min old)');
        return null;
      }

      console.log('[SessionManager] Loaded session:', {
        roomId: sessionData.roomId,
        peerId: sessionData.peerId.slice(0, 8),
        ageSeconds: Math.round(ageMs / 1000)
      });

      return sessionData;
    } catch (err) {
      console.error('[SessionManager] Failed to load session:', err);
      return null;
    }
  }

  /**
   * Clear session from localStorage
   * Called on intentional hangup or when resuming session
   */
  clearSession() {
    try {
      localStorage.removeItem(this._sessionKey);
      console.log('[SessionManager] Session cleared');
    } catch (err) {
      console.error('[SessionManager] Failed to clear session:', err);
    }
  }

  /**
   * Get session age in seconds
   * Useful for displaying "Resume previous call?" prompt
   */
  getSessionAge() {
    try {
      const stored = localStorage.getItem(this._sessionKey);
      if (!stored) return null;

      const sessionData = JSON.parse(stored);
      const ageMs = Date.now() - sessionData.savedAt;
      return Math.round(ageMs / 1000);
    } catch (err) {
      return null;
    }
  }

  /**
   * Get session room ID (without loading full session)
   * Useful for displaying in resume prompt
   */
  getSessionRoomId() {
    try {
      const stored = localStorage.getItem(this._sessionKey);
      if (!stored) return null;

      const sessionData = JSON.parse(stored);
      return sessionData.roomId;
    } catch (err) {
      return null;
    }
  }
}
