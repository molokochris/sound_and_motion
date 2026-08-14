const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ---- In-memory game state ----
// rooms: { [roomCode]: { hostSocketId, phase: 'lobby'|'live'|'freeze'|'ended',
//   players: { [socketId]: { name, alive, lastMagnitude, socketId } } } }
const rooms = {};

const MOVEMENT_THRESHOLD = 1.6; // tune based on testing — accel magnitude delta that counts as "moved"
const FREEZE_GRACE_MS = 600; // grace period after freeze starts before eliminations trigger

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? makeRoomCode() : code;
}

function publicPlayerList(room) {
  return Object.values(room.players).map((p) => ({
    name: p.name,
    alive: p.alive,
    socketId: p.socketId,
  }));
}

io.on("connection", (socket) => {
  // Host creates a room
  socket.on("host:create", (cb) => {
    const code = makeRoomCode();
    rooms[code] = { hostSocketId: socket.id, phase: "lobby", players: {} };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;
    cb({ roomCode: code });
  });

  // Player joins a room from their phone
  socket.on("player:join", ({ roomCode, name }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ error: "Room not found" });
    room.players[socket.id] = { name: name || "Player", alive: true, lastMagnitude: 0, socketId: socket.id };
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost = false;
    cb({ ok: true });
    io.to(room.hostSocketId).emit("host:playersUpdate", publicPlayerList(room));
    io.to(roomCode).emit("host:playersUpdate", publicPlayerList(room));
  });

  // Host starts the round
  socket.on("host:startRound", () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    Object.values(room.players).forEach((p) => (p.alive = true));
    room.phase = "live"; // movement allowed, no eliminations yet (like normal joust "chaos" period)
    io.to(socket.data.roomCode).emit("game:phase", { phase: "live" });
    io.to(socket.data.roomCode).emit("host:playersUpdate", publicPlayerList(room));
  });

  // Host triggers a "freeze" beat — tie this to your music cue points
  socket.on("host:triggerFreeze", () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    room.phase = "freeze";
    room.freezeStartedAt = Date.now();
    io.to(socket.data.roomCode).emit("game:phase", { phase: "freeze" });
  });

  socket.on("host:endFreeze", () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    room.phase = "live";
    io.to(socket.data.roomCode).emit("game:phase", { phase: "live" });
  });

  // Player phone streams motion data
  socket.on("player:motion", (magnitude) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.alive) return;
    player.lastMagnitude = magnitude;

    if (room.phase === "freeze" && Date.now() - room.freezeStartedAt > FREEZE_GRACE_MS) {
      if (magnitude > MOVEMENT_THRESHOLD) {
        player.alive = false;
        io.to(room.hostSocketId).emit("host:playerEliminated", { name: player.name, socketId: socket.id });
        io.to(socket.data.roomCode).emit("host:playersUpdate", publicPlayerList(room));
        socket.emit("player:eliminated");

        // Check for a winner
        const alivePlayers = Object.values(room.players).filter((p) => p.alive);
        if (alivePlayers.length === 1 && Object.keys(room.players).length > 1) {
          room.phase = "ended";
          io.to(socket.data.roomCode).emit("game:winner", { name: alivePlayers[0].name });
        } else if (alivePlayers.length === 0) {
          room.phase = "ended";
          io.to(socket.data.roomCode).emit("game:winner", { name: null });
        }
      }
    }
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.data.isHost) {
      // Host left — close the room
      io.to(roomCode).emit("game:hostLeft");
      delete rooms[roomCode];
    } else if (room.players[socket.id]) {
      delete room.players[socket.id];
      io.to(room.hostSocketId).emit("host:playersUpdate", publicPlayerList(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`JS Joust server running on port ${PORT}`));
