/**
 * Multi-view layout manager
 * Supports Speaker, Gallery (Grid), and Focus views
 */

export class LayoutManager extends EventTarget {
  constructor(containerEl) {
    super();
    this._container = containerEl;
    this._currentLayout = 'speaker'; // 'speaker', 'gallery', 'focus'
    this._videoElements = new Map(); // id -> { video, name, isSpeaking, level }
    this._activeSpeaker = null;
  }

  /**
   * Register a video element
   * @param {string} peerId - Unique identifier for peer
   * @param {HTMLVideoElement} videoEl - Video element
   * @param {string} name - Peer name
   * @param {boolean} isLocal - Is this the local video?
   */
  registerVideo(peerId, videoEl, name, isLocal = false, isMicEnabled = true, isCameraEnabled = true) {
    this._videoElements.set(peerId, {
      video: videoEl,
      name,
      isLocal,
      isSpeaking: false,
      level: 0,
      container: null,
      isMicEnabled,
      isCameraEnabled
    });

    console.log(`[LayoutManager] Registered video: ${name} (${peerId})`);
    this._applyLayout();
  }

  /**
   * Unregister video
   * @param {string} peerId
   */
  unregisterVideo(peerId) {
    this._videoElements.delete(peerId);
    if (this._activeSpeaker === peerId) {
      this._activeSpeaker = null;
    }
    this._applyLayout();
  }

  /**
   * Update speaker status for a video
   * @param {string} peerId
   * @param {boolean} isSpeaking
   * @param {number} level - Audio level 0-100
   */
  updateSpeaker(peerId, isSpeaking, level) {
    const entry = this._videoElements.get(peerId);
    if (!entry) return;

    entry.isSpeaking = isSpeaking;
    entry.level = level;

    // Update active speaker
    if (isSpeaking && this._activeSpeaker !== peerId) {
      this._activeSpeaker = peerId;
      this.dispatchEvent(new CustomEvent('speaker-changed', {
        detail: { peerId, name: entry.name }
      }));
    }

    // Update UI
    this._updateSpeakerIndicators();

    // Auto-switch layout if in speaker mode
    if (this._currentLayout === 'speaker') {
      this._applyLayout();
    }
  }

  /**
   * Set layout mode
   * @param {string} mode - 'speaker', 'gallery', or 'focus'
   */
  setLayout(mode) {
    if (['speaker', 'gallery', 'focus'].includes(mode)) {
      this._currentLayout = mode;
      this._applyLayout();
      this.dispatchEvent(new CustomEvent('layout-changed', {
        detail: { mode }
      }));
    }
  }

  /**
   * Get current layout
   * @returns {string}
   */
  getLayout() {
    return this._currentLayout;
  }

  /**
   * Apply the current layout
   * @private
   */
  _applyLayout() {
    // Remove only layout wrapper divs (layout-speaker, layout-gallery, layout-focus)
    // Don't use innerHTML = '' because that destroys the video elements we reuse
    const existingLayouts = this._container.querySelectorAll('.layout-speaker, .layout-gallery, .layout-focus');
    existingLayouts.forEach(el => el.remove());

    switch (this._currentLayout) {
      case 'speaker':
        this._applySpeakerLayout();
        break;
      case 'gallery':
        this._applyGalleryLayout();
        break;
      case 'focus':
        this._applyFocusLayout();
        break;
    }
  }

  /**
   * Speaker view - Active speaker large, others small in bottom
   * @private
   */
  _applySpeakerLayout() {
    const mainDiv = document.createElement('div');
    mainDiv.className = 'layout-speaker';
    mainDiv.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: #000;
    `;

    // Main speaker area (fills remaining space)
    const mainArea = document.createElement('div');
    mainArea.className = 'layout-main-speaker';
    mainArea.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0f1e;
      position: relative;
      overflow: hidden;
    `;

    // Thumbnails area (110px strip)
    const thumbnailsArea = document.createElement('div');
    thumbnailsArea.className = 'layout-thumbnails';
    thumbnailsArea.style.cssText = `
      height: 110px;
      background: rgba(0,0,0,0.6);
      display: flex;
      gap: 6px;
      padding: 6px;
      overflow-x: auto;
      border-top: 1px solid #1e293b;
      flex-shrink: 0;
    `;

    // Find active speaker or use first video
    const speakerId = this._activeSpeaker || Array.from(this._videoElements.keys())[0];
    let mainVideoPlaced = false;

    // Place videos
    for (const [peerId, entry] of this._videoElements.entries()) {
      const wrapper = this._createVideoWrapper(peerId, entry);

      if (peerId === speakerId && !mainVideoPlaced) {
        // Main speaker - use inset shadow instead of border
        wrapper.style.cssText = `
          width: 100%;
          height: 100%;
          box-shadow: inset 0 0 0 3px #e94560;
          border-radius: 0;
        `;
        mainArea.appendChild(wrapper);
        mainVideoPlaced = true;
      } else {
        // Thumbnail - 16:9 aspect ratio
        wrapper.style.cssText = `
          height: 96px;
          aspect-ratio: 16 / 9;
          flex-shrink: 0;
          border-radius: 6px;
          cursor: pointer;
          border: 2px solid ${entry.isSpeaking ? '#e94560' : 'transparent'};
          transition: border-color 0.3s;
          overflow: hidden;
          background: #111;
        `;

        // Click thumbnail to switch speaker
        wrapper.addEventListener('click', () => {
          this._activeSpeaker = peerId;
          this._applyLayout();
        });

        thumbnailsArea.appendChild(wrapper);
      }
    }

    mainDiv.appendChild(mainArea);
    mainDiv.appendChild(thumbnailsArea);
    this._container.appendChild(mainDiv);
  }

  /**
   * Gallery view - All videos in grid
   * @private
   */
  _applyGalleryLayout() {
    const count = this._videoElements.size;
    // Dynamic grid: 1 person = 1 col, 2 people = 2 cols, 3-4 = 2 cols, 5+ = 3 cols
    const cols = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / cols);

    const gridDiv = document.createElement('div');
    gridDiv.className = 'layout-gallery';
    gridDiv.style.cssText = `
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-columns: repeat(${cols}, 1fr);
      grid-template-rows: repeat(${rows}, 1fr);
      gap: 8px;
      padding: 8px;
      background: #0a0f1e;
      overflow: hidden;
    `;

    for (const [peerId, entry] of this._videoElements.entries()) {
      const wrapper = this._createVideoWrapper(peerId, entry);
      wrapper.style.cssText = `
        border-radius: 10px;
        overflow: hidden;
        background: #111;
        border: 2px solid ${entry.isSpeaking ? '#e94560' : 'transparent'};
        transition: border-color 0.3s;
      `;

      gridDiv.appendChild(wrapper);
    }

    this._container.appendChild(gridDiv);
  }

  /**
   * Focus view - One large, others as small sidebar
   * @private
   */
  _applyFocusLayout() {
    const focusDiv = document.createElement('div');
    focusDiv.className = 'layout-focus';
    focusDiv.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      background: #0a0f1e;
      gap: 6px;
      padding: 8px;
    `;

    // Main video (flex: 3)
    const mainSection = document.createElement('div');
    mainSection.style.cssText = `
      flex: 3;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
      border-radius: 10px;
      border: 2px solid #e94560;
      overflow: hidden;
    `;

    // Sidebar (flex: 1)
    const sidebar = document.createElement('div');
    sidebar.style.cssText = `
      flex: 1;
      min-width: 0;
      max-width: 200px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow-y: auto;
    `;

    let mainPlaced = false;
    for (const [peerId, entry] of this._videoElements.entries()) {
      const wrapper = this._createVideoWrapper(peerId, entry);

      if (!mainPlaced && entry.isSpeaking) {
        wrapper.style.cssText = `width: 100%; height: 100%;`;
        mainSection.appendChild(wrapper);
        mainPlaced = true;
      } else if (!mainPlaced) {
        wrapper.style.cssText = `width: 100%; height: 100%;`;
        mainSection.appendChild(wrapper);
        mainPlaced = true;
      } else {
        // Sidebar items: 16:9 aspect ratio
        wrapper.style.cssText = `
          width: 100%;
          aspect-ratio: 16 / 9;
          flex-shrink: 0;
          border-radius: 8px;
          border: 2px solid ${entry.isSpeaking ? '#e94560' : 'transparent'};
          overflow: hidden;
          background: #111;
        `;
        sidebar.appendChild(wrapper);
      }
    }

    focusDiv.appendChild(mainSection);
    focusDiv.appendChild(sidebar);
    this._container.appendChild(focusDiv);
  }

  /**
   * Create video wrapper with speaker indicator
   * @private
   */
  _createVideoWrapper(peerId, entry) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.style.cssText = `
      position: relative;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Video element
    entry.video.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;
    wrapper.appendChild(entry.video);

    // Speaker indicator bar (flush with bottom edge as audio level indicator)
    const speakerBar = document.createElement('div');
    speakerBar.className = 'speaker-indicator';
    speakerBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(0,0,0,0.3);
      overflow: hidden;
    `;

    const levelBar = document.createElement('div');
    levelBar.className = 'speaker-level';
    levelBar.style.cssText = `
      height: 100%;
      background: ${entry.isSpeaking ? '#e94560' : '#10b981'};
      width: 0%;
      transition: width 0.05s linear, background 0.2s;
    `;
    speakerBar.appendChild(levelBar);

    // Status indicator - positioned at TOP LEFT for maximum visibility
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'status-indicator';
    statusIndicator.style.cssText = `
      position: absolute;
      top: 12px;
      left: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    `;

    // Create mic status icon with large background
    // Shows 🎙️ (microphone on) when mic is enabled - GREEN
    // Shows 🔇 (muted/mic off) when mic is disabled - RED
    const iconSpan = document.createElement('span');
    const isMicOn = entry.isMicEnabled;
    iconSpan.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: ${isMicOn ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)'};
      font-size: 24px;
      box-shadow: 0 0 12px ${isMicOn ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'};
      border: 2px solid rgba(255,255,255,0.3);
    `;
    iconSpan.textContent = isMicOn ? '🎙️' : '🔇';

    statusIndicator.appendChild(iconSpan);
    // Don't append yet - will be added in correct order at the end

    // Name label - positioned at TOP RIGHT (below status icon, doesn't overlap or take video space)
    const nameLabel = document.createElement('div');
    nameLabel.className = 'video-name-label';
    nameLabel.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      left: auto;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.2);
      max-width: 180px;
      max-height: 24px;
      line-height: 1.2;
      z-index: 10;
    `;

    // Name text only (icon moved to top left)
    const nameText = document.createElement('span');
    nameText.textContent = entry.name;
    nameLabel.appendChild(nameText);

    // Store references for updates
    entry.levelBar = levelBar;
    entry.wrapper = wrapper;

    // Append in correct order (z-index handled by CSS):
    // 1. Speaker bar (bottom, behind everything except video)
    wrapper.appendChild(speakerBar);
    // 2. Name label (bottom, visible)
    wrapper.appendChild(nameLabel);
    // 3. Status indicator (top left, z-index: 10, on top of everything)
    wrapper.appendChild(statusIndicator);

    return wrapper;
  }

  /**
   * Update speaker indicators
   * @private
   */
  _updateSpeakerIndicators() {
    for (const [peerId, entry] of this._videoElements.entries()) {
      // Update level bar if it exists
      if (entry.levelBar) {
        entry.levelBar.style.width = entry.level + '%';
        entry.levelBar.style.background = entry.isSpeaking ? '#e94560' : '#10b981';
      }

      // Find ALL status indicators in the current DOM (not just the stored wrapper)
      // This handles the case where layouts are recreated
      const allStatusIndicators = this._container.querySelectorAll('.status-indicator');
      allStatusIndicators.forEach(statusIndicator => {
        // Check if this indicator belongs to this video by looking at the video element
        const videoInWrapper = statusIndicator.closest('.video-wrapper')?.querySelector('video');
        if (videoInWrapper === entry.video) {
          const iconSpan = statusIndicator.querySelector('span');
          if (iconSpan) {
            // Show mic enabled/disabled status, not speaking status
            // 🎙️ (green) = mic enabled/on
            // 🔇 (red) = mic disabled/off
            const isMicOn = entry.isMicEnabled;
            iconSpan.textContent = isMicOn ? '🎙️' : '🔇';
            iconSpan.style.background = isMicOn ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';
            iconSpan.style.boxShadow = isMicOn ? '0 0 8px rgba(16, 185, 129, 0.5)' : '0 0 8px rgba(239, 68, 68, 0.5)';
          }
        }
      });
    }
  }

  /**
   * Update mic/camera enabled state for a video
   * @param {string} peerId
   * @param {boolean} isMicEnabled
   * @param {boolean} isCameraEnabled
   */
  updateMediaState(peerId, isMicEnabled, isCameraEnabled) {
    const entry = this._videoElements.get(peerId);
    if (!entry) return;

    entry.isMicEnabled = isMicEnabled;
    entry.isCameraEnabled = isCameraEnabled;

    // Update the icon display
    this._updateSpeakerIndicators();
  }
}
