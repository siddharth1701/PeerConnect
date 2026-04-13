# Dockerfile for PeerConnect Signaling Server
# Build: docker build -t peerconnect-signaling .
# Run: docker run -p 8080:8080 peerconnect-signaling

FROM node:18-alpine

WORKDIR /app

# Copy signaling server files
COPY signaling-server/ ./signaling-server/

# Install dependencies
WORKDIR /app/signaling-server
RUN npm install --production

# Expose signaling port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start signaling server
CMD ["npm", "start"]
