#!/usr/bin/env node

/**
 * Simple HTTPS server for local testing with mobile devices
 * Usage: node https-server.js [port] [cert_file] [key_file]
 *
 * Example:
 *   node https-server.js 3001 cert.pem key.pem
 *
 * Generate certificates first:
 *   openssl req -x509 -newkey rsa:2048 -nodes -out cert.pem -keyout key.pem -days 365
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const PORT = process.argv[2] || 3001;
const CERT_FILE = process.argv[3] || 'cert.pem';
const KEY_FILE = process.argv[4] || 'key.pem';

// Try to load certificates
let options = {};
try {
  options.cert = fs.readFileSync(CERT_FILE);
  options.key = fs.readFileSync(KEY_FILE);
} catch (err) {
  console.error(`Error loading certificates: ${err.message}`);
  console.error(`\nTo generate self-signed certificates, run:`);
  console.error(`  openssl req -x509 -newkey rsa:2048 -nodes -out ${CERT_FILE} -keyout ${KEY_FILE} -days 365`);
  process.exit(1);
}

// Proxy for signaling server endpoints
function proxyToSignalingServer(req, res) {
  const signalingUrl = `https://localhost:8080${req.url}`;

  const options = {
    hostname: 'localhost',
    port: 8080,
    path: req.url,
    method: req.method,
    rejectUnauthorized: false, // Allow self-signed certificates
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Add CORS headers to response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gateway Error', message: err.message }));
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

// Simple file server
const server = https.createServer(options, (req, res) => {
  // Handle proxy requests to signaling server
  if (req.url.startsWith('/api/')) {
    const cleanUrl = req.url.replace('/api', '');
    const newReq = { ...req, url: cleanUrl, method: req.method };
    return proxyToSignalingServer(newReq, res);
  }

  // Strip query string from URL for file lookup
  const urlWithoutQuery = req.url.split('?')[0];
  let filePath = path.join(__dirname, 'webapp/public', urlWithoutQuery);

  // Default to index.html for root or query string paths
  if (urlWithoutQuery === '/' || urlWithoutQuery === '') {
    filePath = path.join(__dirname, 'webapp/public/index.html');
  }

  // Prevent directory traversal
  const realPath = path.resolve(filePath);
  const basePath = path.resolve(path.join(__dirname, 'webapp/public'));

  if (!realPath.startsWith(basePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file not found and it looks like a route (no extension), serve index.html
      if (!urlWithoutQuery.includes('.')) {
        filePath = path.join(__dirname, 'webapp/public/index.html');
        fs.readFile(filePath, (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end(`File not found: ${req.url}`);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(404);
      res.end(`File not found: ${req.url}`);
      return;
    }

    // Set appropriate MIME types
    let contentType = 'text/html';
    if (filePath.endsWith('.js')) contentType = 'text/javascript';
    if (filePath.endsWith('.css')) contentType = 'text/css';
    if (filePath.endsWith('.json')) contentType = 'application/json';
    if (filePath.endsWith('.png')) contentType = 'image/png';
    if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
    if (filePath.endsWith('.wasm')) contentType = 'application/wasm';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  // Get local IP
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';

  Object.values(interfaces).forEach(iface => {
    iface.forEach(addr => {
      if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('192.')) {
        localIp = addr.address;
      }
    });
  });

  console.log('');
  console.log('🔒 PeerConnect HTTPS Server');
  console.log('─'.repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`Certificates: ${CERT_FILE}, ${KEY_FILE}`);
  console.log('');
  console.log('📍 Access URLs:');
  console.log(`  Localhost:  https://localhost:${PORT}`);
  console.log(`  Local IP:   https://${localIp}:${PORT}`);
  console.log('');
  console.log('⚠️  Browser will show "Not secure" warning');
  console.log('   Click "Advanced" → "Proceed anyway"');
  console.log('');
  console.log('📱 Testing on mobile:');
  console.log(`  1. Open: https://${localIp}:${PORT} on your phone`);
  console.log(`  2. Tap past the security warning`);
  console.log(`  3. Create room on desktop, join from mobile`);
  console.log('');
  console.log('🛑 Press Ctrl+C to stop');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n\nServer stopped');
  process.exit(0);
});
