# GitHub Quick Start — 5 Minutes

**Get your PeerConnect project on GitHub in 5 minutes!**

---

## 🚀 STEP-BY-STEP (5 minutes)

### 1️⃣ Create GitHub Repository (1 minute)

```bash
# Go to: https://github.com/new
# Fill in:
# - Repository name: peerconnect
# - Description: Personal P2P Video Calling App
# - Choose: Private (only you) or Public (anyone can see)
# - Click: Create repository

# You'll see this message:
# "...or push an existing repository from the command line"
# Copy the commands shown
```

### 2️⃣ Push Code to GitHub (2 minutes)

```bash
# Open Terminal
cd /Users/siddharthkoduri/Desktop/PeerConnect

# Initialize git (if not done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: PeerConnect P2P video calling"

# Add GitHub remote (REPLACE YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/peerconnect.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Wait for completion...** (usually 30 seconds)

### 3️⃣ Verify on GitHub (1 minute)

```bash
# Go to: https://github.com/YOUR_USERNAME/peerconnect
# You should see:
# ✅ Your code files
# ✅ README.md
# ✅ All your project files
# ✅ Commit history
```

### 4️⃣ Share Your GitHub URL (1 minute)

Your project is now on GitHub!

Share these URLs:

```
📝 Repository: https://github.com/YOUR_USERNAME/peerconnect

📋 Clone command:
git clone https://github.com/YOUR_USERNAME/peerconnect.git
```

---

## ✅ Done! Your Project is on GitHub

Now you can:
- ✅ Access from anywhere: `git clone https://github.com/YOUR_USERNAME/peerconnect.git`
- ✅ Track changes: See full commit history on GitHub
- ✅ Collaborate: Invite friends to contribute
- ✅ Deploy: Auto-deploy from GitHub to Render/DigitalOcean
- ✅ Share: Share GitHub URL with anyone

---

## 🚀 Next: Auto-Deploy to Production

Once code is on GitHub:

### Option 1: Render.com (Recommended, 5 minutes)

```bash
# 1. Go to: https://render.com
# 2. Sign in with GitHub
# 3. Click "New Web Service"
# 4. Select your "peerconnect" repository
# 5. Fill in:
#    Name: peerconnect-signaling
#    Build: cd signaling-server && npm install
#    Start: npm start
#    Plan: Free
# 6. Click Deploy
# 7. Wait 2-3 minutes
# Done! Your app is live!
```

### Option 2: DigitalOcean (Better Control, $5/month)

```bash
# 1. Create DigitalOcean account
# 2. Create Droplet (Ubuntu 22.04)
# 3. SSH in: ssh root@your-ip
# 4. git clone your repo
# 5. Run deployment script
# Done! App running on your server
```

---

## 📚 Full Guides

- **GitHub Setup:** `GITHUB_SETUP.md` (Comprehensive)
- **Deployment:** `DEPLOYMENT_GUIDE.md` (All options)
- **Quick Reference:** `DEPLOYMENT_QUICK_REFERENCE.md`

---

## 🎯 Your GitHub URLs

After pushing:

```
Main Repo:
https://github.com/YOUR_USERNAME/peerconnect

Raw Files (for downloading):
https://raw.githubusercontent.com/YOUR_USERNAME/peerconnect/main/README.md

Clone:
git clone https://github.com/YOUR_USERNAME/peerconnect.git
```

---

## 📝 Update Code Later

After first push, this is your workflow:

```bash
# Make changes
nano webapp/public/app.js  # or use your editor

# Commit changes
git add .
git commit -m "Fix: Update landing page"

# Push to GitHub
git push origin main

# If using Render/auto-deploy:
# ✅ Your live app auto-updates in 2-3 minutes!
```

---

## 🎉 That's It!

Your project is now:
- ✅ On GitHub
- ✅ Version controlled
- ✅ Shareable with a URL
- ✅ Ready for deployment
- ✅ Professional and organized

**Questions?** Read the full `GITHUB_SETUP.md` guide.

---

*Last Updated: April 13, 2026*
