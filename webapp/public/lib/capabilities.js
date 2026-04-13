/**
 * Device Capabilities Detector
 * Checks for camera, microphone, speaker, geolocation, screen capture
 */

export class CapabilitiesDetector {
  constructor() {
    this._capabilities = {
      webrtc: false,
      websocket: false,
      camera: false,
      microphone: false,
      speaker: false,
      geolocation: false,
      screen_capture: false,
      permissions: {
        camera: 'denied',
        microphone: 'denied',
        location: 'denied'
      }
    };
    this._devices = new Map();
  }

  /**
   * Run all capability checks
   * @returns {Promise<Object>} Capabilities report
   */
  async detectAll() {
    console.log('[Capabilities] Running full detection...');

    // Basic API checks (synchronous)
    this._checkWebRTC();
    this._checkWebSocket();
    this._checkGeolocation();
    this._checkScreenCapture();

    // Device enumeration (requires permission)
    await this._enumerateDevices();

    // Permission checks (async)
    await this._checkPermissions();

    return this.getReport();
  }

  /**
   * Check for WebRTC support
   * @private
   */
  _checkWebRTC() {
    const rtcSupported =
      window.RTCPeerConnection ||
      window.webkitRTCPeerConnection ||
      window.mozRTCPeerConnection;

    this._capabilities.webrtc = !!rtcSupported;
    console.log('[Capabilities] WebRTC:', this._capabilities.webrtc ? '✅' : '❌');
  }

  /**
   * Check for WebSocket support
   * @private
   */
  _checkWebSocket() {
    this._capabilities.websocket = !!window.WebSocket;
    console.log('[Capabilities] WebSocket:', this._capabilities.websocket ? '✅' : '❌');
  }

  /**
   * Check for Geolocation API
   * @private
   */
  _checkGeolocation() {
    this._capabilities.geolocation = !!navigator.geolocation;
    console.log('[Capabilities] Geolocation:', this._capabilities.geolocation ? '✅' : '❌');
  }

  /**
   * Check for Screen Capture API
   * @private
   */
  _checkScreenCapture() {
    const screenCaptureSupported =
      navigator.mediaDevices?.getDisplayMedia !== undefined;

    this._capabilities.screen_capture = !!screenCaptureSupported;
    console.log('[Capabilities] Screen Capture:', this._capabilities.screen_capture ? '✅' : '❌');
  }

  /**
   * Enumerate available media devices
   * @private
   */
  async _enumerateDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('[Capabilities] enumerateDevices not supported');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices.filter(d => d.kind === 'videoinput');
      const microphones = devices.filter(d => d.kind === 'audioinput');
      const speakers = devices.filter(d => d.kind === 'audiooutput');

      this._capabilities.camera = cameras.length > 0;
      this._capabilities.microphone = microphones.length > 0;
      this._capabilities.speaker = speakers.length > 0;

      // Store device info
      this._devices.set('cameras', cameras);
      this._devices.set('microphones', microphones);
      this._devices.set('speakers', speakers);

      console.log(`[Capabilities] Found ${cameras.length} camera(s), ${microphones.length} microphone(s), ${speakers.length} speaker(s)`);
      console.log('[Capabilities] Camera:', this._capabilities.camera ? '✅' : '❌');
      console.log('[Capabilities] Microphone:', this._capabilities.microphone ? '✅' : '❌');
      console.log('[Capabilities] Speaker:', this._capabilities.speaker ? '✅' : '❌');
    } catch (err) {
      console.warn('[Capabilities] Error enumerating devices:', err.message);
      // User may have denied permission initially
      this._capabilities.camera = false;
      this._capabilities.microphone = false;
      this._capabilities.speaker = false;
    }
  }

  /**
   * Check permissions using Permissions API
   * @private
   */
  async _checkPermissions() {
    try {
      if (!navigator.permissions?.query) {
        console.warn('[Capabilities] Permissions API not supported');
        return;
      }

      // Check camera permission
      try {
        const cameraStatus = await navigator.permissions.query({ name: 'camera' });
        this._capabilities.permissions.camera = cameraStatus.state;
        console.log(`[Capabilities] Camera permission: ${cameraStatus.state}`);
      } catch (err) {
        console.warn('[Capabilities] Camera permission check failed:', err.message);
      }

      // Check microphone permission
      try {
        const micStatus = await navigator.permissions.query({ name: 'microphone' });
        this._capabilities.permissions.microphone = micStatus.state;
        console.log(`[Capabilities] Microphone permission: ${micStatus.state}`);
      } catch (err) {
        console.warn('[Capabilities] Microphone permission check failed:', err.message);
      }

      // Check geolocation permission
      try {
        const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
        this._capabilities.permissions.location = geoStatus.state;
        console.log(`[Capabilities] Geolocation permission: ${geoStatus.state}`);
      } catch (err) {
        console.warn('[Capabilities] Geolocation permission check failed:', err.message);
      }
    } catch (err) {
      console.warn('[Capabilities] Permission checks skipped:', err.message);
    }
  }

  /**
   * Get capabilities report
   * @returns {Object} Current capabilities state
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language
      },
      hardware: {
        camera: {
          available: this._capabilities.camera,
          count: this._devices.get('cameras')?.length || 0,
          devices: this._devices.get('cameras')?.map(d => ({
            deviceId: d.deviceId,
            label: d.label || 'Unknown Camera'
          })) || [],
          mandatory: true,
          status: this._capabilities.camera ? 'enabled' : 'disabled'
        },
        microphone: {
          available: this._capabilities.microphone,
          count: this._devices.get('microphones')?.length || 0,
          devices: this._devices.get('microphones')?.map(d => ({
            deviceId: d.deviceId,
            label: d.label || 'Unknown Microphone'
          })) || [],
          mandatory: true,
          status: this._capabilities.microphone ? 'enabled' : 'disabled'
        },
        speaker: {
          available: this._capabilities.speaker,
          count: this._devices.get('speakers')?.length || 0,
          devices: this._devices.get('speakers')?.map(d => ({
            deviceId: d.deviceId,
            label: d.label || 'Unknown Speaker'
          })) || [],
          mandatory: true,
          status: this._capabilities.speaker ? 'enabled' : 'disabled'
        }
      },
      apis: {
        webrtc: {
          available: this._capabilities.webrtc,
          mandatory: true,
          status: this._capabilities.webrtc ? 'enabled' : 'disabled'
        },
        websocket: {
          available: this._capabilities.websocket,
          mandatory: true,
          status: this._capabilities.websocket ? 'enabled' : 'disabled'
        },
        geolocation: {
          available: this._capabilities.geolocation,
          mandatory: false,
          status: this._capabilities.geolocation ? 'enabled' : 'disabled'
        },
        screen_capture: {
          available: this._capabilities.screen_capture,
          mandatory: false,
          status: this._capabilities.screen_capture ? 'enabled' : 'disabled'
        }
      },
      permissions: {
        camera: {
          status: this._capabilities.permissions.camera,
          mandatory: true
        },
        microphone: {
          status: this._capabilities.permissions.microphone,
          mandatory: true
        },
        location: {
          status: this._capabilities.permissions.location,
          mandatory: false
        }
      },
      summary: {
        all_mandatory_available: this._checkMandatoryRequirements(),
        ready_for_calling: this._isReadyForCalling(),
        warnings: this._getWarnings()
      }
    };
  }

  /**
   * Check if all mandatory features are available
   * @private
   */
  _checkMandatoryRequirements() {
    return (
      this._capabilities.webrtc &&
      this._capabilities.websocket &&
      this._capabilities.camera &&
      this._capabilities.microphone &&
      this._capabilities.speaker
    );
  }

  /**
   * Check if system is ready for calling
   * @private
   */
  _isReadyForCalling() {
    const hasDevices =
      this._capabilities.camera &&
      this._capabilities.microphone &&
      this._capabilities.speaker;

    const hasApis =
      this._capabilities.webrtc &&
      this._capabilities.websocket;

    const permissionsGranted =
      this._capabilities.permissions.camera !== 'denied' &&
      this._capabilities.permissions.microphone !== 'denied';

    return hasDevices && hasApis && permissionsGranted;
  }

  /**
   * Generate warnings for missing features
   * @private
   */
  _getWarnings() {
    const warnings = [];

    if (!this._capabilities.webrtc) {
      warnings.push({
        level: 'critical',
        message: 'WebRTC not supported - calls will not work'
      });
    }

    if (!this._capabilities.websocket) {
      warnings.push({
        level: 'critical',
        message: 'WebSocket not supported - signaling will not work'
      });
    }

    if (!this._capabilities.camera) {
      warnings.push({
        level: 'high',
        message: 'No camera detected - you will not be able to send video'
      });
    }

    if (!this._capabilities.microphone) {
      warnings.push({
        level: 'high',
        message: 'No microphone detected - you will not be able to send audio'
      });
    }

    if (!this._capabilities.speaker) {
      warnings.push({
        level: 'high',
        message: 'No speaker detected - you will not be able to hear peers'
      });
    }

    if (this._capabilities.permissions.camera === 'denied') {
      warnings.push({
        level: 'warning',
        message: 'Camera permission denied - you can re-grant in browser settings'
      });
    }

    if (this._capabilities.permissions.microphone === 'denied') {
      warnings.push({
        level: 'warning',
        message: 'Microphone permission denied - you can re-grant in browser settings'
      });
    }

    if (!this._capabilities.screen_capture) {
      warnings.push({
        level: 'info',
        message: 'Screen capture not supported - screen sharing will be unavailable'
      });
    }

    return warnings;
  }

  /**
   * Get device count summary
   * @returns {Object}
   */
  getDeviceSummary() {
    return {
      cameras: this._devices.get('cameras')?.length || 0,
      microphones: this._devices.get('microphones')?.length || 0,
      speakers: this._devices.get('speakers')?.length || 0
    };
  }

  /**
   * Request user permission for camera/microphone
   * @returns {Promise<boolean>} True if permission granted
   */
  async requestMediaPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      // Close the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());

      console.log('[Capabilities] Media permission granted');

      // Re-check permissions
      await this._checkPermissions();
      await this._enumerateDevices();

      return true;
    } catch (err) {
      console.warn('[Capabilities] Permission denied:', err.message);
      return false;
    }
  }
}
