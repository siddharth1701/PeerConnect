/**
 * Real-time speaker detection using Web Audio API
 * Detects who is speaking and provides callbacks
 */

export class SpeakerDetector extends EventTarget {
  constructor() {
    super();
    this._audioContext = null;
    this._analyser = null;
    this._dataArray = null;
    this._animationFrameId = null;
    this._isSpeaking = false;
    this._speakingThreshold = 30; // Adjust based on sensitivity
    this._smoothingFactor = 0.8;
    this._smoothedLevel = 0;
  }

  /**
   * Initialize speaker detector with audio stream
   * @param {MediaStream} stream - The audio stream to monitor
   */
  init(stream) {
    try {
      if (!this._audioContext) {
        this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const source = this._audioContext.createMediaStreamAudioSource(stream);

      if (!this._analyser) {
        this._analyser = this._audioContext.createAnalyser();
        this._analyser.fftSize = 256;
        this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
      }

      source.connect(this._analyser);
      this._analyser.connect(this._audioContext.destination);

      console.log('[SpeakerDetector] Initialized with stream');
      this._startDetection();
    } catch (err) {
      console.error('[SpeakerDetector] Failed to initialize:', err);
    }
  }

  /**
   * Get current audio level (0-100)
   * @returns {number} Audio level percentage
   */
  getAudioLevel() {
    if (!this._analyser) return 0;

    this._analyser.getByteFrequencyData(this._dataArray);

    // Calculate average frequency magnitude
    let sum = 0;
    for (let i = 0; i < this._dataArray.length; i++) {
      sum += this._dataArray[i];
    }
    const average = sum / this._dataArray.length;

    // Smooth the level with exponential moving average
    this._smoothedLevel = this._smoothingFactor * this._smoothedLevel +
                          (1 - this._smoothingFactor) * average;

    // Convert to 0-100 scale
    return Math.min(100, Math.round((this._smoothedLevel / 256) * 100));
  }

  /**
   * Check if currently speaking
   * @returns {boolean}
   */
  isSpeaking() {
    return this.getAudioLevel() > this._speakingThreshold;
  }

  /**
   * Set speaking threshold (0-100)
   * @param {number} threshold
   */
  setThreshold(threshold) {
    this._speakingThreshold = Math.max(0, Math.min(100, threshold));
  }

  /**
   * Start detection loop
   * @private
   */
  _startDetection() {
    const detect = () => {
      const level = this.getAudioLevel();
      const isSpeaking = this.isSpeaking();

      // Dispatch level update
      this.dispatchEvent(new CustomEvent('level-update', {
        detail: { level, isSpeaking }
      }));

      // Dispatch speaking state change
      if (isSpeaking !== this._isSpeaking) {
        this._isSpeaking = isSpeaking;
        this.dispatchEvent(new CustomEvent('speaking-changed', {
          detail: { isSpeaking }
        }));
      }

      this._animationFrameId = requestAnimationFrame(detect);
    };

    detect();
  }

  /**
   * Stop detection
   */
  stop() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
    if (this._audioContext && this._audioContext.state !== 'closed') {
      this._audioContext.close();
    }
    this._analyser = null;
    this._audioContext = null;
  }
}
