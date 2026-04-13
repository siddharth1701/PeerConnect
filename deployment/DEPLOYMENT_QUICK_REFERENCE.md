# PeerConnect — Deployment Quick Reference

**Choose your deployment method and follow the steps:**

---

## 🚀 OPTION 1: Render.com (RECOMMENDED - 5 minutes)

### Perfect for: Personal projects, hobby use, free tier

**Cost:** Free tier or $7/month
**Setup time:** 5 minutes
**Maintenance:** None

### Quick Steps:
```bash
# 1. Commit your code
git add .
git commit -m "Ready to deploy"
git push origin main

# 2. Go to render.com
# 3. Sign up with GitHub
# 4. Click "New Web Service"
# 5. Select your repository
# 6. Fill in:
#    - Name: peerconnect-signaling
#    - Build: npm install
#    - Start: npm start
#    - Plan: Free

# 7. Update frontend URL in webapp/public/lib/signaling.js:
# const SIGNALING_SERVER = 'wss://your-app.onrender.com/signal';

# 8. Deploy frontend on Vercel (vercel.com)
```

**Result:**
- Backend: `https://your-app.onrender.com`
- Frontend: `https://your-app.vercel.app`

---

## 💻 OPTION 2: DigitalOcean (Best VPS - $5/month)

### Perfect for: More control, reliable uptime, learning

**Cost:** $5-12/month
**Setup time:** 20 minutes
**Maintenance:** Minimal

### Quick Steps:
```bash
# 1. Create DigitalOcean account

# 2. Create a Droplet:
#    - Choose: Ubuntu 22.04 LTS
#    - Size: $5/month (1GB RAM, 25GB SSD)
#    - Region: Closest to you

# 3. SSH into your droplet:
ssh root@your-droplet-ip

# 4. Clone your repo:
cd /opt
git clone https://github.com/YOUR_USERNAME/peerconnect.git

# 5. Run deployment script:
cd peerconnect
sudo ./deploy-self-hosted.sh yourdomain.com

# 6. Point your domain DNS to droplet IP

# 7. Done! Your app is live at https://yourdomain.com
```

**Result:**
- Website: `https://yourdomain.com`
- Backend: `wss://yourdomain.com/signal`

---

## 🏠 OPTION 3: Self-Hosted (Your computer/Raspberry Pi - FREE)

### Perfect for: Learning, full control, zero cost

**Cost:** Free ($0/month) + electricity
**Setup time:** 30 minutes
**Maintenance:** Medium (updates, security)

### Quick Steps:

```bash
# 1. Install Linux (Ubuntu Server 22.04)
# 2. SSH into your machine
# 3. Clone repo:
git clone https://github.com/YOUR_USERNAME/peerconnect.git
cd peerconnect

# 4. Run setup script:
sudo ./deploy-self-hosted.sh yourdomain.com

# 5. Point domain DNS to your IP

# Done! Your app runs on your machine
```

### Requirements:
- Linux server (Ubuntu/Debian)
- Domain name ($10-15/year)
- 24/7 stable internet connection
- Your ISP allows port forwarding (usually yes)

**Result:**
- Website: `https://yourdomain.com`
- Backend: `wss://yourdomain.com/signal`
- Runs on your hardware (Raspberry Pi, old computer, etc.)

---

## 🐳 OPTION 4: Docker (Any cloud provider with Docker support)

### Perfect for: AWS, Google Cloud, Azure, any provider

**Cost:** Varies by provider ($5-20/month)
**Setup time:** 20 minutes
**Maintenance:** Low

### Quick Steps:

```bash
# 1. Build Docker image:
docker build -t peerconnect-signaling .

# 2. Test locally:
docker run -p 8080:8080 peerconnect-signaling

# 3. Push to cloud provider's container registry

# 4. Deploy on their platform

# 5. Point domain to container

# Done!
```

---

## 📊 Quick Comparison

| Feature | Render | DigitalOcean | Self-Hosted | Docker |
|---------|--------|--------------|-------------|--------|
| **Cost** | Free/$7 | $5/mo | Free | Varies |
| **Setup** | 5 min | 20 min | 30 min | 20 min |
| **Ease** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Control** | Low | High | Full | High |
| **Maintenance** | None | Low | Medium | Low |
| **Uptime** | 99.9% | 99.99% | Depends | 99.9%+ |
| **Best For** | Hobby | Learning | Full control | Scale |

---

## 🎯 MY RECOMMENDATION

### For Personal Projects: **Render.com**

Why?
- ✅ Completely free (or $7/month)
- ✅ Takes 5 minutes to set up
- ✅ Auto-deploys from GitHub
- ✅ Built-in HTTPS
- ✅ Zero maintenance
- ✅ Easy to upgrade if needed

---

## 📋 Pre-Deployment Checklist

Before deploying:

```bash
# ✅ Code is clean
git status  # Should be clean

# ✅ Dependencies are listed
cat signaling-server/package.json

# ✅ Server runs locally
npm start  # Should start without errors

# ✅ Tests pass
npm test  # If you have tests

# ✅ Documentation is updated
# Update README with deployment URL

# ✅ Environment variables are set (if needed)
# No hardcoded secrets in code

# ✅ Security is good
# No sensitive data in code
```

---

## 🔗 Frontend + Backend URLs

After deployment, update your frontend:

```javascript
// File: webapp/public/lib/signaling.js

// Update this line with your backend URL:
const SIGNALING_SERVER = 'wss://your-deployment-url.com/signal';
```

**Examples:**
- Render: `wss://peerconnect-signaling.onrender.com/signal`
- Self-hosted: `wss://yourdomain.com/signal`
- DigitalOcean: `wss://yourdomain.com/signal`

---

## 🧪 Testing After Deployment

1. Open your frontend URL in browser
2. Create a new room
3. Share room code/link with friend
4. Friend joins from different browser
5. Video should connect within seconds

**If it doesn't work:**
- Check browser console (F12)
- Check signaling server logs
- Verify signaling URL is correct
- Check firewall allows WebSocket

---

## 📞 Support & Documentation

For detailed instructions, see:
- `DEPLOYMENT_GUIDE.md` — Full guide with all options
- `deploy-render.sh` — Interactive Render setup
- `deploy-self-hosted.sh` — Self-hosted setup script

---

## 🚀 Next Steps

1. **Choose option** (Recommend: Render.com)
2. **Follow the steps** for your option
3. **Update your code** with deployment URL
4. **Test with friends** - Share link!
5. **Celebrate!** 🎉

---

**Questions? Check DEPLOYMENT_GUIDE.md**

**Happy deploying!** 🚀

---

*Last Updated: April 13, 2026*
