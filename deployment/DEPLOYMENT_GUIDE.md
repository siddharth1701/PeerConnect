# PeerConnect — Deployment Guide

**Last Updated:** April 13, 2026
**Project Type:** Personal P2P Video Calling Application
**Current Status:** Ready for Deployment

---

## 📋 Quick Decision Guide

**Choose your deployment option based on your needs:**

| Option | Cost | Setup Time | Maintenance | Best For |
|--------|------|-----------|-------------|----------|
| **1. Heroku** | $0-50/mo | 5 mins | ⭐⭐ (Low) | Quick hobby projects |
| **2. Railway.app** | $0-20/mo | 5 mins | ⭐⭐ (Low) | Simple deployments |
| **3. Render.com** | Free-$12/mo | 10 mins | ⭐⭐ (Low) | Personal projects |
| **4. Google Cloud** | $5-15/mo | 15 mins | ⭐⭐⭐ (Medium) | More control |
| **5. DigitalOcean** | $5-12/mo | 20 mins | ⭐⭐⭐ (Medium) | VPS control |
| **6. AWS Lightsail** | $3.50-5/mo | 20 mins | ⭐⭐⭐ (Medium) | AWS ecosystem |
| **7. Linode** | $5/mo | 20 mins | ⭐⭐⭐ (Medium) | Straightforward VPS |
| **8. Self-Hosted** | $0 (hardware) | 30+ mins | ⭐⭐⭐⭐ (High) | Full control, learning |

---

## 🎯 RECOMMENDED: Render.com (Best for Personal Projects)

### Why Render.com?
✅ **Free tier available** (with limitations)
✅ **Easiest setup** - Connect GitHub, auto-deploy
✅ **Good performance** for personal use
✅ **Generous free credits** for students/personal projects
✅ **Automatic HTTPS** (free SSL)
✅ **Minimal maintenance**

### Step-by-Step Setup (15 minutes)

#### 1. Prepare Your Project
```bash
# Ensure package.json exists in signaling-server/
cd /Users/siddharthkoduri/Desktop/PeerConnect/signaling-server
cat package.json

# Should contain:
# {
#   "name": "peerconnect-signaling",
#   "version": "1.0.0",
#   "main": "server.js",
#   "scripts": {
#     "start": "node server.js"
#   },
#   "dependencies": {
#     "ws": "^8.0.0",
#     "express": "^4.18.0"
#   }
# }
```

#### 2. Create GitHub Repository
```bash
# Initialize git (if not already done)
cd /Users/siddharthkoduri/Desktop/PeerConnect
git init
git add .
git commit -m "Initial commit: PeerConnect P2P video calling app"

# Create repo on GitHub
# 1. Go to github.com/new
# 2. Name: peerconnect
# 3. Description: Personal P2P video calling app
# 4. Private (recommended for personal projects)
# 5. Create repository

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/peerconnect.git
git branch -M main
git push -u origin main
```

#### 3. Deploy on Render.com
```bash
# 1. Go to render.com
# 2. Sign up with GitHub
# 3. Click "New +" → "Web Service"
# 4. Connect your GitHub account
# 5. Select "peerconnect" repository
# 6. Fill in settings:
#    - Name: peerconnect-signaling (or peerconnect-frontend)
#    - Environment: Node
#    - Build Command: npm install
#    - Start Command: npm start
#    - Plan: Free (starter)
# 7. Click "Deploy"
```

#### 4. Configure Environment (if needed)
```bash
# In Render dashboard:
# 1. Go to Web Service settings
# 2. Add Environment Variables (if using):
#    PORT=10000 (Render assigns this automatically)
# 3. Save and redeploy
```

#### 5. Update Frontend URL
In `webapp/public/lib/signaling.js`, update the signaling server URL:

```javascript
// BEFORE (localhost)
const SIGNALING_SERVER = 'wss://localhost:8080/signal';

// AFTER (Render deployment)
const SIGNALING_SERVER = 'wss://peerconnect-signaling.onrender.com/signal';
```

Redeploy the frontend with your own hosting (see options below).

---

## 🌐 Frontend Hosting Options

Since the frontend is just static files + JavaScript, you have many options:

### Option A: Vercel (Recommended for Frontend)
```bash
# 1. Go to vercel.com
# 2. Import your GitHub repository
# 3. Select "Web App"
# 4. Auto-deploy on push
# 5. Update signaling URL in code
# 6. Done!

# Cost: FREE (generous free tier)
# Performance: ⭐⭐⭐⭐⭐ (CDN worldwide)
```

### Option B: Netlify
```bash
# 1. Go to netlify.com
# 2. Connect GitHub
# 3. Select repository
# 4. Build settings:
#    - Base directory: webapp/public
#    - Build command: (leave empty - static files)
#    - Publish directory: webapp/public
# 5. Deploy

# Cost: FREE
# Performance: ⭐⭐⭐⭐⭐
```

### Option C: GitHub Pages
```bash
# Free but requires build process
# Less suitable for this project (API calls)
# Cost: FREE but limited features
```

---

## 💻 FULL-STACK OPTION: DigitalOcean App Platform (One Server)

### Why DigitalOcean?
✅ **Simple** - One command deploy
✅ **Affordable** - $12/month (includes both frontend + backend)
✅ **Reliable** - Excellent uptime
✅ **Good docs** - Lots of tutorials

### Step-by-Step (20 minutes)

#### 1. Prepare Dockerfile
Create `Dockerfile` in project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies for signaling server
WORKDIR /app/signaling-server
RUN npm install

# Expose port
EXPOSE 8080

# Start signaling server
CMD ["npm", "start"]
```

#### 2. Create docker-compose.yml
Create in project root:

```yaml
version: '3.8'

services:
  signaling:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
    restart: always

  web:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./webapp/public:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - signaling
    restart: always
```

#### 3. Create nginx.conf
```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name _;

        root /usr/share/nginx/html;
        index index.html;

        # Serve static files
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Proxy WebSocket to signaling server
        location /signal {
            proxy_pass http://signaling:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }
    }
}
```

#### 4. Deploy on DigitalOcean
```bash
# 1. Create DigitalOcean account
# 2. Go to App Platform
# 3. Click "Create App"
# 4. Connect GitHub repository
# 5. Select automatic deployment
# 6. DigitalOcean will auto-detect Dockerfile
# 7. Configure:
#    - HTTP port: 80
#    - HTTPS: Auto-enable
# 8. Deploy
```

---

## 🏠 SELF-HOSTED: Your Own Server

### Best For:
- Learning how servers work
- Full control over data
- Running 24/7 cheaply

### Minimum Requirements
- **CPU:** 1 core (2 recommended)
- **RAM:** 512MB (1GB recommended)
- **Storage:** 10GB
- **Bandwidth:** Unlimited
- **OS:** Linux (Ubuntu 20.04+ recommended)

### Step-by-Step Setup

#### 1. Get a Server
**Options:**
- Old laptop/computer running 24/7
- Raspberry Pi ($35-50)
- VPS ($5-15/month)
- AWS Free Tier (if eligible)

#### 2. Install Dependencies
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx

# Check versions
node --version  # v18+
npm --version   # v9+
```

#### 3. Clone Repository
```bash
cd /home/youruser
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect

# Install signaling server dependencies
cd signaling-server
npm install
```

#### 4. Setup Nginx
Create `/etc/nginx/sites-available/peerconnect`:

```nginx
upstream signaling {
    server localhost:8080;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (use Certbot below)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    root /var/www/peerconnect/webapp/public;
    index index.html;

    # Static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket to signaling server
    location /signal {
        proxy_pass http://signaling;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/peerconnect /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 5. Setup SSL/TLS (Free)
```bash
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

#### 6. Setup Process Manager
Use PM2 to keep the signaling server running:

```bash
sudo npm install -g pm2

cd /home/youruser/peerconnect/signaling-server
pm2 start server.js --name "peerconnect-signaling"

# Make it restart on reboot
pm2 startup
pm2 save
```

#### 7. Firewall Setup
```bash
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw status
```

#### 8. Verify It's Running
```bash
# Check signaling server
curl http://localhost:8080

# Check Nginx
curl http://localhost

# Check if website loads
# Visit https://yourdomain.com in browser
```

---

## 📊 Deployment Comparison

### Render.com (RECOMMENDED for your project)
```
✅ Pros:
  - Free tier available
  - GitHub integration (auto-deploy)
  - Built-in SSL/HTTPS
  - Zero maintenance
  - Perfect for hobby projects

❌ Cons:
  - Free tier has limitations
  - Slower than paid tiers
  - Less customization

💰 Cost: Free-$12/month
⏱️ Setup: 5 minutes
🔧 Maintenance: None
```

### DigitalOcean
```
✅ Pros:
  - Affordable ($5-12/month)
  - Full control
  - Excellent documentation
  - Good performance
  - Reliable uptime

❌ Cons:
  - More setup required
  - Need to manage yourself
  - Basic maintenance needed

💰 Cost: $5-12/month
⏱️ Setup: 20 minutes
🔧 Maintenance: Minimal (updates)
```

### Self-Hosted (Raspberry Pi / Old Computer)
```
✅ Pros:
  - Free (hardware only)
  - Full control
  - Learn system administration
  - Keep data on your network

❌ Cons:
  - Requires 24/7 power
  - Internet must be stable
  - Your ISP may limit ports
  - Electricity costs
  - More complex networking

💰 Cost: Free ($0/month) + electricity
⏱️ Setup: 30+ minutes
🔧 Maintenance: Medium (security, updates)
```

---

## 🚀 MY RECOMMENDATION

**For a personal project, I recommend: RENDER.COM**

### Why?
1. **Setup is 5 minutes** - Super fast
2. **Free or very cheap** ($0-12/month)
3. **Auto-deploys from GitHub** - Just push code
4. **Built-in HTTPS** - Secure connection
5. **Zero maintenance** - They handle everything
6. **Perfect for personal use** - Not overkill
7. **Easy to upgrade later** if you need it

### Quick Render Setup (Literally 5 Steps)
```bash
# 1. Create GitHub repo with your code
git push to GitHub

# 2. Go to render.com → Sign up with GitHub

# 3. Click "New Web Service" → Select your repo

# 4. Fill in:
#    - Name: peerconnect-signaling
#    - Start command: npm start
#    - Choose Free plan

# 5. Click Deploy (takes 2-3 minutes)

# Done! Your signaling server is live at:
# https://peerconnect-signaling.onrender.com
```

---

## 🛠️ Step-by-Step: Render + Vercel (Easiest Full Setup)

### Backend: Render (Signaling Server)
**Time: 5 minutes**

1. Push to GitHub
2. Create Render account
3. Deploy signaling server
4. Get URL: `https://your-app.onrender.com`

### Frontend: Vercel (Web App)
**Time: 5 minutes**

1. Update signaling URL in code:
   ```javascript
   const SIGNALING_SERVER = 'wss://your-app.onrender.com/signal';
   ```

2. Push to GitHub
3. Create Vercel account
4. Import repository
5. Auto-deploy

**Total time: 10 minutes**
**Total cost: FREE**

---

## 📝 Pre-Deployment Checklist

Before deploying anywhere:

```bash
# ✅ Code is clean
git status  # No uncommitted changes

# ✅ Dependencies are listed
cat signaling-server/package.json  # Has all packages

# ✅ Server starts locally
npm start  # Runs without errors

# ✅ Environment variables are set (if needed)
echo $PORT  # Check if PORT is accessible

# ✅ Frontend connects to backend
# Update signaling URL in webapp/public/lib/signaling.js

# ✅ SSL/TLS is ready (most platforms auto-handle)

# ✅ Documentation is updated
# Add your deployment URL to README
```

---

## 🔒 Security Checklist (Before Going Live)

```bash
# ✅ Update environment variables
# Set NODE_ENV=production

# ✅ Disable debug logs
# Remove console.log statements in production

# ✅ Enable HTTPS/WSS
# All traffic should be encrypted

# ✅ Set secure CORS headers
# Only allow your domain

# ✅ Use strong room codes
# Consider longer codes for security

# ✅ Rate limiting
# Add limits on room creation requests

# ✅ Content Security Policy
# Add CSP headers to prevent XSS

# ✅ No sensitive data in code
# Check for hardcoded passwords/keys
```

---

## 📱 Domain Setup (Optional)

If you want `yourdomain.com` instead of `your-app.onrender.com`:

### Using Render:
```bash
# 1. Buy domain from Namecheap, GoDaddy, Google Domains
# 2. In Render dashboard:
#    - Settings → Custom Domains
#    - Add your domain
# 3. Update DNS records (instructions provided)
# 4. Wait 24-48 hours for DNS to propagate
```

### Cost: $10-15/year for domain

---

## 🆘 Troubleshooting Deployment

### "Connection refused"
```bash
# Check if signaling server is running
curl https://your-signaling-url.com

# Check logs in your deployment platform
# Look for error messages
```

### "CORS error"
```bash
# Update signaling server to allow your frontend domain
# In signaling-server/server.js, add:
// res.header('Access-Control-Allow-Origin', 'https://your-frontend-domain.com');
```

### "WebSocket connection failed"
```bash
# Ensure WebSocket protocol is wss:// (not ws://)
# Update in webapp/public/lib/signaling.js:
const SIGNALING_SERVER = 'wss://your-signaling-url.com/signal';
```

### "Blank page loads"
```bash
# Check browser console (F12)
# Look for JavaScript errors
# Verify signaling server URL is correct
```

---

## 📞 Next Steps

1. **Choose your option** (Recommend: Render.com)
2. **Create GitHub repository**
3. **Deploy signaling server**
4. **Deploy frontend**
5. **Update URLs** in code
6. **Test with friends** - Share link!

---

## 📚 Useful Resources

- **Render Docs:** https://render.com/docs
- **Vercel Docs:** https://vercel.com/docs
- **DigitalOcean Tutorials:** https://www.digitalocean.com/community/tutorials
- **Let's Encrypt (SSL):** https://letsencrypt.org
- **Nginx Guide:** https://nginx.org/en/docs/

---

## 🎯 Summary

| Need | Choose | Time | Cost |
|------|--------|------|------|
| **Quickest setup** | Render.com | 5 min | Free |
| **Best performance** | DigitalOcean | 20 min | $5/mo |
| **Most control** | Self-hosted | 30+ min | $0 |
| **Learning** | Self-hosted | 1-2 hrs | $0 |
| **Scale later** | DigitalOcean | 20 min | $5-50/mo |

---

**Questions? Check Render.com docs or DigitalOcean tutorials.**

**Happy deploying!** 🚀

---

*Last Updated: April 13, 2026*
*PeerConnect — Personal P2P Video Calling Application*
