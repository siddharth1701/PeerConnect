/**
 * PeerConnect Web App — Main Orchestration
 * Manages state machine, wires all lib modules, handles UI
 */

import { generateRoomId, generatePeerId, validateRoomId } from './lib/room.js';
import { SignalingClient } from './lib/signaling.js';
import { MediaManager } from './lib/media.js';
import { ChatManager } from './lib/chat.js';
import { WebRTCManager } from './lib/webrtc.js';
import { FileTransfer } from './lib/filetransfer.js';
import { NoiseSuppressor } from './lib/noise.js';
import { getRandomName } from './lib/names.js';
import { SpeakerDetector } from './lib/speaker-detection.js';
import { LayoutManager } from './lib/layout-manager.js';
import { SessionManager } from './lib/session.js';

// ============================================================================
// STATE MACHINE
// ============================================================================

let state = 'idle'; // idle | acquiring-media | waiting | connecting | connected | error

// ============================================================================
// MODULE INSTANCES
// ============================================================================

let sessionManager;
let signalingClient;
let mediaManager;
let chatManager;
let webrtcManager;
let fileTransfer;
let noiseSuppressor;
let speakerDetector;
let layoutManager;

// ============================================================================
// SESSION STATE
// ============================================================================

let localStream = null;
let currentRoomId = null;
let currentPeerId = null;
let currentUsername = null;
let peerUsername = null;
let isInitiator = false;
let isMicEnabled = true;
let isCameraEnabled = true;
let isScreenSharing = false;
let isNoiseEnabled = false;
let isPiPActive = false;
let graceCountdownInterval = null;
let graceTimeoutSeconds = 0;

// Capture URL room code at module load time
const INITIAL_URL_ROOM = new URLSearchParams(location.search).get('room');
let reconnectAttempts = 0;

const RECONNECT_BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000];

// Shared audio context for remote monitoring
let sharedAudioContext = null;

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const screens = {
  landing: document.getElementById('screen-landing'),
  waiting: document.getElementById('screen-waiting'),
  call: document.getElementById('screen-call'),
  error: document.getElementById('screen-error')
};

const landingElements = {
  inputUsername: document.getElementById('input-username'),
  btnCreate: document.getElementById('btn-create-room'),
  btnShowJoin: document.getElementById('btn-show-join'),
  btnBackToLanding: document.getElementById('btn-back-to-landing'),
  joinForm: document.getElementById('landing-join-form'),
  inputRoomId: document.getElementById('input-room-id'),
  btnJoin: document.getElementById('btn-join-room'),
  joinError: document.getElementById('join-error')
};

const waitingElements = {
  codeDisplay: document.getElementById('waiting-room-code'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnJoinNow: document.getElementById('btn-join-now'),
  btnCancel: document.getElementById('btn-cancel-wait'),
  linkDisplay: document.getElementById('waiting-link-display')
};

const callElements = {
  connectionDot: document.getElementById('connection-dot'),
  connectionLabel: document.getElementById('connection-label'),
  peerName: document.getElementById('peer-name'),
  roomBadge: document.getElementById('room-badge'),
  videoRemote: document.getElementById('video-remote'),
  videoLocal: document.getElementById('video-local'),
  btnMic: document.getElementById('btn-toggle-mic'),
  btnCamera: document.getElementById('btn-toggle-camera'),
  btnScreenShare: document.getElementById('btn-screenshare'),
  btnNoise: document.getElementById('btn-noise'),
  btnFileShare: document.getElementById('btn-file-share'),
  btnPiP: document.getElementById('btn-pip'),
  btnToggleChat: document.getElementById('btn-toggle-chat'),
  btnHangup: document.getElementById('btn-hangup'),
  chatMessages: document.getElementById('chat-messages'),
  systemMessage: document.getElementById('system-message'),
  typingIndicator: document.getElementById('typing-indicator'),
  chatInput: document.getElementById('chat-input'),
  btnSendChat: document.getElementById('btn-send-chat')
};

const errorElements = {
  errorTitle: document.getElementById('error-title'),
  errorMessage: document.getElementById('error-message'),
  btnRetry: document.getElementById('btn-error-retry')
};

const fileInput = document.getElementById('file-input');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnShare = document.getElementById('btn-share');
let isFullscreenActive = false;
let shareUrl = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Get the local network IP address by creating a temporary RTCPeerConnection
 * and checking the local IP from the SDP offer
 */
async function getLocalIpAddress() {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({
      iceServers: []
    });

    pc.createDataChannel('');

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(err => {
        console.warn('[App] Failed to get local IP:', err);
        resolve(null);
      });

    pc.onicecandidate = (ice) => {
      if (!ice || !ice.candidate) return;

      const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
      const ipAddress = ipRegex.exec(ice.candidate.candidate)?.[1];

      if (ipAddress && !ipAddress.startsWith('127.') && ipAddress !== '0.0.0.0') {
        pc.close();
        resolve(ipAddress);
      }
    };

    // Fallback: if no IP found after timeout, resolve with null
    setTimeout(() => {
      if (!pc.localDescription) return;
      pc.close();
      resolve(null);
    }, 1000);
  });
}

/**
 * Build shareable URLs with both localhost and local IP options
 */
async function buildShareUrls(roomId) {
  const localhostUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  let localIpUrl = localhostUrl;
  try {
    const localIp = await getLocalIpAddress();
    if (localIp && window.location.port) {
      // Use the detected local IP with the current port and protocol (http or https)
      const protocol = window.location.protocol; // 'https:' or 'http:'
      localIpUrl = `${protocol}//${localIp}:${window.location.port}${window.location.pathname}?room=${roomId}`;
      console.log('[App] Local IP detected:', localIp, 'with protocol:', protocol);
    } else if (localIp) {
      // Default to port 3001 if no port specified
      const protocol = window.location.protocol;
      localIpUrl = `${protocol}//${localIp}:3001${window.location.pathname}?room=${roomId}`;
      console.log('[App] Local IP detected:', localIp, 'with protocol:', protocol);
    }
  } catch (err) {
    console.warn('[App] Could not detect local IP:', err);
  }

  return { localhostUrl, localIpUrl };
}

/**
 * Format media errors to user-friendly messages
 * Handles different error types: permission denied, not supported, etc.
 */
function formatMediaError(err) {
  console.error('[App] Raw error:', err);
  console.error('[App] Error type:', err?.name);
  console.error('[App] Error message:', err?.message);

  if (!err) {
    return 'Unknown error occurred';
  }

  // Safari HTTPS requirement
  if (err.name === 'SafariHTTPSRequired') {
    const hostname = window.location.hostname;
    return `Safari requires HTTPS for camera access on IP addresses.\n\nTry using: http://localhost:3001\n\nOr enable HTTPS for ${hostname}`;
  }

  // Check for undefined mediaDevices
  if (err.message && err.message.includes('getUserMedia not supported')) {
    return 'Camera/microphone not supported on this device. Try using a desktop browser.';
  }

  if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
    return 'Camera/microphone permission denied. Please allow access in browser settings.';
  }

  if (err.name === 'NotFoundError' || err.message?.includes('no device')) {
    return 'No camera or microphone found. Please connect a camera/mic.';
  }

  if (err.name === 'NotReadableError') {
    return 'Camera/microphone is in use by another app. Please close it and try again.';
  }

  if (err.name === 'AbortError') {
    return 'Camera/microphone access was blocked or aborted.';
  }

  if (err.name === 'SecurityError') {
    return 'Camera/microphone access blocked for security reasons. HTTPS is required in production.';
  }

  // Fallback: show raw error message
  return 'Failed: ' + (err.message || err.toString());
}

async function init() {
  console.log('[App] Initializing PeerConnect web app');

  // Initialize SessionManager for duplicate tab detection and session recovery
  sessionManager = new SessionManager();

  // Listen for duplicate tab detection
  sessionManager.addEventListener('duplicate-tab-found', (event) => {
    showDuplicateTabBanner(event.detail.activeTabId);
  });

  // Try to claim this tab as the active session
  const isClaimedSuccessfully = await sessionManager.claimSession();
  if (!isClaimedSuccessfully) {
    // This is a duplicate tab
    console.log('[App] Duplicate tab detected');
    showDuplicateTabBanner();
    return;
  }

  // Check if we can resume a previous session
  const savedSession = sessionManager.loadSession();
  if (savedSession) {
    console.log('[App] Found saved session, offering resume');
    showResumePrompt(savedSession);
    return;
  }

  // No saved session, start fresh
  continueInit();
}

async function continueInit() {
  console.log('[App] Continuing initialization...');

  mediaManager = new MediaManager();

  // WebSocket protocol selection:
  // - HTTPS pages MUST use wss:// (secure WebSocket)
  // - HTTP pages can use ws:// (unencrypted WebSocket)
  // - Signaling server is unencrypted on :8080, but we use wss:// for HTTPS pages
  let signalingUrl;
  const isSecure = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalhost) {
    // Localhost: use wss:// if HTTPS, ws:// if HTTP
    const protocol = isSecure ? 'wss' : 'ws';
    signalingUrl = protocol + '://localhost:8080/signal';
  } else if (window.location.hostname.startsWith('192.') || window.location.hostname.startsWith('10.') || window.location.hostname.startsWith('172.')) {
    // Local IP address (same network): use wss:// if HTTPS, ws:// if HTTP
    const protocol = isSecure ? 'wss' : 'ws';
    signalingUrl = protocol + '://' + window.location.hostname + ':8080/signal';
  } else {
    // Production domain: use wss:// (Nginx proxies to :8080 with TLS)
    signalingUrl = 'wss://' + window.location.host + '/signal';
  }

  console.log(`[App] ═══════════════════════════════════════════`);
  console.log(`[App] 🔌 Signaling server URL: ${signalingUrl}`);
  console.log(`[App] ═══════════════════════════════════════════`);

  // Assign random Naruto character name
  currentUsername = getRandomName();
  console.log(`[App] ✅ Assigned username: ${currentUsername}`);

  // Display name on landing screen
  const yourNameDisplay = document.getElementById('your-name');
  if (yourNameDisplay) {
    yourNameDisplay.textContent = currentUsername;
    console.log(`[App] ✅ Updated DOM - your-name element`);
  } else {
    console.error(`[App] ❌ Could not find 'your-name' element in DOM`);
  }

  console.log(`[App] 🚀 Initializing managers...`);
  signalingClient = new SignalingClient(signalingUrl);
  console.log(`[App] ✅ SignalingClient created`);

  chatManager = new ChatManager(currentUsername);
  console.log(`[App] ✅ ChatManager created`);

  webrtcManager = new WebRTCManager(signalingClient, chatManager);
  console.log(`[App] ✅ WebRTCManager created`);

  fileTransfer = new FileTransfer();
  console.log(`[App] ✅ FileTransfer created`);

  noiseSuppressor = new NoiseSuppressor();
  console.log(`[App] ✅ NoiseSuppressor created`);

  speakerDetector = new SpeakerDetector();
  console.log(`[App] ✅ SpeakerDetector created`);

  layoutManager = new LayoutManager(document.getElementById('video-container'));
  console.log(`[App] ✅ LayoutManager created`);

  console.log(`[App] 🔗 Setting up event listeners...`);
  setupEventListeners();
  setupSignalingListeners();
  setupWebRTCListeners();
  setupChatListeners();
  setupFileTransferListeners();
  setupLayoutControls();
  setupSpeakerDetectionListeners();
  setupRoomIdAutoFormat();
  setupAutoJoinFromUrl();

  console.log('[App] Ready');
}

// ============================================================================
// EVENT LISTENERS — LANDING SCREEN
// ============================================================================

function setupEventListeners() {
  console.log('[App] Setting up event listeners', {
    btnCreate: !!landingElements.btnCreate,
    btnJoin: !!landingElements.btnJoin,
    btnShowJoin: !!landingElements.btnShowJoin
  });

  if (landingElements.btnCreate) {
    landingElements.btnCreate.addEventListener('click', handleCreateRoom);
  } else {
    console.error('[App] ERROR: btnCreate element not found!');
  }

  landingElements.btnShowJoin.addEventListener('click', () => {
    landingElements.joinForm.classList.toggle('hidden');
    landingElements.inputRoomId.focus();
  });

  if (landingElements.btnBackToLanding) {
    landingElements.btnBackToLanding.addEventListener('click', () => {
      landingElements.joinForm.classList.add('hidden');
      landingElements.inputRoomId.value = '';
      landingElements.joinError.classList.add('hidden');
    });
  }

  if (landingElements.btnJoin) {
    landingElements.btnJoin.addEventListener('click', handleJoinRoom);
  } else {
    console.error('[App] ERROR: btnJoin element not found!');
  }
  landingElements.inputRoomId.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinRoom();
  });

  waitingElements.btnCopyCode.addEventListener('click', handleCopyCode);
  waitingElements.btnCopyLink.addEventListener('click', handleCopyLink);
  waitingElements.btnJoinNow.addEventListener('click', handleJoinNow);
  waitingElements.btnCancel.addEventListener('click', handleCancelWait);

  if (!callElements.btnMic) {
    console.error('[App] ERROR: btnMic not found!');
  } else {
    callElements.btnMic.addEventListener('click', () => {
      console.log('[App] Mic button clicked!');
      console.log('[App] callElements.btnMic element:', callElements.btnMic);
      console.log('[App] Before handleToggleMic - isMicEnabled:', isMicEnabled);
      handleToggleMic();
      console.log('[App] After handleToggleMic - isMicEnabled:', isMicEnabled);
    });
  }

  if (!callElements.btnCamera) {
    console.error('[App] ERROR: btnCamera not found!');
  } else {
    callElements.btnCamera.addEventListener('click', () => {
      console.log('[App] Camera button clicked!');
      console.log('[App] callElements.btnCamera element:', callElements.btnCamera);
      console.log('[App] Before handleToggleCamera - isCameraEnabled:', isCameraEnabled);
      handleToggleCamera();
      console.log('[App] After handleToggleCamera - isCameraEnabled:', isCameraEnabled);
    });
  }
  callElements.btnScreenShare.addEventListener('click', handleScreenShare);
  callElements.btnNoise.addEventListener('click', handleToggleNoise);
  callElements.btnFileShare.addEventListener('click', () => fileInput.click());
  callElements.btnPiP.addEventListener('click', handlePiP);
  callElements.btnToggleChat.addEventListener('click', handleToggleChat);
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', handleFullscreen);
  }
  if (btnShare) {
    btnShare.addEventListener('click', handleShareRoom);
  }
  if (callElements.roomBadge) {
    callElements.roomBadge.addEventListener('click', handleCopyRoomCode);
  }
  callElements.btnHangup.addEventListener('click', handleHangup);

  callElements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) handleSendChat();
  });
  callElements.chatInput.addEventListener('input', () => {
    chatManager.notifyTyping();
  });
  callElements.btnSendChat.addEventListener('click', handleSendChat);

  fileInput.addEventListener('change', handleFileSelected);
  callElements.videoLocal.addEventListener('dragover', (e) => e.preventDefault());
  callElements.videoLocal.parentElement?.addEventListener('dragover', (e) => e.preventDefault());
  callElements.videoLocal.parentElement?.addEventListener('drop', handleFileDrop);

  errorElements.btnRetry.addEventListener('click', () => showScreen('landing'));

  // Waiting overlay buttons
  const btnOverlayCopyCode = document.getElementById('btn-overlay-copy-code');
  const btnOverlayCopyLink = document.getElementById('btn-overlay-copy-link');
  const btnOverlayEndCall = document.getElementById('btn-overlay-end-call');

  if (btnOverlayCopyCode) {
    btnOverlayCopyCode.addEventListener('click', () => {
      navigator.clipboard.writeText(currentRoomId).then(() => {
        const orig = btnOverlayCopyCode.textContent;
        btnOverlayCopyCode.textContent = '✓ Copied!';
        setTimeout(() => {
          btnOverlayCopyCode.textContent = orig;
        }, 2000);
      });
    });
  }
  if (btnOverlayCopyLink) {
    btnOverlayCopyLink.addEventListener('click', async () => {
      const { localhostUrl, localIpUrl } = await buildShareUrls(currentRoomId);
      const shareUrl = localhostUrl === localIpUrl ? localhostUrl : localIpUrl;
      navigator.clipboard.writeText(shareUrl).then(() => {
        const orig = btnOverlayCopyLink.textContent;
        btnOverlayCopyLink.textContent = '✓ Copied!';
        setTimeout(() => {
          btnOverlayCopyLink.textContent = orig;
        }, 2000);
      });
    });
  }
  if (btnOverlayEndCall) {
    btnOverlayEndCall.addEventListener('click', () => {
      console.log('[App] User ended waiting, hanging up');
      hangup();
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (state !== 'connected') return;
    if (e.key === 'm' || e.key === 'M') handleToggleMic();
    if (e.key === 'v' || e.key === 'V') handleToggleCamera();
    if (e.key === 's' || e.key === 'S') handleScreenShare();
  });

  // Auto-enable PiP when user leaves tab
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'connected' && !isPiPActive) {
      handlePiP();
    }
  });
}

// ============================================================================
// CREATE ROOM
// ============================================================================

async function handleCreateRoom() {
  console.log('[App] ★ handleCreateRoom() called ★');
  console.log('[App] Username:', currentUsername);
  landingElements.joinError?.classList.add('hidden');

  try {
    state = 'acquiring-media';
    landingElements.btnCreate.disabled = true;

    // Try to get media FIRST before connecting to signaling
    let localStream_temp = null;
    try {
      localStream_temp = await mediaManager.getCameraStream();
    } catch (mediaErr) {
      console.error('[App] Media acquisition failed:', mediaErr);
      state = 'error';
      const errorMsg = formatMediaError(mediaErr);
      showError(errorMsg);
      return;
    }

    localStream = localStream_temp;
    callElements.videoLocal.srcObject = localStream;

    currentRoomId = generateRoomId();
    currentPeerId = generatePeerId();
    // NOTE: isInitiator will be set by 'room-created' event from signaling server
    console.log('[App] Room ID generated:', currentRoomId);

    console.log('[App] Connecting to room:', currentRoomId, 'as', currentUsername);
    try {
      await signalingClient.connect(currentRoomId, currentPeerId, currentUsername);
    } catch (signalingErr) {
      console.error('[App] Signaling connection failed:', signalingErr);
      state = 'error';
      // For signaling errors, show the raw message as it's more informative
      showError(signalingErr.message || 'Failed to connect to signaling server');
      return;
    }

    // Go directly to call screen (Zoom-style waiting room via overlay)
    state = 'connecting';
    showScreen('call');
    updateConnectionStatus('connecting', 'Waiting for others to join...');

    // Show system message for creator
    addSystemMessage('⏳ Waiting for guest to join...', 'info');

    // Build share URLs (localhost + local IP options)
    const shareUrls = await buildShareUrls(currentRoomId);
    const { localhostUrl, localIpUrl } = shareUrls;

    // Store share URL for share button
    shareUrl = localhostUrl === localIpUrl ? localhostUrl : localIpUrl;

    // Show waiting overlay with room code and URLs object
    showWaitingOverlay(currentRoomId, shareUrls);

    // Use localhost URL for QR code in overlay
    try {
      generateQRCodeInOverlay(localhostUrl);
    } catch (err) {
      console.warn('[App] QR code generation failed:', err.message);
    }

    // Initialize button visual states
    initializeButtonStates();

  } catch (err) {
    console.error('[App] Create room failed (unexpected):', err);
    state = 'error';
    showError('Unexpected error: ' + (err.message || err.toString()));
  } finally {
    landingElements.btnCreate.disabled = false;
  }
}

// ============================================================================
// JOIN ROOM
// ============================================================================

async function handleJoinRoom() {
  console.log('[App] ★ handleJoinRoom() called ★');

  // Safeguard: check if DOM elements exist (important for auto-join on mobile)
  if (!landingElements.inputRoomId || !landingElements.joinError) {
    console.error('[App] ERROR: DOM elements not ready for join room');
    // Retry after a bit longer delay
    setTimeout(() => handleJoinRoom(), 200);
    return;
  }

  const roomCode = landingElements.inputRoomId.value.toUpperCase().trim();
  console.log('[App] Username:', currentUsername);

  if (!validateRoomId(roomCode)) {
    landingElements.joinError.textContent = 'Invalid room code format. Use XXXX-XXXX';
    landingElements.joinError.classList.remove('hidden');
    return;
  }

  try {
    state = 'acquiring-media';
    landingElements.btnJoin.disabled = true;

    // Try to get media FIRST before connecting to signaling
    // This way permission errors show up immediately
    let localStream_temp = null;
    try {
      localStream_temp = await mediaManager.getCameraStream();
    } catch (mediaErr) {
      console.error('[App] Media acquisition failed:', mediaErr);
      state = 'error';
      const errorMsg = formatMediaError(mediaErr);
      showError(errorMsg);
      return;
    }

    localStream = localStream_temp;
    callElements.videoLocal.srcObject = localStream;

    const previousRoomId = currentRoomId;
    currentRoomId = roomCode;
    currentPeerId = generatePeerId();
    // NOTE: isInitiator will be set by 'room-joined' event from signaling server
    console.log('[App] Joining room:', currentRoomId);

    // If we're in a different room already (e.g., from "Join Now" flow),
    // close the old connection and clean up before joining new room
    if (previousRoomId && previousRoomId !== roomCode) {
      console.log('[App] Leaving previous room', previousRoomId);
      if (signalingClient.ws && signalingClient.ws.readyState === WebSocket.OPEN) {
        signalingClient.sendLeave();
      }
      webrtcManager.close();
      // Give cleanup time
      await new Promise(r => setTimeout(r, 100));
    }

    try {
      await signalingClient.connect(roomCode, currentPeerId, currentUsername);
    } catch (signalingErr) {
      console.error('[App] Signaling connection failed:', signalingErr);
      state = 'error';
      // For signaling errors, show the raw message as it's more informative
      showError(signalingErr.message || 'Failed to connect to signaling server');
      return;
    }

    state = 'connecting';
    showScreen('call');
    callElements.roomBadge.classList.remove('hidden');
    callElements.roomBadge.textContent = currentRoomId;
    updateConnectionStatus('connecting', 'Connecting...');
    addSystemMessage('⏳ Connecting to host...', 'info');

    // Initialize button visual states
    initializeButtonStates();
  } catch (err) {
    console.error('[App] Join room failed (unexpected):', err);
    state = 'error';
    showError('Unexpected error: ' + (err.message || err.toString()));
  } finally {
    landingElements.btnJoin.disabled = false;
  }
}

// ============================================================================
// WAITING SCREEN HANDLERS
// ============================================================================

function handleCopyCode() {
  navigator.clipboard.writeText(currentRoomId).then(() => {
    const orig = waitingElements.btnCopyCode.textContent;
    waitingElements.btnCopyCode.textContent = '✓ Copied!';
    setTimeout(() => {
      waitingElements.btnCopyCode.textContent = orig;
    }, 2000);
  });
}

async function handleCopyLink() {
  const { localhostUrl, localIpUrl } = await buildShareUrls(currentRoomId);

  // Copy the most appropriate URL for the current context
  const shareUrl = localhostUrl === localIpUrl ? localhostUrl : localIpUrl;

  navigator.clipboard.writeText(shareUrl).then(() => {
    const orig = waitingElements.btnCopyLink.textContent;
    waitingElements.btnCopyLink.textContent = '✓ Copied!';
    setTimeout(() => {
      waitingElements.btnCopyLink.textContent = orig;
    }, 2000);
  });
}

function handleCancelWait() {
  signalingClient.sendLeave();
  mediaManager.stopCameraStream();
  reset();
}

function handleJoinNow() {
  // Stop the media stream from the waiting screen
  // (we'll get a new one when they click Join as the second peer)
  mediaManager.stopCameraStream();

  // Pre-fill the room code in the join input and show landing screen
  landingElements.inputRoomId.value = currentRoomId;
  showScreen('landing');
  landingElements.joinForm.classList.remove('hidden');
  landingElements.inputRoomId.focus();
}

// ============================================================================
// SIGNALING LISTENERS
// ============================================================================

function setupSignalingListeners() {
  signalingClient.addEventListener('room-created', (event) => {
    // Server says: YOU created the room, so YOU are the initiator
    isInitiator = true;
    console.log('[App] ★ room-created → isInitiator = TRUE ★');

    // Save session for recovery
    sessionManager.saveSession({
      roomId: currentRoomId,
      peerId: currentPeerId,
      username: currentUsername,
      reconnectToken: event.detail?.reconnectToken,
      isInitiator: true
    });
  });

  signalingClient.addEventListener('room-joined', async (event) => {
    // Server says: Room already existed, so YOU are joining (NOT initiator)
    isInitiator = false;
    console.log('[App] ★ room-joined → isInitiator = FALSE ★');

    // Save session for recovery
    sessionManager.saveSession({
      roomId: currentRoomId,
      peerId: currentPeerId,
      username: currentUsername,
      reconnectToken: event.detail?.reconnectToken,
      isInitiator: false
    });

    // Room badge already shown in handleJoinRoom, just update status
    updateConnectionStatus('connecting', 'Waiting for peer to start call...');
  });

  signalingClient.addEventListener('peer-joined', async (event) => {
    peerUsername = event.detail?.username || 'Peer';
    console.log('[App] Peer joined room', { isInitiator, peerUsername });

    // Hide the waiting overlay now that a peer has joined
    hideWaitingOverlay();

    // Show share button so user can invite more people
    if (btnShare && shareUrl) {
      btnShare.classList.remove('hidden');
    }

    addSystemMessage('✅ ' + peerUsername + ' joined the call', 'success');

    if (isInitiator) {
      console.log('[App] I am initiator, starting WebRTC negotiation');
      if (!localStream) {
        console.error('[App] ERROR: No local stream! Cannot initiate WebRTC');
        showError('Media stream not available');
        return;
      }
      updateConnectionStatus('connecting', 'Starting call...');
      // Give a tiny delay to ensure peer is ready
      await new Promise(r => setTimeout(r, 200));
      try {
        console.log('[App] Calling webrtcManager.initiate()...');
        await webrtcManager.initiate(currentRoomId, localStream);

        // Wire file transfer data channel (initiator creates it)
        const pc = webrtcManager.getPeerConnection();
        if (pc) {
          fileTransfer.createDataChannel(pc);
          console.log('[App] File transfer data channel created by initiator');
        }

        console.log('[App] WebRTC initiate completed, waiting for connection...');
      } catch (err) {
        console.error('[App] Failed to initiate WebRTC:', err);
        showError('Failed to start call: ' + err.message);
      }
    } else {
      console.log('[App] I am NOT initiator, waiting for offer from peer');

      // Listen for data channel from initiator
      const pc = webrtcManager.getPeerConnection();
      if (pc) {
        fileTransfer.listenForChannel(pc);
        console.log('[App] File transfer channel listener attached');
      }
    }
  });

  signalingClient.addEventListener('offer', async (event) => {
    try {
      // Only handle offer if we are NOT the initiator (i.e., we're the callee/joiner)
      if (isInitiator) {
        console.log('[App] Ignoring offer (I am initiator)');
        return;
      }
      console.log('[App] Received offer from peer');
      await webrtcManager.handleOffer(event.detail.sdp, localStream);
      console.log('[App] Offer handled, sending answer...');
    } catch (err) {
      console.error('[App] Failed to handle offer:', err);
      showError('Failed to establish connection: ' + err.message);
    }
  });

  signalingClient.addEventListener('answer', async (event) => {
    try {
      // Only handle answer if we are the initiator (i.e., we're the caller)
      if (!isInitiator) {
        console.log('[App] Ignoring answer (I am NOT initiator)');
        return;
      }
      console.log('[App] Received answer from peer');
      await webrtcManager.handleAnswer(event.detail.sdp);
    } catch (err) {
      console.error('[App] Failed to handle answer:', err);
    }
  });

  signalingClient.addEventListener('ice-candidate', async (event) => {
    try {
      const candidate = new RTCIceCandidate({
        candidate: event.detail.candidate,
        sdpMLineIndex: event.detail.sdpMLineIndex,
        sdpMid: event.detail.sdpMid
      });
      await webrtcManager.addIceCandidate(candidate);
    } catch (err) {
      console.warn('[App] Failed to add ICE candidate:', err.message);
    }
  });

  signalingClient.addEventListener('peer-left', () => {
    console.log('[App] Peer left (old message type)');
    // Legacy message, ignored now. Grace period events handled separately.
  });

  signalingClient.addEventListener('peer-disconnected', (event) => {
    handlePeerDisconnected(event.detail);
  });

  signalingClient.addEventListener('peer-reconnected', (event) => {
    handlePeerReconnected(event.detail);
  });

  signalingClient.addEventListener('room-rejoined', (event) => {
    handleRoomRejoined(event.detail);
  });

  signalingClient.addEventListener('room-not-found', (event) => {
    handleRoomNotFound(event.detail);
  });

  signalingClient.addEventListener('media-state', (event) => {
    const { isMicEnabled, isCameraEnabled } = event.detail;
    console.log('[App] Peer media state changed:', { isMicEnabled, isCameraEnabled });

    // Update the peer's video indicator with their mic/camera state
    if (layoutManager) {
      layoutManager.updateMediaState('peer', isMicEnabled, isCameraEnabled);
    }
  });

  signalingClient.addEventListener('error', (event) => {
    console.error('[App] Signaling error:', event.detail.message);
    showError(event.detail.message);
  });
}

// ============================================================================
// WEBRTC LISTENERS
// ============================================================================

function setupWebRTCListeners() {
  webrtcManager.addEventListener('remote-stream', (event) => {
    console.log('[App] Received remote stream');
    callElements.videoRemote.srcObject = event.detail.stream;
    state = 'connected';
    updateConnectionStatus('connected', 'Connected');
    reconnectAttempts = 0;

    // Show peer name with host/guest label
    if (peerUsername) {
      const peerLabel = isInitiator ? '👤 ' + peerUsername + ' (Guest)' : '👤 ' + peerUsername + ' (Host)';
      callElements.peerName.textContent = peerLabel;
      callElements.peerName.classList.remove('hidden');
    }

    // Register videos with layout manager
    layoutManager.registerVideo('local', callElements.videoLocal, currentUsername || 'You', true, isMicEnabled, isCameraEnabled);
    layoutManager.registerVideo('peer', callElements.videoRemote, peerUsername || 'Peer', false, true, true);

    // Sync button visual state to match actual enabled/disabled state
    callElements.btnMic.setAttribute('data-state', isMicEnabled ? 'on' : 'off');
    callElements.btnMic.classList.toggle('active', isMicEnabled);
    callElements.btnMic.classList.toggle('inactive', !isMicEnabled);

    callElements.btnCamera.setAttribute('data-state', isCameraEnabled ? 'on' : 'off');
    callElements.btnCamera.classList.toggle('active', isCameraEnabled);
    callElements.btnCamera.classList.toggle('inactive', !isCameraEnabled);

    // Show layout controls
    const layoutControls = document.getElementById('layout-controls');
    if (layoutControls) {
      layoutControls.classList.remove('hidden');
    }

    // Initialize speaker detection for local stream
    if (localStream) {
      speakerDetector.init(localStream);
      console.log('[App] Speaker detection initialized for local stream');
    }

    // Initialize speaker detection for remote stream
    const audioTracks = event.detail.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      try {
        // Create audio context once and reuse it
        if (!sharedAudioContext) {
          sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const remoteSource = sharedAudioContext.createMediaStreamAudioSource(event.detail.stream);
        const remoteAnalyser = sharedAudioContext.createAnalyser();
        remoteAnalyser.fftSize = 256;
        remoteSource.connect(remoteAnalyser);

        // Monitor remote audio
        const remoteDataArray = new Uint8Array(remoteAnalyser.frequencyBinCount);
        let remoteSmoothedLevel = 0;
        const monitorRemoteAudio = () => {
          remoteAnalyser.getByteFrequencyData(remoteDataArray);
          let sum = 0;
          for (let i = 0; i < remoteDataArray.length; i++) {
            sum += remoteDataArray[i];
          }
          const average = sum / remoteDataArray.length;
          remoteSmoothedLevel = 0.8 * remoteSmoothedLevel + 0.2 * average;
          const level = Math.min(100, Math.round((remoteSmoothedLevel / 256) * 100));
          const isSpeaking = level > 30;

          layoutManager.updateSpeaker('peer', isSpeaking, level);
          requestAnimationFrame(monitorRemoteAudio);
        };
        monitorRemoteAudio();
        console.log('[App] Remote audio monitoring initialized');
      } catch (err) {
        console.warn('[App] Remote audio monitoring not available (WebAudio may be restricted):', err.message);
      }
    }
  });

  webrtcManager.addEventListener('connection-state-change', (event) => {
    const iceState = event.detail.state;
    console.log('[App] ICE state:', iceState);

    if (iceState === 'connected' || iceState === 'completed') {
      state = 'connected';
      updateConnectionStatus('connected', 'Connected');
      reconnectAttempts = 0;
    } else if (iceState === 'connecting') {
      updateConnectionStatus('connecting', 'Connecting...');
    } else if (iceState === 'failed') {
      handleConnectionFailed();
    } else if (iceState === 'disconnected') {
      updateConnectionStatus('connecting', 'Reconnecting...');
      scheduleReconnect();
    }
  });

  webrtcManager.addEventListener('error', (event) => {
    console.error('[App] WebRTC error:', event.detail.message);
    showError(event.detail.message);
  });
}

// ============================================================================
// AUTO-RECONNECT
// ============================================================================

function scheduleReconnect() {
  if (reconnectAttempts >= RECONNECT_BACKOFF.length) {
    showError('Connection lost. Please check your network and try again.');
    return;
  }

  const delay = RECONNECT_BACKOFF[reconnectAttempts];
  reconnectAttempts++;

  setTimeout(async () => {
    try {
      // Check if signaling WS is alive
      if (!signalingClient.ws || signalingClient.ws.readyState !== WebSocket.OPEN) {
        console.log('[App] Signaling WS is dead, attempting to reconnect signaling...');
        await reconnectSignaling();
      } else {
        console.log('[App] Attempting ICE restart...');
        if (webrtcManager._pc) {
          await webrtcManager._pc.restartIce();
        }
      }
    } catch (err) {
      console.warn('[App] Reconnect attempt failed:', err);
      scheduleReconnect();
    }
  }, delay);
}

function handleConnectionFailed() {
  state = 'error';
  updateConnectionStatus('failed', 'Connection failed');
  showError('Connection failed. Attempting to reconnect...');
  scheduleReconnect();
}

// ============================================================================
// CHAT LISTENERS
// ============================================================================

function setupChatListeners() {
  chatManager.addEventListener('message', (event) => {
    const { text, sender, fromSelf } = event.detail;
    appendChatMessage(text, sender, fromSelf);
  });

  chatManager.addEventListener('peer-typing', () => {
    callElements.typingIndicator.classList.remove('hidden');
  });

  chatManager.addEventListener('peer-typing-stopped', () => {
    callElements.typingIndicator.classList.add('hidden');
  });
}

// ============================================================================
// FILE TRANSFER LISTENERS
// ============================================================================

function setupFileTransferListeners() {
  fileTransfer.addEventListener('send-progress', (event) => {
    console.log('[FileTransfer] Sending:', event.detail);
  });

  fileTransfer.addEventListener('receive-complete', (event) => {
    const { filename, blob } = event.detail;
    console.log('[FileTransfer] Received:', filename);
    fileTransfer.downloadBlob(blob, filename);
  });

  fileTransfer.addEventListener('error', (event) => {
    console.error('[FileTransfer] Error:', event.detail.message);
  });
}

// ============================================================================
// LAYOUT CONTROLS
// ============================================================================

function setupLayoutControls() {
  const layoutControls = document.getElementById('layout-controls');
  const btnSpeaker = document.getElementById('btn-layout-speaker');
  const btnGallery = document.getElementById('btn-layout-gallery');
  const btnFocus = document.getElementById('btn-layout-focus');

  if (btnSpeaker) {
    btnSpeaker.addEventListener('click', () => {
      layoutManager.setLayout('speaker');
      updateLayoutButtons('speaker');
    });
  }

  if (btnGallery) {
    btnGallery.addEventListener('click', () => {
      layoutManager.setLayout('gallery');
      updateLayoutButtons('gallery');
    });
  }

  if (btnFocus) {
    btnFocus.addEventListener('click', () => {
      layoutManager.setLayout('focus');
      updateLayoutButtons('focus');
    });
  }

  layoutManager.addEventListener('layout-changed', (event) => {
    updateLayoutButtons(event.detail.mode);
  });
}

function updateLayoutButtons(mode) {
  const btnSpeaker = document.getElementById('btn-layout-speaker');
  const btnGallery = document.getElementById('btn-layout-gallery');
  const btnFocus = document.getElementById('btn-layout-focus');

  [btnSpeaker, btnGallery, btnFocus].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  if (mode === 'speaker' && btnSpeaker) btnSpeaker.classList.add('active');
  else if (mode === 'gallery' && btnGallery) btnGallery.classList.add('active');
  else if (mode === 'focus' && btnFocus) btnFocus.classList.add('active');
}

// ============================================================================
// SPEAKER DETECTION LISTENERS
// ============================================================================

function setupSpeakerDetectionListeners() {
  speakerDetector.addEventListener('level-update', (event) => {
    const { level, isSpeaking } = event.detail;
    layoutManager.updateSpeaker('local', isSpeaking, level);
  });
}

// ============================================================================
// CALL CONTROLS
// ============================================================================

/**
 * Initialize button visual states based on current enabled/disabled flags
 */
function initializeButtonStates() {
  // Set data attributes for CSS to control icons
  callElements.btnMic.setAttribute('data-state', isMicEnabled ? 'on' : 'off');
  callElements.btnMic.classList.toggle('active', isMicEnabled);
  callElements.btnMic.classList.toggle('inactive', !isMicEnabled);

  callElements.btnCamera.setAttribute('data-state', isCameraEnabled ? 'on' : 'off');
  callElements.btnCamera.classList.toggle('active', isCameraEnabled);
  callElements.btnCamera.classList.toggle('inactive', !isCameraEnabled);

  console.log('[App] Button states initialized - Mic:', isMicEnabled ? 'active' : 'inactive', ', Camera:', isCameraEnabled ? 'active' : 'inactive');
}

function handleToggleMic() {
  isMicEnabled = !isMicEnabled;
  mediaManager.setAudioEnabled(isMicEnabled);

  // Update button visual state
  callElements.btnMic.setAttribute('data-state', isMicEnabled ? 'on' : 'off');
  callElements.btnMic.classList.toggle('active', isMicEnabled);
  callElements.btnMic.classList.toggle('inactive', !isMicEnabled);

  // Update video thumbnail indicator
  if (layoutManager) {
    layoutManager.updateMediaState('local', isMicEnabled, isCameraEnabled);
  }

  // Notify peer of media state change
  if (signalingClient) {
    signalingClient.sendMediaState(isMicEnabled, isCameraEnabled);
  }

  console.log('[App] Mic', isMicEnabled ? 'enabled' : 'disabled');
}

function handleToggleCamera() {
  isCameraEnabled = !isCameraEnabled;
  mediaManager.setVideoEnabled(isCameraEnabled);

  // Update button visual state
  callElements.btnCamera.setAttribute('data-state', isCameraEnabled ? 'on' : 'off');
  callElements.btnCamera.classList.toggle('active', isCameraEnabled);
  callElements.btnCamera.classList.toggle('inactive', !isCameraEnabled);

  // Update video thumbnail indicator
  if (layoutManager) {
    layoutManager.updateMediaState('local', isMicEnabled, isCameraEnabled);
  }

  // Notify peer of media state change
  if (signalingClient) {
    signalingClient.sendMediaState(isMicEnabled, isCameraEnabled);
  }

  console.log('[App] Camera', isCameraEnabled ? 'enabled' : 'disabled');
}

async function handleScreenShare() {
  try {
    if (isScreenSharing) {
      await revertToCamera();
    } else {
      const screenStream = await mediaManager.getScreenStream();
      const screenTrack = screenStream.getVideoTracks()[0];

      if (screenTrack) {
        await webrtcManager.replaceVideoTrack(screenTrack);
        callElements.videoLocal.srcObject = screenStream;
        isScreenSharing = true;
        callElements.btnScreenShare.classList.add('active');

        screenTrack.addEventListener('ended', async () => {
          console.log('[App] Screen share stopped by user');
          await revertToCamera();
        });
      }
    }
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      console.error('[App] Screen share error:', err);
      showError('Failed to share screen');
    }
  }
}

async function revertToCamera() {
  try {
    const cameraTrack = localStream.getVideoTracks()[0];
    if (cameraTrack) {
      await webrtcManager.replaceVideoTrack(cameraTrack);
    }
    mediaManager.stopScreenStream();
    callElements.videoLocal.srcObject = localStream;
    isScreenSharing = false;
    callElements.btnScreenShare.classList.remove('active');
    console.log('[App] Reverted to camera');
  } catch (err) {
    console.error('[App] Failed to revert to camera:', err);
  }
}

async function handleToggleNoise() {
  try {
    isNoiseEnabled = !isNoiseEnabled;
    if (isNoiseEnabled) {
      await noiseSuppressor.init(new (window.AudioContext || window.webkitAudioContext)());
      const processedStream = await noiseSuppressor.process(localStream);
      const audioTrack = processedStream.getAudioTracks()[0];
      if (audioTrack) await webrtcManager.replaceAudioTrack(audioTrack);
    } else {
      const rawAudioTrack = localStream.getAudioTracks()[0];
      if (rawAudioTrack) await webrtcManager.replaceAudioTrack(rawAudioTrack);
      noiseSuppressor.disable();
    }
    callElements.btnNoise.classList.toggle('active', isNoiseEnabled);
    console.log('[App] Noise suppression', isNoiseEnabled ? 'enabled' : 'disabled');
  } catch (err) {
    console.error('[App] Noise suppression error:', err);
  }
}

async function handlePiP() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      isPiPActive = false;
      callElements.btnPiP.classList.remove('active');
      // Re-apply layout after exiting PiP to ensure video is visible again
      console.log('[App] Exited PiP, re-applying layout');
      if (layoutManager) {
        layoutManager._applyLayout();
      }
    } else if (callElements.videoRemote && document.pictureInPictureEnabled) {
      await callElements.videoRemote.requestPictureInPicture();
      isPiPActive = true;
      callElements.btnPiP.classList.add('active');
    } else if (!document.pictureInPictureEnabled) {
      console.warn('[App] Picture-in-Picture not supported in this browser');
    }
  } catch (err) {
    // Silently fail - PiP may not be available in all contexts
    console.debug('[App] PiP not available:', err.message);
  }
}

function handleCopyRoomCode() {
  if (!currentRoomId) {
    console.warn('[App] No room code available');
    return;
  }

  navigator.clipboard.writeText(currentRoomId).then(() => {
    const badge = callElements.roomBadge;
    const original = badge.textContent;
    badge.textContent = '✓ Copied!';
    badge.style.opacity = '0.7';
    setTimeout(() => {
      badge.textContent = original;
      badge.style.opacity = '1';
    }, 2000);
    console.log('[App] Room code copied to clipboard:', currentRoomId);
  }).catch(err => {
    console.error('[App] Failed to copy room code:', err);
    alert('Room Code: ' + currentRoomId);
  });
}

function handleShareRoom() {
  if (!shareUrl) {
    console.warn('[App] No share URL available');
    return;
  }

  // Use Web Share API if available (mobile/modern browsers)
  if (navigator.share) {
    navigator.share({
      title: 'PeerConnect - Join my video call',
      text: 'Click the link below to join my video call on PeerConnect',
      url: shareUrl
    }).catch(err => {
      if (err.name !== 'AbortError') {
        console.warn('[App] Share failed:', err);
        fallbackShare();
      }
    });
  } else {
    fallbackShare();
  }
}

function fallbackShare() {
  // Fallback: copy to clipboard and show toast
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn = btnShare;
    const original = btn.textContent;
    btn.textContent = '✓ Link Copied!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = 'var(--accent)';
    }, 2000);
  }).catch(err => {
    console.error('[App] Copy failed:', err);
    alert('Share URL: ' + shareUrl);
  });
}

function handleToggleChat() {
  const chatPanel = document.querySelector('.call-chat-panel');
  if (chatPanel) {
    chatPanel.classList.toggle('visible');
    callElements.btnToggleChat.classList.toggle('active');
  }
}

async function handleFullscreen() {
  try {
    const videoContainer = document.getElementById('video-container');
    if (!videoContainer) return;

    if (!isFullscreenActive) {
      // Request fullscreen
      if (videoContainer.requestFullscreen) {
        await videoContainer.requestFullscreen();
      } else if (videoContainer.webkitRequestFullscreen) {
        await videoContainer.webkitRequestFullscreen();
      } else if (videoContainer.mozRequestFullScreen) {
        await videoContainer.mozRequestFullScreen();
      } else if (videoContainer.msRequestFullscreen) {
        await videoContainer.msRequestFullscreen();
      }
      isFullscreenActive = true;
      if (btnFullscreen) btnFullscreen.classList.add('active');
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      isFullscreenActive = false;
      if (btnFullscreen) btnFullscreen.classList.remove('active');
    }
  } catch (err) {
    console.error('[App] Fullscreen error:', err);
  }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    isFullscreenActive = false;
    if (btnFullscreen) btnFullscreen.classList.remove('active');
  }
});

function handleHangup() {
  hangup();
}

function hangup() {
  console.log('[App] Hanging up');
  state = 'idle';

  if (currentRoomId) {
    signalingClient.sendLeave();
  }

  // Close PiP if active
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }

  webrtcManager.close();
  mediaManager.stopCameraStream();
  mediaManager.stopScreenStream();
  noiseSuppressor.destroy();

  // Clear grace period countdown if active
  if (graceCountdownInterval) {
    clearInterval(graceCountdownInterval);
    graceCountdownInterval = null;
  }

  localStream = null;
  currentRoomId = null;
  currentPeerId = null;
  isInitiator = false;  // Reset initiator flag
  isScreenSharing = false;
  isNoiseEnabled = false;
  isPiPActive = false;
  reconnectAttempts = 0;
  isMicEnabled = true;  // Reset mic/camera to enabled for next call
  isCameraEnabled = true;

  // Clear session on intentional hangup
  sessionManager.clearSession();
  sessionManager.releaseSession();

  callElements.videoRemote.srcObject = null;
  callElements.videoLocal.srcObject = null;
  callElements.chatMessages.innerHTML = '';
  callElements.chatInput.value = '';

  // Reset button visual states to prevent stale state on next call
  callElements.btnMic.classList.remove('active', 'inactive');
  callElements.btnCamera.classList.remove('active', 'inactive');

  landingElements.inputRoomId.value = '';
  landingElements.joinForm.classList.add('hidden');

  showScreen('landing');
  updateConnectionStatus('idle', 'Ready');
}

// ============================================================================
// CHAT
// ============================================================================

function handleSendChat() {
  const text = callElements.chatInput.value.trim();
  if (!text) return;

  try {
    chatManager.sendMessage(text);
    callElements.chatInput.value = '';
  } catch (err) {
    console.error('[App] Failed to send message:', err);
  }
}

function appendChatMessage(text, sender = 'User', fromSelf = false) {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${fromSelf ? 'self' : 'other'}`;

  const senderEl = document.createElement('div');
  senderEl.className = 'chat-message-sender';
  senderEl.textContent = fromSelf ? currentUsername : sender;

  const textEl = document.createElement('div');
  textEl.className = 'chat-message-text';
  textEl.textContent = text;

  const timeEl = document.createElement('div');
  timeEl.className = 'chat-message-time';
  const now = new Date();
  timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageEl.appendChild(senderEl);
  messageEl.appendChild(textEl);
  messageEl.appendChild(timeEl);

  callElements.chatMessages.appendChild(messageEl);
  callElements.chatMessages.scrollTop = callElements.chatMessages.scrollHeight;
}

// ============================================================================
// FILE TRANSFER
// ============================================================================

function handleFileSelected(e) {
  const file = e.target.files?.[0];
  if (file) {
    fileTransfer.sendFile(file);
  }
  fileInput.value = '';
}

function handleFileDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    if (file.size > 500 * 1024 * 1024) {
      showError('File exceeds 500MB limit');
      return;
    }
    fileTransfer.sendFile(file);
  }
}

// ============================================================================
// WAITING OVERLAY (Zoom-style)
// ============================================================================

function showWaitingOverlay(roomId, shareUrls) {
  const overlay = document.getElementById('waiting-overlay');
  if (!overlay) {
    console.warn('[App] Waiting overlay element not found in DOM');
    return;
  }
  document.getElementById('overlay-room-code').textContent = roomId;
  if (shareUrls) {
    const linkDisplay = document.getElementById('overlay-link-display');
    if (linkDisplay) {
      // Create formatted link display with hyperlinks
      linkDisplay.innerHTML = `
        <div style="font-size: 12px; color: #94a3b8; word-break: break-word;">
          <div style="margin-bottom: 8px;">
            <strong style="color: #cbd5e1;">Localhost:</strong><br>
            <a href="${shareUrls.localhostUrl}" style="color: #e94560; text-decoration: none; word-break: break-all;" target="_blank">${shareUrls.localhostUrl}</a>
          </div>
          <div>
            <strong style="color: #cbd5e1;">Network:</strong><br>
            <a href="${shareUrls.localIpUrl}" style="color: #e94560; text-decoration: none; word-break: break-all;" target="_blank">${shareUrls.localIpUrl}</a>
          </div>
        </div>
      `;
    }
  }
  overlay.classList.remove('hidden');
}

function hideWaitingOverlay() {
  const overlay = document.getElementById('waiting-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

function generateQRCodeInOverlay(url) {
  const qrContainer = document.getElementById('overlay-qr-code');
  if (!qrContainer || typeof QRCode === 'undefined') return;
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: url,
    width: 144,
    height: 144,
    colorDark: '#e94560',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  // Force canvas to exact size
  const canvas = qrContainer.querySelector('canvas');
  if (canvas) {
    canvas.style.width = '144px !important';
    canvas.style.height = '144px !important';
    canvas.style.maxWidth = '144px !important';
    canvas.style.maxHeight = '144px !important';
    canvas.style.display = 'block !important';
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName]?.classList.add('active');
}

function showError(message) {
  errorElements.errorMessage.textContent = message;
  state = 'error';
  showScreen('error');
}

function addSystemMessage(text, type = 'info') {
  // Remove "Waiting for peer..." message on first system message
  const waitingMsg = document.getElementById('system-message');
  if (waitingMsg && waitingMsg.textContent.includes('Waiting')) {
    waitingMsg.remove();
  }

  const messageEl = document.createElement('div');
  const colors = {
    info: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
    success: { bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' }
  };
  const color = colors[type] || colors.info;

  messageEl.style.cssText = `
    padding: 8px;
    background: ${color.bg};
    border: 1px solid ${color.border};
    border-radius: 6px;
    color: ${color.text};
    font-size: 12px;
    text-align: center;
    margin: 4px 0;
  `;
  messageEl.textContent = text;
  callElements.chatMessages.appendChild(messageEl);
  callElements.chatMessages.scrollTop = callElements.chatMessages.scrollHeight;
}

function showPeerDisconnected() {
  state = 'idle';
  updateConnectionStatus('disconnected', 'Peer disconnected');
  addSystemMessage('❌ ' + (peerUsername || 'Peer') + ' disconnected', 'error');
}

function updateConnectionStatus(status, label) {
  callElements.connectionLabel.textContent = label;

  const statusMap = {
    connecting: { class: 'connecting', color: '#f59e0b' },
    connected: { class: 'connected', color: '#10b981' },
    failed: { class: 'failed', color: '#ef4444' },
    disconnected: { class: 'failed', color: '#ef4444' }
  };

  const s = statusMap[status] || { class: 'connecting', color: '#888' };
  callElements.connectionDot.className = `connection-dot ${s.class}`;
}

function setupRoomIdAutoFormat() {
  landingElements.inputRoomId.addEventListener('input', (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
    if (val.length > 4) {
      val = val.slice(0, 4) + '-' + val.slice(4, 8);
    }
    e.target.value = val;
  });
}

async function setupAutoJoinFromUrl() {
  // Only auto-join if room code was in the URL at initial page load
  if (INITIAL_URL_ROOM && validateRoomId(INITIAL_URL_ROOM.toUpperCase())) {
    console.log('[App] Auto-join detected from URL, room:', INITIAL_URL_ROOM);
    console.log('[App] Auto-joining as:', currentUsername);

    // Set the room code and auto-join
    landingElements.inputRoomId.value = INITIAL_URL_ROOM.toUpperCase();

    // Wait longer to ensure DOM is fully ready (especially important on mobile)
    // This allows the page to render completely before attempting to join
    setTimeout(() => {
      console.log('[App] Executing auto-join...');
      handleJoinRoom();
    }, 500); // Increased from 100ms to 500ms for mobile stability
  }
}

function generateQRCode(url) {
  const qrContainer = document.getElementById('qr-code');
  qrContainer.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text: url,
      width: 160,
      height: 160,
      colorDark: '#e94560',
      colorLight: '#0a0f1e'
    });
  }
}

// ============================================================================
// SESSION RECOVERY & GRACE PERIOD HANDLERS
// ============================================================================

async function showResumePrompt(session) {
  // Even though we're showing resume prompt, still update the name display with saved username
  // This ensures the landing screen shows the correct user name
  const yourNameDisplay = document.getElementById('your-name');
  if (yourNameDisplay && session.username) {
    yourNameDisplay.textContent = session.username;
    currentUsername = session.username;
  }

  const modal = document.getElementById('modal-resume-session');
  const roomIdDisplay = document.getElementById('resume-room-id');
  const sessionAge = document.getElementById('resume-session-age');
  const btnYes = document.getElementById('btn-resume-yes');
  const btnNo = document.getElementById('btn-resume-no');

  if (!modal) {
    console.error('[App] resume modal not found');
    continueInit();
    return;
  }

  const ageSeconds = sessionManager.getSessionAge();
  const ageMinutes = Math.floor(ageSeconds / 60);
  roomIdDisplay.textContent = session.roomId;
  sessionAge.textContent = ageMinutes > 0
    ? `Last active ${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`
    : `Last active less than a minute ago`;

  modal.classList.remove('hidden');

  btnYes.onclick = async () => {
    modal.classList.add('hidden');
    await resumeSession(session);
  };

  btnNo.onclick = () => {
    modal.classList.add('hidden');
    sessionManager.clearSession();
    continueInit();
  };
}

async function resumeSession(session) {
  console.log('[App] Resuming session:', {
    roomId: session.roomId,
    peerId: session.peerId.slice(0, 8),
    age: sessionManager.getSessionAge()
  });

  state = 'acquiring-media';
  currentRoomId = session.roomId;
  currentPeerId = session.peerId;
  currentUsername = session.username;

  try {
    // Initialize media
    localStream = await mediaManager.getCameraStream();
    setupSignalingListeners();
    setupWebRTCListeners();
    setupChatListeners();
    setupFileTransferListeners();
    setupLayoutControls();
    setupSpeakerDetectionListeners();

    // Try to rejoin with token
    await signalingClient.connect(currentRoomId, currentPeerId, currentUsername, session.reconnectToken);

    // At this point, room-rejoined or room-not-found will fire
  } catch (err) {
    console.error('[App] Failed to resume session:', err);
    showError('Failed to resume call: ' + err.message);
    sessionManager.clearSession();
    await new Promise(resolve => setTimeout(resolve, 2000));
    window.location.reload();
  }
}

async function reconnectSignaling() {
  const session = sessionManager.loadSession();
  if (!session) {
    console.log('[App] No saved session for signaling reconnect');
    return;
  }

  console.log('[App] Attempting to reconnect to signaling server with token');
  try {
    await signalingClient.connect(currentRoomId, currentPeerId, currentUsername, session.reconnectToken);
  } catch (err) {
    console.error('[App] Signaling reconnect failed:', err);
  }
}

function showDuplicateTabBanner(activeTabId) {
  const banner = document.getElementById('duplicate-tab-banner');
  const btnSwitch = document.getElementById('btn-switch-to-active');

  if (!banner) {
    console.error('[App] duplicate-tab-banner not found');
    return;
  }

  banner.classList.remove('hidden');

  if (btnSwitch) {
    btnSwitch.onclick = () => {
      sessionManager.focusActiveTab();
      setTimeout(() => window.close(), 500);
    };
  }
}

function handlePeerDisconnected(detail) {
  const { username, canReconnect, timeoutSeconds } = detail;

  if (!canReconnect) {
    // Intentional disconnect or room empty
    console.log('[App] Peer left intentionally');
    hangup();
    return;
  }

  // Unexpected disconnect with grace period
  console.log('[App] Peer disconnected, grace period:', timeoutSeconds);
  graceTimeoutSeconds = timeoutSeconds;

  const modal = document.getElementById('modal-peer-disconnected');
  const peerNameDisplay = document.getElementById('disconnected-peer-name');
  const countdownDisplay = document.getElementById('peer-grace-countdown');
  const btnLeave = document.getElementById('btn-leave-after-disconnect');

  if (!modal) {
    console.error('[App] peer-disconnected modal not found');
    return;
  }

  peerNameDisplay.textContent = username;
  modal.classList.remove('hidden');

  // Start countdown timer
  if (graceCountdownInterval) clearInterval(graceCountdownInterval);
  graceCountdownInterval = setInterval(() => {
    graceTimeoutSeconds--;
    const mins = Math.floor(graceTimeoutSeconds / 60);
    const secs = graceTimeoutSeconds % 60;
    countdownDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    if (graceTimeoutSeconds <= 0) {
      clearInterval(graceCountdownInterval);
      graceCountdownInterval = null;
      modal.classList.add('hidden');
      hangup();
    }
  }, 1000);

  btnLeave.onclick = () => {
    modal.classList.add('hidden');
    hangup();
  };
}

function handlePeerReconnected(detail) {
  const { username } = detail;
  console.log('[App] 🔄 handlePeerReconnected called with username:', username);

  const modal = document.getElementById('modal-peer-disconnected');
  console.log('[App] Modal found?', !!modal);
  if (modal) {
    console.log('[App] Hiding peer disconnected modal');
    modal.classList.add('hidden');
  }

  if (graceCountdownInterval) {
    console.log('[App] Clearing grace countdown interval');
    clearInterval(graceCountdownInterval);
    graceCountdownInterval = null;
  }

  // Show toast or brief message
  appendChatMessage(`${username} reconnected`, 'System', false);
  updateConnectionStatus('connecting', 'Peer reconnected, renegotiating...');

  // Reset WebRTC and reinitiate negotiation
  // Both initiator and non-initiator need to reset and start fresh
  console.log('[App] Resetting WebRTC for reconnection (isInitiator:', isInitiator, ')');

  try {
    webrtcManager.reset();

    if (isInitiator) {
      // Initiator sends new offer
      console.log('[App] ✅ Initiator: sending new offer after peer reconnect');
      webrtcManager.initiate(currentRoomId, localStream).catch(err => {
        console.error('[App] ❌ Failed to reinitiate WebRTC:', err);
        handleWebRTCError(err);
      });
    } else {
      // Non-initiator also needs to reset and be ready to receive offer
      console.log('[App] ✅ Non-initiator: reset WebRTC, ready to receive new offer from peer');
      // Just reset - no need to initiate. We'll receive offer from initiator.
      // WebRTCManager will set up ontrack handler when peer connection is created via handleOffer
    }
  } catch (err) {
    console.error('[App] ❌ Error during peer reconnection:', err);
    handleWebRTCError(err);
  }
}

async function handleRoomRejoined(detail) {
  const { reconnectToken, peerId } = detail;
  console.log('[App] 🔄 Room rejoined with new token (cache-clear reconnection)');

  // If we're reconnecting after a cache clear, we might not have isInitiator set
  // The server will send peer-reconnected to the other peer, which will handle renegotiation
  // For now, assume we need to wait for signaling to continue

  // Update peerId if server sent us a specific one (for restored connections)
  if (peerId) {
    currentPeerId = peerId;
    console.log('[App] Using server-assigned peerId:', peerId);
  }

  // Update saved session with new token (preserve existing initiator status if available)
  sessionManager.saveSession({
    roomId: currentRoomId,
    peerId: currentPeerId,
    username: currentUsername,
    reconnectToken,
    isInitiator: isInitiator !== undefined ? isInitiator : false  // Default to false if unknown
  });

  // Go to call screen if not already there
  state = 'connecting';
  showScreen('call');
  callElements.roomBadge.classList.remove('hidden');
  callElements.roomBadge.textContent = currentRoomId;
  updateConnectionStatus('connecting', 'Reconnecting...');

  // The server will notify the other peer via peer-reconnected,
  // which will trigger WebRTC renegotiation
  console.log('[App] Waiting for peer to renegotiate WebRTC connection...');
}

function handleRoomNotFound(detail) {
  console.log('[App] Room not found or session expired');
  const modal = document.getElementById('modal-peer-disconnected');
  if (modal) {
    modal.classList.add('hidden');
  }

  sessionManager.clearSession();
  showError('Call ended: Room no longer available or session expired');

  setTimeout(() => {
    hangup();
  }, 2000);
}

function handleWebRTCError(err) {
  console.error('[App] WebRTC error:', err);
  const message = err.message || 'WebRTC connection failed';
  updateConnectionStatus('failed', 'Connection failed');
  // Don't immediately show error - try to recover
  // Error will be shown if recovery fails
}

function reset() {
  hangup();
  state = 'idle';
}

// ============================================================================
// START
// ============================================================================

document.addEventListener('DOMContentLoaded', init);
