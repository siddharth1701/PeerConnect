#!/bin/bash

# PeerConnect — Quick Server Startup Script
# Usage: ./START_SERVERS.sh
# This will start both the signaling server and web server in the background

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           PeerConnect — Starting Servers                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Kill any existing servers on these ports
echo "🧹 Cleaning up old processes..."
lsof -i :8080 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -i :3001 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# Start Signaling Server (Port 8080)
echo "🚀 Starting Signaling Server (Port 8080)..."
cd /Users/siddharthkoduri/Desktop/PeerConnect/signaling-server
npm start > /tmp/signaling-server.log 2>&1 &
SIGNALING_PID=$!
sleep 2

# Check if signaling server started
if ps -p $SIGNALING_PID > /dev/null; then
  echo "✅ Signaling Server started (PID: $SIGNALING_PID)"
else
  echo "❌ Signaling Server failed to start"
  cat /tmp/signaling-server.log
  exit 1
fi

# Start Web Server (Port 3001)
echo "🚀 Starting Web Server (Port 3001)..."
cd /Users/siddharthkoduri/Desktop/PeerConnect/webapp/public
node https-server.js 3001 > /tmp/https-server.log 2>&1 &
WEB_PID=$!
sleep 2

# Check if web server started
if ps -p $WEB_PID > /dev/null; then
  echo "✅ Web Server started (PID: $WEB_PID)"
else
  echo "❌ Web Server failed to start"
  cat /tmp/https-server.log
  exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           ✅ All Servers Running Successfully                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📱 Open your browser:"
echo "   https://localhost:3001"
echo ""
echo "📊 Server Status:"
echo "   • Signaling: wss://localhost:8080/signal"
echo "   • Web:       https://localhost:3001"
echo ""
echo "🧪 To run tests:"
echo "   See BROWSER_TEST_GUIDE.md for detailed instructions"
echo ""
echo "⚠️  Note: Both servers are running in background"
echo "   To stop them: killall node"
echo ""
