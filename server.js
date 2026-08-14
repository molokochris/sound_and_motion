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

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ lanUrls: getLanAddresses().map((ip) => `http://${ip}:${PORT}`), port: PORT }));
    return;
  }

  if (urlPath === '/') urlPath = '/host.html';
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
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
  try { conn.send(JSON.stringify(obj)); } catch (_) { /* ignore */ }
}

function broadcastToPlayers(room, obj, exceptId) {
  for (const [pid, p] of room.players) {
    if (pid === exceptId) continue;
    send(p.conn, obj);
  }
}

function playerListPayload(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({ id, name: p.name, color: p.color }));
}

function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  broadcastToPlayers(room, { type: 'room_closed', reason: reason || 'Host disconnected.' });
  for (const [, p] of room.players) p.conn.terminate();
  rooms.delete(code);
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

  conn.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    switch (msg.type) {
      // ---------------- HOST messages ----------------
      case 'host_create': {
        const code = makeRoomCode();
        rooms.set(code, { hostConn: conn, players: new Map(), colorIdx: 0 });
        role = 'host';
        roomCode = code;
        send(conn, { type: 'room_created', room: code });
        break;
      }

      case 'start_game': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'host') return;
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
        broadcastToPlayers(room, { type: 'game_over', results: msg.results || [] });
        break;
      }

      // ---------------- PLAYER (phone) messages ----------------
      case 'join': {
        const room = rooms.get(msg.room);
        if (!room) { send(conn, { type: 'join_error', reason: 'That room code was not found.' }); return; }
        if (room.players.size >= 8) { send(conn, { type: 'join_error', reason: 'Room is full (8 players max).' }); return; }

        const id = crypto.randomBytes(4).toString('hex');
        const color = PLAYER_COLORS[room.colorIdx % PLAYER_COLORS.length];
        room.colorIdx += 1;
        const name = (msg.name || 'Player').toString().slice(0, 14);

        room.players.set(id, { conn, name, color });
        role = 'player';
        roomCode = msg.room;
        playerId = id;

        send(conn, { type: 'joined', playerId: id, color, room: msg.room });
        send(room.hostConn, { type: 'player_joined', playerId: id, name, color });
        break;
      }

      case 'input': {
        const room = rooms.get(roomCode);
        if (!room || role !== 'player') return;
        // action: 'left' | 'right' | 'flap' | 'tilt'   value: boolean or number
        send(room.hostConn, { type: 'input', playerId, action: msg.action, value: msg.value });
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
      closeRoom(roomCode, 'Host disconnected.');
    } else if (role === 'player' && roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        room.players.delete(playerId);
        send(room.hostConn, { type: 'player_left', playerId });
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
  console.log(`  Host screen (open on laptop/TV):  http://localhost:${PORT}/host`);
  const lan = getLanAddresses();
  if (lan.length) {
    console.log('  Phones on the same WiFi, open:');
    lan.forEach((ip) => console.log(`    http://${ip}:${PORT}/controller`));
  } else {
    console.log('  Could not detect a LAN address — phones must reach this machine\'s IP manually.');
  }
  console.log('');
});
