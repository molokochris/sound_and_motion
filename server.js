// SkyJoust Party — server.js
// Zero external dependencies. Serves the host/controller pages and relays
// real-time messages between one "host" (the big screen) and many phone
// "controllers" over WebSockets.
//
// Design choice (why it's simple AND seamless):
// The HOST is the single source of truth. It runs the entire game
// simulation and renders it. Phones never simulate anything — they are
// pure input + haptic-feedback devices. That means we never have to
// reconcile physics state across devices with different clocks/latency;
// we only ever have to relay small "button down/up" and "beat" messages,
// which tolerate normal WiFi jitter just fine. This is the same model
// used by Jackbox-style party games and the original js.joust.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { WSServer } = require('./lib/miniws');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST_GRACE_MS = Number(process.env.ROOM_GRACE_MS) || 12000;
const PLAYER_GRACE_MS = Number(process.env.PLAYER_GRACE_MS) || 8000;

// ---------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function isPrivateHost(host) {
  const h = String(host || '').split(':')[0];
  if (!h || h === 'localhost' || h === '127.0.0.1') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function publicOriginFromReq(req) {
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  const xfHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!xfHost || isPrivateHost(xfHost)) return '';
  const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = xfProto || (process.env.RENDER || process.env.RENDER_EXTERNAL_URL ? 'https' : 'http');
  return `${proto}://${xfHost}`;
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Never advertise the container's private NIC — phones cannot reach it.
    const publicOrigin = publicOriginFromReq(req);
    const cloudHosted = !!(publicOrigin || process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
    const lanUrls = cloudHosted ? [] : getLanAddresses().map((ip) => `http://${ip}:${PORT}`);
    res.end(JSON.stringify({ lanUrls, port: PORT, publicOrigin }));
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/controller') urlPath = '/controller.html';
  if (urlPath === '/host') urlPath = '/host.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);
  // prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (ext === '.html' || ext === '.js') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------------
// Room management
// ---------------------------------------------------------------------
// rooms: Map<code, { hostConn, players: Map<playerId, {conn, name, color}>, colorIdx }>
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no O/I to avoid confusion
const PLAYER_COLORS = [
  '#4ECDC4', '#FF6B9D', '#FFD166', '#C77DFF',
  '#6BCB77', '#FF9F1C', '#5DA9E9', '#F25F5C',
];

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(conn, obj) {
  if (!conn) return;
  try { conn.send(JSON.stringify(obj)); } catch (_) { /* ignore */ }
}

function sendToHost(room, obj) {
  if (room) send(room.hostConn, obj);
}

function broadcastToPlayers(room, obj, exceptId) {
  for (const [pid, p] of room.players) {
    if (pid === exceptId || !p.conn) continue;
    send(p.conn, obj);
  }
}

function playerListPayload(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({ id, name: p.name, color: p.color }));
}

function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.hostGrace) { clearTimeout(room.hostGrace); room.hostGrace = null; }
  broadcastToPlayers(room, { type: 'room_closed', reason: reason || 'Host disconnected.' });
  for (const [, p] of room.players) {
    if (p.leaveTimer) clearTimeout(p.leaveTimer);
    if (p.conn) p.conn.terminate();
  }
  rooms.delete(code);
}

function attachHost(conn, existingCode) {
  if (existingCode) {
    const room = rooms.get(existingCode);
    if (room && (!room.hostConn || room.hostConn === conn)) {
      if (room.hostGrace) { clearTimeout(room.hostGrace); room.hostGrace = null; }
      room.hostConn = conn;
      send(conn, { type: 'room_created', room: existingCode });
      for (const [id, p] of room.players) {
        send(conn, { type: 'player_joined', playerId: id, name: p.name, color: p.color });
      }
      return existingCode;
    }
  }
  const code = makeRoomCode();
  rooms.set(code, { hostConn: conn, players: new Map(), colorIdx: 0, inProgress: false, hostGrace: null });
  send(conn, { type: 'room_created', room: code });
  return code;
}

// ---------------------------------------------------------------------
// WebSocket relay logic
// ---------------------------------------------------------------------
const wss = new WSServer();
wss.attach(server, '/ws');

wss.on('connection', (conn) => {
  let role = null;      // 'host' | 'player'
  let roomCode = null;
  let playerId = null;

  const pingIv = setInterval(() => {
    try { conn.ping(); } catch (_) { /* ignore */ }
  }, 25000);
  conn.on('close', () => clearInterval(pingIv));

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    switch (msg.type) {
      // ---------------- HOST messages ----------------
      case 'host_create': {
        role = 'host';
        roomCode = attachHost(conn, null);
        break;
      }

      case 'host_rejoin': {
        role = 'host';
        roomCode = attachHost(conn, (msg.room || '').toString().toUpperCase());
        break;
      }

      case 'start_game': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
        room.inProgress = true;
        broadcastToPlayers(room, { type: 'game_start' });
        break;
      }

      case 'beat': {
        // host's music scheduler ticks this out on every beat; relay to phones
        // so they can vibrate in time with the music.
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
        broadcastToPlayers(room, { type: 'beat', beatIndex: msg.beatIndex, isDownbeat: !!msg.isDownbeat, bpm: msg.bpm });
        break;
      }

      case 'player_status': {
        // host tells a specific phone its in-game status (alive/eliminated/rank/score)
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
        const target = room.players.get(msg.playerId);
        if (target) send(target.conn, { type: 'status', alive: msg.alive, rank: msg.rank, score: msg.score });
        break;
      }

      case 'game_over': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
        room.inProgress = false;
        broadcastToPlayers(room, { type: 'game_over', results: msg.results || [] });
        break;
      }

      // ---------------- PLAYER (phone) messages ----------------
      case 'join': {
        const code = (msg.room || '').toString().toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(conn, { type: 'join_error', reason: 'That room code was not found. Is the host screen still open?' }); return; }

        const name = (msg.name || 'Player').toString().slice(0, 14);
        const existingId = typeof msg.playerId === 'string' ? msg.playerId : '';
        const existing = existingId ? room.players.get(existingId) : null;

        if (existing) {
          if (existing.leaveTimer) { clearTimeout(existing.leaveTimer); existing.leaveTimer = null; }
          existing.conn = conn;
          if (name) existing.name = name;
          role = 'player';
          roomCode = code;
          playerId = existingId;
          send(conn, {
            type: 'joined', playerId: existingId, color: existing.color, room: code,
            rejoined: true, inProgress: !!room.inProgress,
          });
          break;
        }

        if (room.players.size >= 8) { send(conn, { type: 'join_error', reason: 'Room is full (8 players max).' }); return; }

        const id = crypto.randomBytes(4).toString('hex');
        const color = PLAYER_COLORS[room.colorIdx % PLAYER_COLORS.length];
        room.colorIdx += 1;

        room.players.set(id, { conn, name, color, leaveTimer: null });
        role = 'player';
        roomCode = code;
        playerId = id;

        send(conn, {
          type: 'joined', playerId: id, color, room: code,
          rejoined: false, inProgress: !!room.inProgress,
        });
        sendToHost(room, { type: 'player_joined', playerId: id, name, color });
        break;
      }

      case 'input': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'player') return;
        // action: 'left' | 'right' | 'flap' | 'tilt'   value: boolean or number
        sendToHost(room, { type: 'input', playerId, action: msg.action, value: msg.value });
        break;
      }

      case 'ping': {
        send(conn, { type: 'pong', t: msg.t });
        break;
      }

      default:
        break;
    }
  });

  conn.on('close', () => {
    if (role === 'host' && roomCode) {
      const room = rooms.get(roomCode);
      if (room && room.hostConn === conn) {
        room.hostConn = null;
        if (room.hostGrace) clearTimeout(room.hostGrace);
        room.hostGrace = setTimeout(() => closeRoom(roomCode, 'Host disconnected.'), HOST_GRACE_MS);
      }
    } else if (role === 'player' && roomCode) {
      const room = rooms.get(roomCode);
      const p = room && room.players.get(playerId);
      if (p && p.conn === conn) {
        p.conn = null;
        if (p.leaveTimer) clearTimeout(p.leaveTimer);
        p.leaveTimer = setTimeout(() => {
          if (!rooms.has(roomCode)) return;
          room.players.delete(playerId);
          sendToHost(room, { type: 'player_left', playerId });
        }, PLAYER_GRACE_MS);
      }
    }
  });
});

// ---------------------------------------------------------------------
// Helper: print LAN URLs on boot so phones on the same WiFi can join
// ---------------------------------------------------------------------
function getLanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log('');
  console.log('  SkyJoust Party server running');
  console.log('  --------------------------------');
  console.log(`  Open this on any device:          http://localhost:${PORT}/`);
  console.log(`  Host screen (laptop/TV):          http://localhost:${PORT}/host`);
  const lan = getLanAddresses();
  if (lan.length) {
    console.log('  Phones on the same WiFi, open:');
    lan.forEach((ip) => console.log(`    http://${ip}:${PORT}/controller`));
  } else {
    console.log('  Could not detect a LAN address — phones must reach this machine\'s IP manually.');
  }
  console.log('');
});
