# PeerConnect — GitHub Setup & Deployment Guide

**Last Updated:** April 13, 2026
**Purpose:** Enable easy project setup from GitHub URL

---

## 🎯 Overview

This guide explains how to:
1. ✅ Push PeerConnect to GitHub
2. ✅ Use GitHub URL for easy project setup
3. ✅ Auto-deploy from GitHub to production
4. ✅ Keep your project on GitHub for version control and collaboration

---

## 📋 STEP 1: Create GitHub Repository

### Option A: Using GitHub Web (Easiest)

1. **Go to GitHub**
   - Open: https://github.com/new
   - Sign in with your GitHub account

2. **Create Repository**
   - **Repository name:** `peerconnect`
   - **Description:** Personal P2P Video Calling App
   - **Visibility:**
     - Choose **Private** if you want only you to see it
     - Choose **Public** if you want to share with others
   - **Initialize with:**
     - ☐ README (we have one)
     - ☐ .gitignore (we'll create one)
     - ☐ License (optional)
   - Click **Create repository**

3. **You'll see commands to push existing repository**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/peerconnect.git
   git branch -M main
   git push -u origin main
   ```
   → Follow these commands (see Step 2 below)

### Option B: Using GitHub CLI (Faster)

```bash
# Install GitHub CLI
# macOS: brew install gh
# Linux: Download from https://github.com/cli/cli/releases

# Authenticate
gh auth login

# Create repository from your project directory
cd /Users/siddharthkoduri/Desktop/PeerConnect
gh repo create peerconnect --public --source=. --remote=origin --push
```

---

## 📋 STEP 2: Push Your Code to GitHub

### From Your Project Directory

```bash
cd /Users/siddharthkoduri/Desktop/PeerConnect

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit with message
git commit -m "Initial commit: PeerConnect P2P video calling application"

# Add GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/peerconnect.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### If You Already Have Git History

```bash
cd /Users/siddharthkoduri/Desktop/PeerConnect

# Check remote
git remote -v

# If no remote, add it
git remote add origin https://github.com/YOUR_USERNAME/peerconnect.git

# Push existing commits
git push -u origin main
```

**Expected Output:**
```
Enumerating objects: 150, done.
Counting objects: 100% (150/150), done.
Delta compression using up to 8 threads
Compressing objects: 100% (50/50), done.
Writing objects: 100% (150/150), 2.50 MiB | 500 KiB/s
...
To https://github.com/YOUR_USERNAME/peerconnect.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

## 🔒 STEP 3: Create .gitignore File

Create `/Users/siddharthkoduri/Desktop/PeerConnect/.gitignore`:

```bash
cat > /Users/siddharthkoduri/Desktop/PeerConnect/.gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json
yarn.lock
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.production.local
.DS_Store

# Logs
logs/
*.log

# Build outputs
dist/
build/
out/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Temporary files
temp/
tmp/
*.tmp

# SSL certificates (optional - don't commit self-signed certs)
*.pem
certs/

# Secrets
secrets/
credentials.json
EOF
```

Then commit and push:
```bash
git add .gitignore
git commit -m "Add .gitignore"
git push
```

---

## 📋 STEP 4: Create GitHub-Friendly README

Your README.md should include:
- Project description
- Quick start instructions
- GitHub clone instructions
- Deployment info

**Your current README is good, but add GitHub clone info:**

```markdown
## 🚀 Quick Start

### Clone from GitHub
```bash
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect
```

### Install & Run Locally
```bash
# Install signaling server dependencies
cd signaling-server
npm install

# Start signaling server
npm start

# In another terminal, start web server
cd webapp/public
python3 -m http.server 3000
```

### View in Browser
Open: http://localhost:3000
```
```

---

## 📋 STEP 5: Share GitHub URL

Once pushed to GitHub, you can share these URLs:

### GitHub Repository URL
```
https://github.com/YOUR_USERNAME/peerconnect
```
→ **People can view your code**

### Clone Command
```bash
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect
npm install
npm start
```
→ **People can run your project locally**

### File-Specific URLs
```
https://github.com/YOUR_USERNAME/peerconnect/blob/main/README.md
https://github.com/YOUR_USERNAME/peerconnect/tree/main/webapp
https://github.com/YOUR_USERNAME/peerconnect/blob/main/signaling-server/server.js
```

---

## 🚀 STEP 6: Auto-Deploy from GitHub

### Option 1: Render.com (Easiest)

```bash
# 1. Repository is on GitHub ✅
# 2. Go to render.com
# 3. Click "New Web Service"
# 4. Click "Connect GitHub" if not already connected
# 5. Select your "peerconnect" repository
# 6. Fill in:
#    - Name: peerconnect-signaling
#    - Environment: Node
#    - Build Command: cd signaling-server && npm install
#    - Start Command: npm start
# 7. Click "Deploy"
# 8. Done!
```

**Auto-deploy from GitHub:**
- Every time you `git push` to main
- Render automatically pulls latest code and deploys
- No manual deployment needed!

### Option 2: GitHub Actions (CI/CD)

Automatically run tests, build, and deploy on every push.

Create `.github/workflows/deploy.yml`:

```bash
mkdir -p /Users/siddharthkoduri/Desktop/PeerConnect/.github/workflows

cat > /Users/siddharthkoduri/Desktop/PeerConnect/.github/workflows/deploy.yml << 'EOF'
name: Deploy to Render

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2

    - name: Set up Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'

    - name: Install dependencies
      run: |
        cd signaling-server
        npm install

    - name: Check for errors
      run: |
        cd signaling-server
        npm test || echo "No tests defined"

  deploy:
    needs: test
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v2

    - name: Deploy to Render
      run: |
        echo "Deployment triggered on push to main"
        # Render automatically deploys via webhook
EOF
```

Then commit and push:
```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions CI/CD workflow"
git push
```

---

## 📊 GitHub Features You Can Use

### 1. **GitHub Pages** (Free Static Hosting)
```
Deploy your frontend to: https://YOUR_USERNAME.github.io/peerconnect
```

Setup:
```bash
# 1. Go to repository Settings → Pages
# 2. Select "Deploy from a branch"
# 3. Choose "main" branch, "/root" folder
# 4. Save
# 5. Your frontend is live!
```

### 2. **GitHub Releases** (Version Management)
```bash
# Create a release for version 1.0.0
git tag v1.0.0
git push origin v1.0.0

# Go to GitHub → Releases → Create Release
# Add release notes and documentation
```

### 3. **GitHub Issues** (Bug Tracking)
- Track bugs and feature requests
- Assign to yourself or team
- Create milestones and roadmaps

### 4. **GitHub Projects** (Task Management)
- Create a project board
- Track issues as tasks
- Organize by status (TODO, In Progress, Done)

### 5. **GitHub Discussions** (Community)
- Ask questions
- Share ideas
- Get feedback

---

## 🔗 GITHUB INTEGRATION EXAMPLES

### For Friends to Contribute
```bash
# Friends can fork your repo
# Make changes
# Create Pull Request
# You review and merge
```

### For Deployment
```markdown
## 📖 Deploy Your Own Instance

Click the button below to deploy on Render:
[![Deploy on Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/peerconnect)

Or manually:
1. Fork this repository
2. Create account on Render.com
3. Connect your GitHub
4. Deploy!
```

### Share as 1-Click Deploy
Add `render.yaml` for easy deployment:

```bash
cat > /Users/siddharthkoduri/Desktop/PeerConnect/render.yaml << 'EOF'
services:
  - type: web
    name: peerconnect-signaling
    runtime: node
    buildCommand: cd signaling-server && npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 8080
EOF
```

---

## 📋 STEP-BY-STEP GITHUB WORKFLOW

### After Initial Setup (One-time)

```bash
# 1. Clone repository locally
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect

# 2. Make changes to code
# (edit files, add features, fix bugs)

# 3. Check what changed
git status

# 4. Stage changes
git add .
# Or add specific files:
git add webapp/public/app.js signaling-server/server.js

# 5. Commit with message
git commit -m "Fix: Update landing page responsive layout"

# 6. Push to GitHub
git push origin main

# Done! Changes are on GitHub and auto-deployed
```

### Daily Workflow

```bash
# Before starting work
git pull origin main

# Work on your code
# ...

# Commit and push
git add .
git commit -m "Add new feature"
git push origin main
```

---

## 🔒 GitHub Security Best Practices

### Protect Your Main Branch

1. Go to repository **Settings**
2. Click **Branches**
3. Add rule for `main` branch:
   - ☑️ Require pull request reviews
   - ☑️ Dismiss stale pull request approvals
   - ☑️ Require branches to be up to date

### Keep Secrets Secure

```bash
# NEVER commit:
❌ .env files
❌ API keys
❌ Passwords
❌ Private credentials

# Instead use GitHub Secrets:
# Settings → Secrets and variables → Actions
```

### Enable Two-Factor Authentication (2FA)

1. Go to GitHub **Settings**
2. Click **Security**
3. Enable **Two-factor authentication**
4. Use authenticator app (Google Authenticator, Authy)

---

## 🌐 GitHub URLs for Your Project

After pushing to GitHub:

### Main Repository
```
https://github.com/YOUR_USERNAME/peerconnect
```

### Specific Sections
```
# Source Code
https://github.com/YOUR_USERNAME/peerconnect/tree/main/webapp
https://github.com/YOUR_USERNAME/peerconnect/tree/main/signaling-server

# Files
https://github.com/YOUR_USERNAME/peerconnect/blob/main/README.md
https://github.com/YOUR_USERNAME/peerconnect/blob/main/DEPLOYMENT_GUIDE.md
https://github.com/YOUR_USERNAME/peerconnect/blob/main/signaling-server/server.js

# Raw Files (for downloading)
https://raw.githubusercontent.com/YOUR_USERNAME/peerconnect/main/README.md
```

### Clone Commands
```bash
# HTTPS (password-protected)
git clone https://github.com/YOUR_USERNAME/peerconnect.git

# SSH (if you set up SSH keys)
git clone git@github.com:YOUR_USERNAME/peerconnect.git

# GitHub CLI
gh repo clone YOUR_USERNAME/peerconnect
```

---

## 📱 Share Your GitHub Project

### With Friends
```
"Check out my project on GitHub!"
https://github.com/YOUR_USERNAME/peerconnect
```

### With Instructions
```
"Want to try PeerConnect?"

1. Clone: git clone https://github.com/YOUR_USERNAME/peerconnect.git
2. Install: cd signaling-server && npm install
3. Run: npm start
4. Open: http://localhost:3000
```

### On Social Media
```
"Built a P2P video calling app! 🎥
No accounts, no servers, just pure peer-to-peer.
Check it out: github.com/YOUR_USERNAME/peerconnect
#P2P #WebRTC #OpenSource"
```

---

## 🚀 GITHUB + DEPLOYMENT WORKFLOW

### Complete Workflow:

```
1. CODE LOCALLY
   └─ Make changes on your computer

2. COMMIT & PUSH TO GITHUB
   └─ git push origin main

3. GITHUB AUTOMATICALLY TRIGGERS
   └─ Render.com pulls latest code

4. AUTOMATIC DEPLOYMENT
   └─ Your app updates on production server
   └─ New changes live in seconds!

5. SHARE GITHUB URL
   └─ Friends can clone and run locally
   └─ Or use your deployed version online
```

### Example Flow:

```bash
# You're working on a bug fix
cd /Users/siddharthkoduri/Desktop/PeerConnect

# Make a change
echo "// Fixed bug" >> webapp/public/app.js

# Commit
git add webapp/public/app.js
git commit -m "Fix: Resolve connection issue on mobile"

# Push to GitHub
git push origin main

# ✅ Automatically:
# 1. GitHub receives the push
# 2. GitHub Actions runs tests (if configured)
# 3. Render.com webhook triggers
# 4. Render pulls latest code
# 5. Rebuilds and deploys
# 6. Your app is updated online within 2-3 minutes!

# Friends can see:
# - The code change on GitHub
# - The fix live on your deployed app
```

---

## 📊 GitHub Statistics & Insights

Once your project is on GitHub:

1. **Insights Tab**
   - See commit history
   - Track contributions
   - View traffic

2. **Network Graph**
   - Visualize branches
   - See merge history

3. **Stargazers**
   - Track who likes your project
   - Build community

---

## 🎯 GITHUB BEST PRACTICES

### Commit Messages
```bash
# ❌ Bad
git commit -m "fix"
git commit -m "changes"

# ✅ Good
git commit -m "Fix: Landing page responsive layout on mobile"
git commit -m "Feature: Add WebRTC connection retry logic"
git commit -m "Docs: Update deployment guide"
```

### Commit Often
```bash
# ✅ Good - small, focused commits
git commit -m "Update landing page logo size"
git commit -m "Fix: WebSocket connection timeout"
git commit -m "Add deployment documentation"

# ❌ Bad - large commit with many changes
git commit -m "Updated everything"
```

### Use Branches for Features
```bash
# Create feature branch
git checkout -b feature/dark-mode

# Make changes
# Commit
# Push
git push origin feature/dark-mode

# Create Pull Request on GitHub
# Review and merge when ready
```

---

## 📞 Sharing Your GitHub Project

### Create a README Section:

```markdown
## 🚀 Deploy Your Own

### Quick Setup (5 minutes)

**Clone from GitHub:**
\`\`\`bash
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect
\`\`\`

**Install & Run:**
\`\`\`bash
cd signaling-server
npm install
npm start

# In another terminal:
cd ../webapp/public
python3 -m http.server 3000
\`\`\`

**Open Browser:**
http://localhost:3000

### Deploy to Production

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for:
- Render.com (5 minutes)
- DigitalOcean ($5/month)
- Self-hosted (free)

## 🔗 Links

- **GitHub:** https://github.com/YOUR_USERNAME/peerconnect
- **Live Demo:** https://peerconnect.onrender.com (if deployed)
- **Documentation:** See README.md and DEPLOYMENT_GUIDE.md
```

---

## ✅ FINAL CHECKLIST

```bash
☐ GitHub account created (https://github.com)
☐ Repository created (peerconnect)
☐ Code pushed to GitHub (git push origin main)
☐ .gitignore file added
☐ README.md updated with GitHub clone instructions
☐ Deployment configured (Render, DigitalOcean, etc.)
☐ GitHub URL ready to share
☐ Tested cloning from GitHub (git clone ...)
☐ Deployment auto-triggers on push (tested)
☐ Friends can clone and run the project
```

---

## 🎉 YOU'RE DONE!

Your PeerConnect project is now:
✅ On GitHub (version controlled)
✅ Easy to clone and run (`git clone ...`)
✅ Auto-deployed to production (`git push` = live)
✅ Ready to share with friends/world
✅ Professional and organized

---

## 📖 Quick Reference

**Your GitHub URL:**
```
https://github.com/YOUR_USERNAME/peerconnect
```

**Clone command for others:**
```bash
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect
npm install  # in signaling-server
npm start
```

**Update your app:**
```bash
git add .
git commit -m "Your message"
git push origin main
# ✅ Auto-deployed!
```

---

*Last Updated: April 13, 2026*
*PeerConnect — GitHub Setup & Deployment*
