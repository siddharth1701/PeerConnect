#!/usr/bin/env node

/**
 * Simple HTTPS server for PeerConnect web app
 * Serves static files from current directory with HTTPS support
 * Usage: node https-server.js [port]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.argv[2] || 3001;
const publicDir = __dirname;

// Read SSL certificates
const privateKey = fs.readFileSync(path.join(publicDir, 'key.pem'), 'utf8');
const certificate = fs.readFileSync(path.join(publicDir, 'cert.pem'), 'utf8');
const credentials = { key: privateKey, cert: certificate };

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Create HTTPS server
const server = https.createServer(credentials, (req, res) => {
  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  let filePath = path.join(publicDir, parsedUrl.pathname);

  // Default to index.html for root
  if (filePath === publicDir || filePath.endsWith('/')) {
    filePath = path.join(publicDir, 'index.html');
  }

  // Get file extension
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  // Read and serve file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 Server Error</h1>', 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content, 'utf-8');
    }
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔒 PeerConnect HTTPS Server listening on https://localhost:${PORT}`);
  console.log(`   Local IP: https://192.168.1.2:${PORT}`);
  console.log(`   (Note: Self-signed certificate - accept the browser warning)`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  server.close();
  process.exit(0);
});
