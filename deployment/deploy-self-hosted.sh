#!/bin/bash

# PeerConnect — Self-Hosted Setup Script
# For Ubuntu/Debian Linux
# Usage: sudo ./deploy-self-hosted.sh yourdomain.com

if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (sudo)"
  exit 1
fi

if [ -z "$1" ]; then
  echo "❌ Usage: sudo ./deploy-self-hosted.sh yourdomain.com"
  exit 1
fi

DOMAIN=$1
DEPLOY_USER="peerconnect"
APP_DIR="/opt/peerconnect"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   PeerConnect — Self-Hosted Setup (Ubuntu/Debian)            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Configuration:"
echo "   Domain: $DOMAIN"
echo "   User: $DEPLOY_USER"
echo "   Directory: $APP_DIR"
echo ""

# Update system
echo "🔄 Updating system packages..."
apt update
apt upgrade -y

# Install dependencies
echo "📦 Installing dependencies..."
apt install -y \
    curl \
    wget \
    git \
    nodejs \
    npm \
    nginx \
    certbot \
    python3-certbot-nginx \
    ufw \
    fail2ban

# Verify installations
echo "✅ Checking installed versions..."
node --version
npm --version
nginx -v
certbot --version

# Create deploy user
echo "👤 Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEPLOY_USER"
    echo "✅ User $DEPLOY_USER created"
else
    echo "✅ User $DEPLOY_USER already exists"
fi

# Create app directory
echo "📁 Setting up application directory..."
mkdir -p "$APP_DIR"
cd "$SCRIPT_DIR"

# Copy application files
echo "📋 Copying application files..."
cp -r . "$APP_DIR/"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
chmod -R 755 "$APP_DIR"

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
cd "$APP_DIR/signaling-server"
sudo -u "$DEPLOY_USER" npm install --production

# Setup Nginx
echo "🌐 Configuring Nginx..."

# Copy nginx config
cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/peerconnect

# Enable site
ln -sf /etc/nginx/sites-available/peerconnect /etc/nginx/sites-enabled/peerconnect

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t

# Setup SSL with Let's Encrypt
echo "🔒 Setting up SSL certificate..."
echo "Make sure your domain is pointing to this server's IP address."
read -p "Press Enter to continue with SSL setup..."

certbot certonly --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN"

# Update Nginx SSL paths
sed -i "s|/etc/nginx/certs/cert.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" /etc/nginx/sites-available/peerconnect
sed -i "s|/etc/nginx/certs/key.pem|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" /etc/nginx/sites-available/peerconnect

# Restart Nginx
systemctl restart nginx

# Setup PM2 for Node.js process management
echo "⚙️  Installing PM2 process manager..."
npm install -g pm2

# Create PM2 ecosystem file
cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [
    {
      name: 'peerconnect-signaling',
      script: '$APP_DIR/signaling-server/server.js',
      user: '$DEPLOY_USER',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: '/var/log/peerconnect/error.log',
      out_file: '/var/log/peerconnect/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
EOF

# Create log directory
mkdir -p /var/log/peerconnect
chown -R "$DEPLOY_USER:$DEPLOY_USER" /var/log/peerconnect

# Start with PM2
echo "🚀 Starting application with PM2..."
sudo -u "$DEPLOY_USER" pm2 start "$APP_DIR/ecosystem.config.js"

# Setup PM2 to restart on reboot
pm2 startup systemd -u "$DEPLOY_USER" --hp /home/"$DEPLOY_USER"
sudo -u "$DEPLOY_USER" pm2 save

# Setup firewall
echo "🔥 Configuring firewall..."
ufw --force enable
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw status

# Setup Fail2Ban for security
echo "🛡️  Configuring Fail2Ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Setup auto-renewal for SSL
echo "🔄 Setting up automatic SSL renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

# Create systemd service file (alternative to PM2)
cat > /etc/systemd/system/peerconnect-signaling.service << EOF
[Unit]
Description=PeerConnect Signaling Server
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$APP_DIR/signaling-server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"
Environment="PORT=8080"

[Install]
WantedBy=multi-user.target
EOF

# Display completion info
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ✅ Setup Complete!                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Your deployment details:"
echo "   Domain: https://$DOMAIN"
echo "   Application: $APP_DIR"
echo "   User: $DEPLOY_USER"
echo "   Signaling: wss://$DOMAIN/signal"
echo ""
echo "🚀 Services status:"
pm2 status
echo ""
echo "🌐 Nginx status:"
systemctl status nginx --no-pager

echo ""
echo "📝 Important URLs:"
echo "   Website: https://$DOMAIN"
echo "   Check logs: sudo pm2 logs"
echo "   Restart signaling: sudo pm2 restart all"
echo "   Stop signaling: sudo pm2 stop all"
echo ""
echo "🔄 SSL certificate will auto-renew on: $(date -d '+30 days' +'%Y-%m-%d')"
echo ""
echo "✅ Next steps:"
echo "   1. Update your frontend code with: wss://$DOMAIN/signal"
echo "   2. Deploy frontend (Vercel/Netlify/GitHub Pages)"
echo "   3. Test calling from browser"
echo ""
echo "❓ Logs:"
echo "   Application logs: sudo journalctl -u peerconnect-signaling -f"
echo "   Nginx logs: sudo tail -f /var/log/nginx/access.log"
echo ""
echo "❓ Need help? Check DEPLOYMENT_GUIDE.md"
echo ""
