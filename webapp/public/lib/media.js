/**
 * Media acquisition and management
 * Handles camera/microphone streams and screen sharing
 */

export class MediaManager {
  constructor() {
    this._cameraStream = null;
    this._screenStream = null;
  }

  /**
   * Get camera and microphone stream
   * @param {string} [videoDeviceId] - Specific camera device ID (optional)
   * @param {string} [audioDeviceId] - Specific microphone device ID (optional)
   * @returns {Promise<MediaStream>} Camera + mic stream
   * @throws {Error} If permission denied or devices unavailable
   */
  async getCameraStream(videoDeviceId = null, audioDeviceId = null) {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported on this browser or device');
      }

      // Check if we're on Safari and non-HTTPS non-localhost
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isSecure = window.location.protocol === 'https:';

      if (isSafari && !isLocalhost && !isSecure) {
        const error = new Error('Safari requires HTTPS for camera/microphone on non-localhost URLs');
        error.name = 'SafariHTTPSRequired';
        throw error;
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      // Add specific device IDs if provided
      if (videoDeviceId) {
        constraints.video.deviceId = { exact: videoDeviceId };
      }
      if (audioDeviceId) {
        constraints.audio.deviceId = { exact: audioDeviceId };
      }

      try {
        // Try with full constraints first
        this._cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (strictErr) {
        console.warn('[Media] Strict constraints failed, trying fallback for mobile/Safari:', strictErr.message);
        console.warn('[Media] Error type:', strictErr.name);

        // Fallback: use minimal constraints for mobile devices and Safari
        // Safari is stricter about constraints, so try with just true first
        try {
          const fallbackConstraints = {
            video: true,
            audio: true
          };
          this._cameraStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        } catch (minimalErr) {
          console.warn('[Media] Minimal constraints also failed, trying video-only:', minimalErr.message);
          // Last resort: video only
          this._cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      console.log('[Media] Camera stream acquired');
      return this._cameraStream;
    } catch (err) {
      console.error('[Media] Failed to get camera stream:', err);
      console.error('[Media] Error name:', err?.name);
      console.error('[Media] Error message:', err?.message);
      throw err;
    }
  }

  /**
   * Get screen share stream (including window or full screen)
   * User will see browser's native picker to choose what to share
   * @returns {Promise<MediaStream>} Screen stream
   * @throws {Error} If user cancels or permission denied
   */
  async getScreenStream() {
    try {
      const constraints = {
        video: {
          cursor: 'always'
        },
        audio: false // System audio is complex, skip for MVP
      };

      this._screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      console.log('[Media] Screen stream acquired');

      // Listen for user clicking browser's "Stop sharing" button
      const videoTrack = this._screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          console.log('[Media] Screen sharing stopped by user');
          this._screenStream = null;
        });
      }

      return this._screenStream;
    } catch (err) {
      console.error('[Media] Failed to get screen stream:', err);
      throw err;
    }
  }

  /**
   * Enumerate available cameras and microphones
   * Note: device labels only populated after getUserMedia is granted
   * @returns {Promise<{cameras: Array, microphones: Array}>}
   */
  async enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));

      const microphones = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));

      return { cameras, microphones };
    } catch (err) {
      console.error('[Media] Failed to enumerate devices:', err);
      return { cameras: [], microphones: [] };
    }
  }

  /**
   * Toggle audio track on/off
   * Keeps track alive, just mutes it
   * @param {boolean} enabled - True to unmute, false to mute
   */
  setAudioEnabled(enabled) {
    if (this._cameraStream) {
      this._cameraStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Toggle video track on/off
   * @param {boolean} enabled - True to enable video, false to disable
   */
  setVideoEnabled(enabled) {
    if (this._cameraStream) {
      this._cameraStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Stop all camera/mic tracks
   */
  stopCameraStream() {
    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(track => track.stop());
      this._cameraStream = null;
      console.log('[Media] Camera stream stopped');
    }
  }

  /**
   * Stop all screen share tracks
   */
  stopScreenStream() {
    if (this._screenStream) {
      this._screenStream.getTracks().forEach(track => track.stop());
      this._screenStream = null;
      console.log('[Media] Screen stream stopped');
    }
  }

  /**
   * Get the current camera stream
   * @returns {MediaStream|null}
   */
  getCameraStreamObject() {
    return this._cameraStream;
  }

  /**
   * Get the current screen stream
   * @returns {MediaStream|null}
   */
  getScreenStreamObject() {
    return this._screenStream;
  }
}
