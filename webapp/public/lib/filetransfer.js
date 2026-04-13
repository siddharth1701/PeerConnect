/**
 * P2P File Transfer over RTCDataChannel
 * Transfers files directly between peers without server involvement
 */

export class FileTransfer extends EventTarget {
  constructor() {
    super();
    this._channel = null;
    this._sendQueue = [];
    this._recvBuffer = new Map(); // Map of transferId -> { chunks: [], size, name, mimeType }
    this._isSending = false;
    this._sendStartTime = null;

    // Large file warning threshold (not a hard limit)
    this.MAX_FILE_SIZE_WARNING = 500 * 1024 * 1024;
  }

  // ============================================================================
  // Initiator side: create the data channel
  // ============================================================================
  createDataChannel(peerConnection) {
    this._channel = peerConnection.createDataChannel('filetransfer', {
      ordered: true,
      maxRetransmits: 30
    });
    this._setupChannel();
  }

  // ============================================================================
  // Answerer side: receive the data channel
  // ============================================================================
  attachChannel(dataChannel) {
    this._channel = dataChannel;
    this._setupChannel();
  }

  // ============================================================================
  // Private: setup channel event handlers
  // ============================================================================
  _setupChannel() {
    this._channel.onopen = () => {
      console.log('[FileTransfer] Data channel opened');
      this.dispatchEvent(new CustomEvent('channel-open', { detail: {} }));
    };

    this._channel.onclose = () => {
      console.log('[FileTransfer] Data channel closed');
      this.dispatchEvent(new CustomEvent('channel-closed', { detail: {} }));
    };

    this._channel.onmessage = (event) => {
      const data = event.data;

      // Handle binary chunks
      if (data instanceof ArrayBuffer) {
        this._handleBinaryChunk(data);
        return;
      }

      // Handle JSON control messages
      try {
        const message = JSON.parse(data);
        this._handleMessage(message);
      } catch (err) {
        console.error('[FileTransfer] Failed to parse message:', err);
      }
    };

    this._channel.onerror = (err) => {
      console.error('[FileTransfer] Data channel error:', err);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: err.message } }));
    };
  }

  // ============================================================================
  // Sending: sendFile
  // ============================================================================
  async sendFile(file) {
    if (!this.isOpen()) {
      throw new Error('Data channel not open');
    }

    // No size limit, but warn for large files
    if (file.size > this.MAX_FILE_SIZE_WARNING) {
      this.dispatchEvent(new CustomEvent('send-warning', {
        detail: {
          message: 'Large file — keep this tab open during transfer',
          filename: file.name,
          size: file.size
        }
      }));
    }

    const transferId = Math.random().toString(36).substr(2, 9);

    // Send file header
    const header = {
      type: 'file-start',
      transferId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    };
    this._channel.send(JSON.stringify(header));

    // Initialize send start time
    this._sendStartTime = Date.now();

    // Enqueue and start sending chunks
    this._sendQueue.push({ file, transferId, sentBytes: 0 });
    this._processSendQueue();
  }

  // ============================================================================
  // Private: process send queue with flow control
  // ============================================================================
  async _processSendQueue() {
    if (this._isSending || this._sendQueue.length === 0) return;
    this._isSending = true;

    const CHUNK_SIZE = 16 * 1024; // 16 KB
    const MAX_BUFFERED = 256 * 1024; // 256 KB max buffered amount before pausing

    while (this._sendQueue.length > 0) {
      const { file, transferId, sentBytes } = this._sendQueue[0];

      // Flow control: wait if buffer is full
      while (this._channel.bufferedAmount > MAX_BUFFERED) {
        await new Promise(resolve => {
          const handler = () => {
            this._channel.removeEventListener('bufferedamountlow', handler);
            resolve();
          };
          this._channel.addEventListener('bufferedamountlow', handler);
        });
      }

      const start = sentBytes;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const arrayBuffer = await chunk.arrayBuffer();

      // Send binary chunk
      this._channel.send(arrayBuffer);

      // Update progress
      const newSentBytes = end;
      const percent = Math.round((newSentBytes / file.size) * 100);
      const elapsedSeconds = (Date.now() - this._sendStartTime) / 1000;
      const speed = newSentBytes / elapsedSeconds; // bytes/sec
      const speedKbps = Math.round(speed / 1024);

      // Calculate ETA
      const remainingBytes = file.size - newSentBytes;
      const etaSeconds = Math.ceil(remainingBytes / speed);
      const etaMinutes = Math.floor(etaSeconds / 60);
      const etaSecondsDisplay = etaSeconds % 60;
      const etaText = etaMinutes > 0
        ? `${etaMinutes}m ${etaSecondsDisplay}s`
        : `${etaSecondsDisplay}s`;

      this.dispatchEvent(new CustomEvent('send-progress', {
        detail: {
          filename: file.name,
          transferId,
          percent,
          bytesTransferred: newSentBytes,
          totalBytes: file.size,
          speed: speedKbps + ' KB/s',
          eta: etaText,
          etaSeconds
        }
      }));

      // Check if transfer is complete
      if (newSentBytes >= file.size) {
        // Send end marker
        const endMarker = {
          type: 'file-end',
          transferId
        };
        this._channel.send(JSON.stringify(endMarker));
        console.log(`[FileTransfer] Sent file: ${file.name}`);

        this._sendQueue.shift();
        if (this._sendQueue.length > 0) {
          this._sendStartTime = Date.now();
        }
      } else {
        this._sendQueue[0].sentBytes = newSentBytes;
      }
    }

    this._isSending = false;
  }

  // ============================================================================
  // Receiving: handle incoming messages
  // ============================================================================
  _handleMessage(message) {
    const { type, transferId, name, size, mimeType } = message;

    if (type === 'file-start') {
      // Warn for large files on receive side too
      if (size > this.MAX_FILE_SIZE_WARNING) {
        this.dispatchEvent(new CustomEvent('recv-warning', {
          detail: {
            message: 'Large file incoming — keep this tab open',
            filename: name,
            size
          }
        }));
      }

      // Initialize receive buffer
      this._recvBuffer.set(transferId, {
        chunks: [],
        size,
        name,
        mimeType,
        receivedBytes: 0,
        startTime: Date.now()
      });

      this.dispatchEvent(new CustomEvent('receive-start', {
        detail: { filename: name, size, mimeType, transferId }
      }));
    } else if (type === 'file-end') {
      this._finalizeReceive(transferId);
    }
  }

  // ============================================================================
  // Receiving: handle binary chunks
  // ============================================================================
  _handleBinaryChunk(arrayBuffer) {
    // The first registered transfer gets this chunk
    // (assumes only one file transfer at a time; could be improved with transferId in binary)
    for (const [transferId, recv] of this._recvBuffer.entries()) {
      if (recv.receivedBytes < recv.size) {
        recv.chunks.push(arrayBuffer);
        recv.receivedBytes += arrayBuffer.byteLength;

        const percent = Math.round((recv.receivedBytes / recv.size) * 100);
        const speed = recv.receivedBytes / ((Date.now() - recv.startTime) / 1000);

        this.dispatchEvent(new CustomEvent('receive-progress', {
          detail: {
            filename: recv.name,
            transferId,
            percent,
            bytesReceived: recv.receivedBytes,
            totalBytes: recv.size,
            speed: Math.round(speed / 1024) + ' KB/s'
          }
        }));

        return;
      }
    }
  }

  // ============================================================================
  // Receiving: assemble and emit file blob
  // ============================================================================
  _finalizeReceive(transferId) {
    const recv = this._recvBuffer.get(transferId);
    if (!recv) return;

    // Assemble blob from chunks
    const blob = new Blob(recv.chunks, { type: recv.mimeType });

    this.dispatchEvent(new CustomEvent('receive-complete', {
      detail: {
        filename: recv.name,
        transferId,
        blob,
        mimeType: recv.mimeType,
        size: blob.size
      }
    }));

    console.log(`[FileTransfer] Received file: ${recv.name} (${blob.size} bytes)`);
    this._recvBuffer.delete(transferId);
  }

  // ============================================================================
  // Utility: trigger download of a received file
  // ============================================================================
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // Answerer side: listen for incoming data channel
  // ============================================================================
  listenForChannel(peerConnection) {
    peerConnection.addEventListener('datachannel', ({ channel }) => {
      if (channel.label === 'filetransfer') {
        this.attachChannel(channel);
      }
    });
  }

  // ============================================================================
  // Utility: check if channel is open
  // ============================================================================
  isOpen() {
    return this._channel && this._channel.readyState === 'open';
  }
}
