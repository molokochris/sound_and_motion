// miniws.js — a tiny, dependency-free WebSocket server (RFC 6455 subset).
// Supports text frames, fragmentation (basic), close/ping/pong opcodes.
// Built so SkyJoust needs zero `npm install` to run.

const crypto = require('crypto');
const { EventEmitter } = require('events');

const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.alive = true;
    this._buf = Buffer.alloc(0);
    this._fragOpcode = null;
    this._fragChunks = [];

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
    socket.on('error', () => this._onClose());
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    // Try to parse as many complete frames as are buffered.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const frame = this._tryParseFrame(this._buf);
      if (!frame) break;
      this._buf = this._buf.subarray(frame.totalLength);
      this._handleFrame(frame);
    }
  }

  _tryParseFrame(buf) {
    if (buf.length < 2) return null;
    const byte0 = buf[0];
    const byte1 = buf[1];
    const fin = (byte0 & 0x80) !== 0;
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let len = byte1 & 0x7f;
    let offset = 2;

    if (len === 126) {
      if (buf.length < offset + 2) return null;
      len = buf.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (buf.length < offset + 8) return null;
      const hi = buf.readUInt32BE(offset);
      const lo = buf.readUInt32BE(offset + 4);
      len = hi * 2 ** 32 + lo; // fine for our small payloads
      offset += 8;
    }

    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + len) return null;

    let payload = buf.subarray(offset, offset + len);
    if (masked) {
      const unmasked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ maskKey[i % 4];
      payload = unmasked;
    }

    return { fin, opcode, payload, totalLength: offset + len };
  }

  _handleFrame(frame) {
    const { fin, opcode, payload } = frame;

    if (opcode === 0x8) { // close
      this._sendRaw(encodeFrame(Buffer.alloc(0), 0x8));
      this.socket.end();
      return;
    }
    if (opcode === 0x9) { // ping -> pong
      this._sendRaw(encodeFrame(payload, 0xA));
      return;
    }
    if (opcode === 0xA) { // pong
      this.alive = true;
      return;
    }

    if (opcode === 0x0) {
      // continuation
      this._fragChunks.push(payload);
    } else {
      this._fragOpcode = opcode;
      this._fragChunks = [payload];
    }

    if (fin) {
      const full = Buffer.concat(this._fragChunks);
      this._fragChunks = [];
      if (this._fragOpcode === 0x1) {
        this.emit('message', full.toString('utf8'));
      } else if (this._fragOpcode === 0x2) {
        this.emit('message', full);
      }
      this._fragOpcode = null;
    }
  }

  send(data) {
    if (this.socket.destroyed) return;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    this._sendRaw(encodeFrame(payload, 0x1));
  }

  ping() {
    this._sendRaw(encodeFrame(Buffer.alloc(0), 0x9));
  }

  _sendRaw(buf) {
    if (!this.socket.destroyed) {
      try { this.socket.write(buf); } catch (_) { /* ignore */ }
    }
  }

  _onClose() {
    if (this._closed) return;
    this._closed = true;
    this.emit('close');
  }

  terminate() {
    try { this.socket.destroy(); } catch (_) { /* ignore */ }
  }
}

function encodeFrame(payload, opcode) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

class WSServer extends EventEmitter {
  // Attaches to an existing http(s) server and handles 'upgrade' for a given path.
  attach(httpServer, path) {
    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url.split('?')[0] !== path) {
        socket.destroy();
        return;
      }
      const key = req.headers['sec-websocket-key'];
      if (!key) { socket.destroy(); return; }

      const accept = crypto
        .createHash('sha1')
        .update(key + MAGIC)
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ].join('\r\n');

      socket.write(responseHeaders);
      if (head && head.length) socket.unshift(head);

      const conn = new WSConnection(socket);
      this.emit('connection', conn, req);
    });
  }
}

module.exports = { WSServer };
