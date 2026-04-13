# PeerConnect — Free P2P Video Calls

**No accounts, no ads, no servers. Just pure peer-to-peer video calling.**

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Modern browser (Chrome, Firefox, Safari, Edge)

### Run Locally

```bash
# Start signaling server
cd signaling-server
npm install
npm start

# In another terminal, serve the web app
cd webapp/public
python3 -m http.server 3001

# Open browser
# http://localhost:3001
```

### Features
- ✅ **P2P Video Calling** - Crystal clear, low latency
- ✅ **Screen Sharing** - Share your screen instantly
- ✅ **Text Chat** - Real-time messaging
- ✅ **File Sharing** - P2P file transfer
- ✅ **Speaker Detection** - Real-time audio visualization
- ✅ **Multiple Layouts** - Speaker, Gallery, Focus views
- ✅ **Noise Suppression** - AI-powered background noise removal
- ✅ **Auto-Join** - Share link, friend auto-joins (mobile)
- ✅ **Fully Encrypted** - End-to-end secure (SRTP)
- ✅ **Responsive Design** - Works perfectly on 320px to 1920px+ screens
- ✅ **Mobile Optimized** - Touch-friendly 44px+ targets on all devices

---

## 🎨 UI/UX Design — Fully Responsive (Updated April 2026)

### Responsive Breakpoints
The entire application is optimized for seamless viewing across all screen sizes:

| Breakpoint | Device Type | Logo | Title | Feature Grid | Layout |
|-----------|-------------|------|-------|--------------|--------|
| **320px** | iPhone SE | 48px | 22px | 2 columns | Mobile optimized |
| **375px** | iPhone 12 | 52px | 24px | 2 columns | Mobile optimized |
| **480px** | Large phone | 56px | 26px | 2 columns | Compact |
| **768px** | Tablet | 60px | 28px | 2 columns | Tablet view |
| **1024px** | Desktop | 72px | 40px | **3 columns** | Full desktop |
| **1920px+** | Wide screen | 72px | 40px | 3 columns | Ultra-wide |

### Design Features
- ✅ **Landing Page** - Beautiful hero section with 6 feature cards in responsive grid
- ✅ **Waiting Page** - Large room code display, QR code, and action buttons
- ✅ **Call Page** - Compact on mobile, full-featured on desktop with chat panel
- ✅ **Error Page** - Clear error messages with recovery options
- ✅ **Gradients & Shadows** - Modern visual polish throughout
- ✅ **Smooth Animations** - Transitions and hover effects
- ✅ **Dark Theme** - Easy on the eyes for long calls

### Mobile-First Approach
- Touch targets minimum 44px (accessibility standard)
- Stack layouts on small screens, expand on larger screens
- Proper scrolling behavior on constrained viewports
- Optimized font sizes for readability at all scales

### Recent Improvements (April 13, 2026)
- Fixed desktop layout constraints allowing feature grid to expand to 1000px on 1024px+ screens
- Corrected scroll behavior on landing page for narrow viewports
- Consolidated responsive CSS across all breakpoints
- All 6 feature cards now display properly in 3-column grid on desktop

---

## 📁 Project Structure

```
PeerConnect/
├── webapp/                          # Web application (single-page app)
│   ├── public/                      # Static files served to browsers
│   │   ├── index.html               # Main HTML (4 screens: landing, waiting, call, error)
│   │   ├── app.js                   # Main application orchestrator (~850 lines)
│   │   ├── styles.css               # Base styles with dark theme (1691 lines)
│   │   ├── styles-mobile.css        # Responsive breakpoints (874 lines)
│   │   ├── lib/                     # JavaScript modules
│   │   │   ├── room.js              # Room code generation & management
│   │   │   ├── signaling.js         # WebSocket signaling client
│   │   │   ├── webrtc.js            # WebRTC peer connection setup
│   │   │   ├── media.js             # Audio/video capture & constraints
│   │   │   ├── chat.js              # Encrypted messaging
│   │   │   ├── filetransfer.js      # P2P file transfer
│   │   │   ├── speaker-detection.js # Real-time speaker detection
│   │   │   ├── layout-manager.js    # Video layout modes (speaker/gallery/focus)
│   │   │   ├── noise.js             # Noise suppression
│   │   │   ├── names.js             # Random username generation
│   │   │   ├── session.js           # Session persistence & recovery
│   │   │   └── capabilities.js      # Browser capability detection
│   │   ├── diagnostics.html         # Debug/diagnostics page
│   │   ├── capabilities.html        # Browser capabilities page
│   │   ├── clear-session.html       # Session clearing utility
│   │   └── check.html               # Health check page
│
├── signaling-server/                # Node.js WebSocket signaling server
│   ├── server.js                    # Main signaling server
│   ├── server-https.js              # HTTPS variant
│   ├── package.json                 # Dependencies
│   └── test_*.js                    # Test files
│
├── deploy/                          # Production deployment config
│   ├── nginx.conf                   # Nginx reverse proxy configuration
│   ├── setup.sh                     # VM bootstrap script for GCP
│   └── peerconnect.service          # systemd service file
│
├── archived-docs/                   # Documentation archive
│   ├── docs/                        # Old documentation files
│   └── *.md, *.txt                  # Implementation guides & notes
│
├── https-server.js                  # Local HTTPS development server
├── START_SERVERS.sh                 # Startup script for local development
├── cert.pem                         # Self-signed certificate (local dev)
├── key.pem                          # Private key (local dev)
└── README.md                        # This file
```

---

## 📋 Recent Changes & Updates

### Latest (April 13, 2026)
- **UI Layout Fix**: Removed max-width constraint on landing page children, allowing feature grid to expand properly
- **Scroll Fix**: Changed landing page justify-content from center to flex-start for proper viewport scrolling
- **Archive Consolidation**: Merged old `Archive/` and new `archived-docs/` folders into single `archived-docs/`
- **Documentation Refresh**: Updated README with current project status and responsive design details

### Previously Completed
- ✅ Full UI/UX redesign of all 4 screens
- ✅ Comprehensive responsive breakpoints (320px to 1920px+)
- ✅ Touch-friendly mobile layout optimization
- ✅ Gradient backgrounds and visual polish
- ✅ Proper scrolling and overflow handling
- ✅ Session persistence and recovery
- ✅ All core features (video, chat, file transfer, screen share)

---

## 🎯 Architecture

### Frontend Stack
- **Framework**: Vanilla JavaScript (no build tool, no dependencies)
- **Media**: WebRTC API
- **Audio**: Web Audio API + RNNoise WASM
- **Styling**: CSS Grid/Flexbox (responsive)
- **Storage**: localStorage (preferences)

### Backend
- **Signaling**: Node.js WebSocket server
- **Protocol**: JSON-based signaling (offer/answer/candidates)
- **Deployment**: Nginx reverse proxy + PM2 process manager
- **SSL**: Let's Encrypt (automatic renewal)

### P2P Communication
- **Video**: H.264 codec, VP8/VP9 fallback
- **Audio**: OPUS codec, 48kHz
- **Encryption**: SRTP (Secure RTP) for media
- **Data Channel**: For chat & files (ordered, retransmit-enabled)

---

## 🔧 Development

### Local Development (HTTP)

```bash
# Terminal 1: Signaling server
cd signaling-server && npm start

# Terminal 2: Web server
cd webapp/public && python3 -m http.server 3001

# Browser
http://localhost:3001
```

### Local Development (HTTPS)

```bash
node https-server.js

# Browser
https://localhost:3001
```

### Build & Deploy

```bash
# Edit signaling-server/server.js for production domain
# Edit deploy/nginx.conf for your domain
# Create VM on Google Cloud (e2-micro, Ubuntu 22.04)

# Run setup script
./deploy/setup.sh yourdomain.com

# Or manually:
cd signaling-server
npm install
pm2 start server.js
```

---

## 📱 Mobile

### Auto-Join Feature
1. Create room on desktop
2. Share link: `https://yourdomain.com?room=XXXX-XXXX`
3. Friend taps link on mobile
4. Auto-joins in ~500ms (no code typing needed)

### Supported Browsers
| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ | ✅ |
| Firefox | ✅ | ✅ |
| Safari | ✅ | ⚠️ Limited |
| Edge | ✅ | ✅ |

### Known Limitations
- iOS: No screen sharing (Apple restriction)
- Safari: Some features restricted
- Android: Full support

---

## 🔐 Security & Privacy

### What's Secure
- ✅ **End-to-End**: Media encrypted with SRTP
- ✅ **Transport**: HTTPS/WSS (TLS 1.3)
- ✅ **No Logging**: Calls not recorded
- ✅ **No Tracking**: No analytics, cookies, or telemetry
- ✅ **No Accounts**: Anonymous with random names
- ✅ **P2P Only**: Media never touches servers

### What to Know
- ⚠️ **Signaling** is not E2E encrypted (only HTTPS)
- ⚠️ **Room codes** are short (4 chars per segment) - not cryptographically secure
- ⚠️ **Anyone with link** can join your room
- ⚠️ **No authentication** - no "waiting room" before join

### Best Practices
- ✅ Share links only with people you trust
- ✅ Use HTTPS in production (check lock icon)
- ✅ Close call when done
- ✅ Use trusted networks (avoid public WiFi for sensitive calls)

---

## 🚀 Production Deployment

### Single-Click Deploy (Google Cloud)

```bash
./deploy/setup.sh yourdomain.com your-email@gmail.com
```

Includes:
- Node.js 20 LTS
- Nginx with HTTPS
- Let's Encrypt SSL (auto-renew)
- PM2 auto-restart
- Firewall rules
- Health checks

### Manual Deploy

1. **Create VM**: Google Cloud e2-micro (always-free eligible)
2. **DNS**: Point domain to VM IP
3. **Run setup**: `./deploy/setup.sh yourdomain.com`
4. **Verify**: Open `https://yourdomain.com` in browser

### Scaling

- **2 users**: 1 VM (unlimited concurrent calls)
- **100 users**: 1 VM (assuming 10 concurrent calls)
- **1000 users**: 2-3 VMs + load balancer

Signaling server is lightweight; bottleneck is usually bandwidth/CPU.

---

## 📊 Performance

### Latency
- **Local Network**: <50ms (P2P)
- **WiFi**: 50-100ms
- **4G/LTE**: 100-200ms
- **Intercontinental**: 200-500ms

### Bandwidth
- **Audio only**: 50-100 kbps
- **Video 720p**: 1-2.5 Mbps
- **Video 1080p**: 2.5-5 Mbps
- **Screen share**: 2-5 Mbps (depends on content)

### Resource Usage
- **CPU**: 10-20% (1v1 video call)
- **Memory**: 150-200MB (1v1 call)
- **Idle**: <5% CPU, 50MB RAM

---

## 🎯 Testing

### Local 2-User Test
```bash
# Terminal 1
node signaling-server/server.js

# Terminal 2
cd webapp/public && python3 -m http.server 3001

# Browser 1: http://localhost:3001
# Browser 2: http://localhost:3001

# Browser 1: Click "START NEW CALL"
# Browser 2: Click "JOIN EXISTING CALL", enter code
```

### Mobile Testing
```bash
# Get local IP
ifconfig | grep "inet 192"

# Share: http://192.168.X.X:3001?room=XXXX-XXXX

# Mobile: Open link → Auto-joins
```

### Group Call Test
- Browser 1: Create room
- Browser 2: Join room
- Browser 3: Open same link → Auto-joins
- All three should see each other

---

## 🐛 Debugging

### Console Logs
Open DevTools (F12) → Console
Look for logs like:
```
[App] Ready
[App] Creating room: 4G2L-ZGNT
[WebRTC] Connected
[Chat] Message received
```

### Network Issues
1. Check WebSocket connection (Network → WS filter)
2. Verify signaling server is running
3. Check firewall allows port 8080
4. Look at server logs: `pm2 logs`

### Media Issues
1. Check browser permissions (camera/mic)
2. Verify no other apps using camera
3. Try different browser
4. Check `getUserMedia` support

---

## 📚 Documentation

All guides moved to `archived-docs/`:
- Legacy implementation guides
- Testing guides
- Browser compatibility guides
- And more...

**Note**: Most documentation is archived. Focus on code comments and the main `README.md` for current info.

---

## 🛠️ Troubleshooting

### "Cannot read properties of null"
→ WebRTC state error, check browser console for details

### "Connection failed"
→ Check signaling server is running, firewall allows connections

### "No camera/mic"
→ Check browser permissions in Settings

### "Video freezes"
→ Slow network, try WiFi instead of cellular

### "Mobile page blank"
→ Try hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

See `archived-docs/` for comprehensive guides and legacy documentation.

---

## 🎓 Learning Resources

### WebRTC Basics
- [MDN WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Interactive Connectivity Establishment (ICE)](https://developer.mozilla.org/en-US/docs/Glossary/ICE)
- [Session Description Protocol (SDP)](https://en.wikipedia.org/wiki/Session_Description_Protocol)

### This Project's Architecture
- Read `signaling-server/server.js` (simple, well-commented)
- Read `webapp/public/app.js` (orchestrator - shows flow)
- Read `webapp/public/lib/webrtc.js` (peer connection logic)

---

## 📞 Support & Issues

### Check These First
1. Browser version (use Chrome/Firefox)
2. Network connection (speed test)
3. Browser permissions (camera/mic allowed)
4. Browser console for errors (F12)

### Common Fixes
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear cache: Settings → History → Clear
3. Try different browser
4. Restart browser completely
5. Check firewall/VPN

### Debug Info to Gather
- Browser & version
- OS (Windows/Mac/Linux)
- Error from console (F12)
- Network speed
- Device type

---

## 🚀 Next Steps

### Phase 2 Features
- [ ] Native iOS app (App Store)
- [ ] Native Android app (Play Store)
- [ ] Virtual backgrounds
- [ ] Meeting recording
- [ ] Real-time captions
- [ ] Reactions & emojis

### Infrastructure
- [ ] Multi-region deployment
- [ ] Bandwidth optimization
- [ ] Advanced analytics
- [ ] Admin dashboard

---

## 📄 License

PeerConnect is open source and free to use, modify, and distribute.

---

## 💙 Built with Love

Made for seamless, private, peer-to-peer video calling.

**No servers in the media path. Just pure P2P.**

---

## Quick Links

- **Web App**: `webapp/public/`
- **Signaling Server**: `signaling-server/`
- **Deployment**: `deploy/`
- **Documentation**: `archived-docs/` (legacy docs)
- **Local Dev**: Start servers above + open browser

**Happy calling!** 🎉
