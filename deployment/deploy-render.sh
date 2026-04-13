#!/bin/bash

# PeerConnect — Deploy to Render.com
# This script guides you through deploying to Render.com
# Prerequisite: GitHub account and repository

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PeerConnect — Render.com Deployment Guide                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "❌ Not a Git repository. Please run 'git init' first."
    exit 1
fi

# Check if package.json exists in signaling-server
if [ ! -f "signaling-server/package.json" ]; then
    echo "❌ signaling-server/package.json not found."
    exit 1
fi

echo "📋 STEP 1: Prepare Your Repository"
echo "═════════════════════════════════"
echo ""
echo "Checking Git status..."
git status

echo ""
echo "✅ Make sure to commit all changes:"
echo "   git add ."
echo "   git commit -m 'Prepare for Render deployment'"
echo ""

read -p "Have you committed all changes? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please commit your changes first."
    exit 1
fi

echo ""
echo "📋 STEP 2: Push to GitHub"
echo "═════════════════════════"
echo ""
echo "Make sure your code is pushed to GitHub:"
echo "   git push origin main"
echo ""

read -p "Have you pushed to GitHub? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please push to GitHub first."
    exit 1
fi

echo ""
echo "📋 STEP 3: Get Your GitHub Details"
echo "═════════════════════════════════"
read -p "Enter your GitHub username: " github_username
read -p "Enter your GitHub repository name: " repo_name
read -p "Enter your GitHub repository URL (e.g., https://github.com/username/repo): " repo_url

echo ""
echo "📋 STEP 4: Deploy to Render"
echo "═════════════════════════"
echo ""
echo "🔗 Follow these steps in Render.com:"
echo ""
echo "1. Go to https://render.com"
echo "2. Sign up or log in with GitHub"
echo "3. Click 'New +' → 'Web Service'"
echo "4. Select your repository: $repo_name"
echo "5. Fill in the settings:"
echo "   - Name: peerconnect-signaling (or your choice)"
echo "   - Environment: Node"
echo "   - Build Command: cd signaling-server && npm install"
echo "   - Start Command: npm start"
echo "   - Plan: Free (if eligible)"
echo "6. Click 'Deploy'"
echo ""
echo "⏳ Deployment will take 2-3 minutes..."
echo ""

read -p "Press Enter when your deployment is complete..."

echo ""
echo "📋 STEP 5: Get Your Deployment URL"
echo "═════════════════════════════════"
read -p "Enter your Render deployment URL (e.g., https://peerconnect-signaling.onrender.com): " render_url

echo ""
echo "📋 STEP 6: Update Frontend Configuration"
echo "═════════════════════════════════════"
echo ""
echo "📝 Update signaling server URL in your code:"
echo ""
echo "File: webapp/public/lib/signaling.js"
echo ""
echo "Change:"
echo "  const SIGNALING_SERVER = 'wss://localhost:8080/signal';"
echo ""
echo "To:"
echo "  const SIGNALING_SERVER = 'wss://${render_url#https://}/signal';"
echo ""

read -p "Have you updated the signaling URL? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please update the signaling URL first."
    exit 1
fi

echo ""
echo "📋 STEP 7: Deploy Frontend (Choose One)"
echo "════════════════════════════════════"
echo ""
echo "Option A: Vercel (Recommended)"
echo "  1. Go to https://vercel.com"
echo "  2. Import your GitHub repository"
echo "  3. Deploy"
echo ""
echo "Option B: Netlify"
echo "  1. Go to https://netlify.com"
echo "  2. Connect GitHub"
echo "  3. Set build settings:"
echo "     - Base: webapp/public"
echo "     - Build command: (leave empty)"
echo "     - Publish: webapp/public"
echo "  4. Deploy"
echo ""
echo "Option C: GitHub Pages"
echo "  1. Push code to GitHub"
echo "  2. Enable Pages in Settings"
echo ""

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              ✅ Deployment Complete!                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 Your deployment URLs:"
echo "   Backend (Signaling): ${render_url}/signal"
echo "   Frontend: (from Vercel/Netlify)"
echo ""
echo "🧪 Test your deployment:"
echo "   1. Open your frontend URL in browser"
echo "   2. Create a new room"
echo "   3. Join from another browser"
echo "   4. Video should connect!"
echo ""
echo "📚 Next steps:"
echo "   - Set up a custom domain (optional)"
echo "   - Configure environment variables (if needed)"
echo "   - Monitor logs in Render dashboard"
echo ""
echo "❓ Need help? Check DEPLOYMENT_GUIDE.md"
echo ""
