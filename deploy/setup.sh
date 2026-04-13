#!/bin/bash
# PeerConnect Google Cloud VM Setup Script
# Run once on fresh Google Cloud e2-micro VM (Ubuntu 22.04)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOURUSERNAME/peerconnect/main/deploy/setup.sh | bash
#
# Or locally:
#   chmod +x deploy/setup.sh && sudo deploy/setup.sh

set -e  # Exit on any error

# Color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[PeerConnect]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root. Use: sudo bash $0"
fi

# Get configuration from environment or prompts
if [ -z "$DOMAIN" ]; then
    read -p "Enter your domain (e.g., peerconnect.example.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
    read -p "Enter your email for Let's Encrypt certificates: " EMAIL
fi

if [ -z "$GITHUB_URL" ]; then
    read -p "Enter your GitHub repository URL (e.g., https://github.com/user/peerconnect): " GITHUB_URL
fi

log "Starting PeerConnect deployment on Google Cloud VM"
log "Domain: $DOMAIN"
log "Email: $EMAIL"
log "Repo: $GITHUB_URL"

# ============================================================================
# System Updates
# ============================================================================
log "Updating system packages..."
apt-get update
apt-get upgrade -y
apt-get install -y curl wget git build-essential

# ============================================================================
# Node.js 20 LTS
# ============================================================================
log "Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

log "Node.js version: $(node --version)"
log "npm version: $(npm --version)"

# ============================================================================
# Nginx + Certbot
# ============================================================================
log "Installing Nginx and Certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

# Enable Nginx
systemctl enable nginx
systemctl start nginx

log "Nginx installed and started"

# ============================================================================
# PM2 (Process Manager)
# ============================================================================
log "Installing PM2 globally..."
npm install -g pm2

# Install PM2 completion scripts
pm2 completion install
pm2 update

log "PM2 version: $(pm2 --version)"

# ============================================================================
# Clone Repository
# ============================================================================
log "Cloning PeerConnect repository..."
REPO_DIR="/var/www/peerconnect"

if [ -d "$REPO_DIR" ]; then
    log "Repository already exists, updating..."
    cd "$REPO_DIR"
    git pull origin main
else
    git clone "$GITHUB_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

log "Repository location: $REPO_DIR"

# ============================================================================
# Install Signaling Server Dependencies
# ============================================================================
log "Installing signaling server dependencies..."
cd "$REPO_DIR/signaling-server"
npm install

log "Signaling server dependencies installed"

# ============================================================================
# Setup Web App Directory
# ============================================================================
log "Setting up web app directory..."
mkdir -p /var/www/peerconnect/public
cp -r "$REPO_DIR/webapp/public"/* /var/www/peerconnect/public/

log "Web app files copied to /var/www/peerconnect/public"

# ============================================================================
# Configure Nginx
# ============================================================================
log "Configuring Nginx..."

# Copy config and replace domain placeholder
NGINX_CONFIG="/etc/nginx/sites-available/peerconnect"
cp "$REPO_DIR/deploy/nginx.conf" "$NGINX_CONFIG"

# Replace yourdomain.com placeholder with actual domain
sed -i "s/yourdomain.com/$DOMAIN/g" "$NGINX_CONFIG"

# Enable site
ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/peerconnect

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
if nginx -t; then
    log "Nginx configuration valid"
else
    error "Nginx configuration test failed"
fi

# Reload Nginx
systemctl reload nginx
log "Nginx reloaded"

# ============================================================================
# Let's Encrypt SSL Certificate
# ============================================================================
log "Obtaining SSL certificate from Let's Encrypt..."
log "Make sure DNS for $DOMAIN is pointing to this server's IP"
read -p "Press Enter once DNS is configured..."

certbot --nginx \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    -m "$EMAIL" \
    --redirect

log "SSL certificate obtained and Nginx configured"

# ============================================================================
# Create systemd drop-in for PM2 (alternative to pm2 startup)
# ============================================================================
log "Configuring PM2 for auto-start on reboot..."
mkdir -p /etc/systemd/system
pm2 startup systemd -u root --hp /root
systemctl daemon-reload

log "PM2 startup configured"

# ============================================================================
# Start Signaling Server with PM2
# ============================================================================
log "Starting PeerConnect signaling server with PM2..."
cd "$REPO_DIR/signaling-server"

# Stop any existing process
pm2 delete peerconnect-signal 2>/dev/null || true

# Start new process
pm2 start server.js --name peerconnect-signal

# Save PM2 process list
pm2 save

log "Signaling server started (PID: $(pm2 pid peerconnect-signal))"

# ============================================================================
# Setup Auto-Update Cron Job (optional)
# ============================================================================
log "Setting up auto-update cron job (daily at 2 AM)..."

CRON_JOB="0 2 * * * cd $REPO_DIR && git pull origin main && cd signaling-server && npm install && pm2 restart peerconnect-signal > /var/log/peerconnect-update.log 2>&1"

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v "peerconnect-update" || true; echo "$CRON_JOB") | crontab -

log "Auto-update job scheduled"

# ============================================================================
# Firewall Configuration (ufw)
# ============================================================================
log "Configuring firewall..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw default deny incoming
ufw default allow outgoing

log "Firewall configured"

# ============================================================================
# Log Rotation
# ============================================================================
log "Setting up log rotation..."
cat > /etc/logrotate.d/peerconnect <<EOF
/var/log/peerconnect-*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 root root
}
EOF

log "Log rotation configured"

# ============================================================================
# Summary
# ============================================================================
log "=============================================="
log "PeerConnect deployment complete!"
log "=============================================="
echo ""
echo -e "${GREEN}Service Details:${NC}"
echo "  Domain:     https://$DOMAIN"
echo "  Web Root:   /var/www/peerconnect/public"
echo "  Signaling:  http://localhost:8080 (via Nginx proxy)"
echo "  Process:    PM2 (auto-restart on crash/reboot)"
echo "  Logs:       pm2 logs (or journalctl -u nginx)"
echo ""
echo -e "${GREEN}Useful Commands:${NC}"
echo "  View logs:           pm2 logs peerconnect-signal"
echo "  Restart service:     pm2 restart peerconnect-signal"
echo "  Stop service:        pm2 stop peerconnect-signal"
echo "  Update from git:     cd $REPO_DIR && git pull && cd signaling-server && npm install && pm2 restart peerconnect-signal"
echo "  Renew certificate:   certbot renew --dry-run (then certbot renew)"
echo "  Check Nginx:         nginx -t && systemctl reload nginx"
echo ""
echo -e "${GREEN}Monitor:${NC}"
echo "  Health:              curl https://$DOMAIN/health"
echo "  PM2:                 pm2 monit"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Visit https://$DOMAIN in your browser"
echo "  2. Create a room and test video/audio"
echo "  3. Open in a second tab and join the room"
echo "  4. Test chat, file transfer, and other features"
echo "  5. Set up monitoring (optional): pm2 install pm2-logrotate"
echo ""
log "Deployment successful! 🎉"
