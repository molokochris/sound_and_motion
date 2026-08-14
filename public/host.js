(() => {
  // ---------------------------------------------------------------------
  // Panel switching
  // ---------------------------------------------------------------------
  const panels = {
    lobby: document.getElementById('lobby'),
    countdown: document.getElementById('countdown-wrap'),
    game: document.getElementById('canvas-wrap'),
    results: document.getElementById('results'),
  };
  function showPanel(name) {
    Object.values(panels).forEach(p => { p.style.display = 'none'; });
    panels[name].style.display = 'flex';
  }

  const roomCodeEl = document.getElementById('room-code');
  const joinUrlsEl = document.getElementById('join-urls');
  const qrWrap = document.getElementById('qr-wrap');
  const qrImg = document.getElementById('qr-img');
  const playerGrid = document.getElementById('player-grid');
  const lobbyHint = document.getElementById('lobby-hint');
  const btnStart = document.getElementById('btn-start');
  const countdownEl = document.getElementById('countdown');
  const scoreboardEl = document.getElementById('scoreboard');
  const bpmTagEl = document.getElementById('bpm-tag');
  const resultsList = document.getElementById('results-list');
  const btnAgain = document.getElementById('btn-again');

  // ---------------------------------------------------------------------
  // WebSocket connection to the relay server
  // ---------------------------------------------------------------------
  let ws = null;
  let roomCode = null;
  const players = new Map(); // playerId -> player state (see makePlayer)

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  function connect() {
    ws = new WebSocket(wsUrl());
    ws.addEventListener('open', () => send({ type: 'host_create' }));
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    });
    ws.addEventListener('close', () => {
      lobbyHint.textContent = 'Connection lost. Reconnecting…';
      setTimeout(connect, 1500);
    });
  }
  function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        roomCode = msg.room;
        roomCodeEl.textContent = roomCode;
        loadJoinInfo();
        break;

      case 'player_joined':
        addPlayer(msg.playerId, msg.name, msg.color);
        break;

      case 'player_left':
        removePlayer(msg.playerId);
        break;

      case 'input':
        handleInput(msg.playerId, msg.action, msg.value);
        break;

      default:
        break;
    }
  }

  async function loadJoinInfo() {
    try {
      const res = await fetch('/api/info');
      const info = await res.json();
      const urls = (info.lanUrls && info.lanUrls.length) ? info.lanUrls : [location.origin];
      const joinUrl = `${urls[0]}/controller?room=${roomCode}`;
      joinUrlsEl.textContent = urls.map(u => `${u}/controller`).join('  •  ');
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(joinUrl)}`;
      qrImg.onload = () => qrWrap.classList.add('show');
      qrImg.onerror = () => qrWrap.classList.remove('show');
    } catch (_) {
      joinUrlsEl.textContent = `${location.origin}/controller`;
    }
  }

  // ---------------------------------------------------------------------
  // Lobby: player roster
  // ---------------------------------------------------------------------
  function addPlayer(id, name, color) {
    if (players.has(id)) return;
    players.set(id, makePlayer(id, name, color));
    renderLobby();
  }
  function removePlayer(id) {
    players.delete(id);
    renderLobby();
    // if this happens mid-game the physics loop simply skips missing/eliminated players
  }
  function renderLobby() {
    playerGrid.innerHTML = '';
    for (const p of players.values()) {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      chip.innerHTML = `<span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}`;
      playerGrid.appendChild(chip);
    }
    const n = players.size;
    lobbyHint.textContent = n === 0 ? 'Waiting for riders to join…' : `${n} rider${n>1?'s':''} ready`;
    btnStart.disabled = n < 1;
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ---------------------------------------------------------------------
  // Game constants & world
  // ---------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const LAVA_Y = H - 40;

  const GRAVITY = 0.30;
  const FLAP_IMPULSE = -6.6;
  const MAX_FALL = 7.5;
  const MOVE_ACCEL = 0.46;
  const AIR_DRAG = 0.965;
  const GROUND_FRICTION = 0.82;
  const START_LIVES = 3;
  const MATCH_SECONDS = 180;

  const platforms = [
    { x: 60,  y: 440, w: 170, h: 16 },
    { x: 670, y: 440, w: 170, h: 16 },
    { x: 20,  y: 330, w: 150, h: 16 },
    { x: 730, y: 330, w: 150, h: 16 },
    { x: 385, y: 360, w: 130, h: 16 },
    { x: 170, y: 220, w: 150, h: 16 },
    { x: 580, y: 220, w: 150, h: 16 },
    { x: 385, y: 110, w: 130, h: 16 },
  ];

  function makePlayer(id, name, color) {
    return {
      id, name, color,
      x: W/2 + (Math.random()-0.5)*100, y: 150 + Math.random()*80,
      vx: 0, vy: 0, w: 34, h: 26,
      facing: 1, wingPhase: Math.random()*Math.PI*2,
      alive: true, eliminated: false, lives: START_LIVES,
      score: 0, invuln: 60, respawnTimer: 0,
      controls: { left: false, right: false, tilt: 0, flapHeld: false, flapQueued: false },
      lastSentAlive: true, lastSentScore: -1,
    };
  }

  function handleInput(playerId, action, value) {
    const p = players.get(playerId);
    if (!p) return;
    if (action === 'left') p.controls.left = !!value;
    else if (action === 'right') p.controls.right = !!value;
    else if (action === 'tilt') p.controls.tilt = typeof value === 'number' ? value : 0;
    else if (action === 'flap') {
      const held = !!value;
      if (held && !p.controls.flapHeld) p.controls.flapQueued = true;
      p.controls.flapHeld = held;
    }
  }

  // ---------------------------------------------------------------------
  // Music engine — procedural beat clock (Web Audio API, no audio files)
  // ---------------------------------------------------------------------
  let audioCtx = null;
  let bpm = 128;
  let beatCount = 0;
  let nextNoteTime = 0;
  let schedulerTimer = null;
  let lastBeatAudioTime = 0;
  let beatIntervalSec = 60 / bpm;
  let gravityMultiplier = 1;
  let dropUntilBeat = -1;
  let shakeUntil = 0;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    beatCount = 0;
    bpm = 128;
    nextNoteTime = audioCtx.currentTime + 0.1;
    schedulerTimer = setInterval(schedulerTick, 25);
  }
  function stopAudio() {
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = null;
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
  }

  function schedulerTick() {
    if (!audioCtx) return;
    const scheduleAhead = 0.12;
    while (nextNoteTime < audioCtx.currentTime + scheduleAhead) {
      scheduleBeatSound(beatCount, nextNoteTime);
      const delay = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000);
      setTimeout(() => fireBeat(beatCount), delay);
      beatCount += 1;
      // gently ramp tempo up every 4 bars to build tension with the music
      if (beatCount % 16 === 0) bpm = Math.min(176, bpm + 4);
      beatIntervalSec = 60 / bpm;
      nextNoteTime += 60 / bpm;
    }
  }

  function scheduleBeatSound(beatIndex, time) {
    const isDownbeat = beatIndex % 4 === 0;
    playKick(time, isDownbeat ? 1.0 : 0.7);
    playHat(time + 0.0001);
    if (isDownbeat) playBass(time, beatIndex);
  }

  function playKick(time, vel) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(0.9 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(time); osc.stop(time + 0.25);
  }

  function playHat(time) {
    const bufSize = audioCtx.sampleRate * 0.05;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 7000;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start(time);
  }

  const BASS_NOTES = [55, 55, 82.4, 65.4]; // A1 A1 E2 C2 — simple 4-bar riff
  function playBass(time, beatIndex) {
    const bar = Math.floor(beatIndex / 4) % BASS_NOTES.length;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(BASS_NOTES[bar], time);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 400;
    osc.connect(filter).connect(gain).connect(audioCtx.destination);
    osc.start(time); osc.stop(time + 0.5);
  }

  function fireBeat(beatIndex) {
    lastBeatAudioTime = audioCtx ? audioCtx.currentTime : performance.now()/1000;
    const isDownbeat = beatIndex % 4 === 0;
    send({ type: 'beat', beatIndex, isDownbeat, bpm });
    bpmTagEl.textContent = `${bpm} BPM`;
    flashArena();

    // "the drop" — every 8 beats, gravity spikes for 2 beats: a rule
    // change driven directly by the music's structure.
    if (beatIndex % 8 === 0 && beatIndex > 0) {
      gravityMultiplier = 1.4;
      dropUntilBeat = beatIndex + 2;
      shakeUntil = performance.now() + 260;
    }
    if (beatIndex >= dropUntilBeat) gravityMultiplier = 1;
  }

  let arenaFlash = 0;
  function flashArena() { arenaFlash = 1; }

  function currentBeatPhaseSeconds() {
    if (!audioCtx) return 0;
    const t = audioCtx.currentTime - lastBeatAudioTime;
    return ((t % beatIntervalSec) + beatIntervalSec) % beatIntervalSec;
  }

  // ---------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------
  let particles = [];
  function spawnBurst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6-1, life: 26+Math.random()*18, color });
    }
  }

  function applyPhysics(p) {
    if (p.respawnTimer > 0) { p.respawnTimer -= 1; return; }
    if (!p.alive) return;

    const c = p.controls;
    if (Math.abs(c.tilt) > 0.05) {
      p.vx += c.tilt * MOVE_ACCEL * 1.6;
      p.facing = c.tilt >= 0 ? 1 : -1;
    } else {
      if (c.left) { p.vx -= MOVE_ACCEL; p.facing = -1; }
      if (c.right) { p.vx += MOVE_ACCEL; p.facing = 1; }
    }
    p.vx = Math.max(-4.3, Math.min(4.3, p.vx));

    if (c.flapQueued) {
      c.flapQueued = false;
      const phase = currentBeatPhaseSeconds();
      const distToBeat = Math.min(phase, beatIntervalSec - phase);
      const perfect = audioCtx && distToBeat < 0.13;
      p.vy = FLAP_IMPULSE * (perfect ? 1.35 : 1);
      if (perfect) { p.score += 10; spawnBurst(p.x + p.w/2, p.y + p.h/2, '#FFC857', 10); }
    }

    p.vy += GRAVITY * gravityMultiplier;
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;
    p.x += p.vx; p.y += p.vy;
    if (p.x + p.w < 0) p.x = W; if (p.x > W) p.x = -p.w;
    p.vx *= AIR_DRAG;

    for (const pl of platforms) {
      const withinX = p.x + p.w*0.25 < pl.x + pl.w && p.x + p.w*0.75 > pl.x;
      const prevBottom = p.y + p.h - p.vy;
      if (withinX && p.vy >= 0 && prevBottom <= pl.y + 2 && p.y + p.h >= pl.y && p.y + p.h <= pl.y + pl.h + 10) {
        p.y = pl.y - p.h; p.vy = 0; p.vx *= GROUND_FRICTION;
      }
    }
    if (p.y < 0) { p.y = 0; p.vy = 0; }

    if (p.y + p.h >= LAVA_Y) eliminateHit(p);
    if (p.invuln > 0) p.invuln -= 1;
  }

  function eliminateHit(p) {
    if (!p.alive) return;
    spawnBurst(p.x + p.w/2, p.y + p.h/2, p.color);
    p.alive = false;
    p.lives -= 1;
    if (p.lives <= 0) {
      p.eliminated = true;
    } else {
      p.respawnTimer = 70;
    }
  }

  function respawnIfReady(p) {
    if (!p.alive && !p.eliminated && p.respawnTimer === 0) {
      p.x = W/2 + (Math.random()-0.5)*140; p.y = 60; p.vx = 0; p.vy = 0;
      p.alive = true; p.invuln = 80;
    }
  }

  function ridersOverlap(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function resolveJousts() {
    const alivePlayers = [...players.values()].filter(p => p.alive);
    for (let i = 0; i < alivePlayers.length; i++) {
      for (let j = i+1; j < alivePlayers.length; j++) {
        const a = alivePlayers[i], b = alivePlayers[j];
        if (a.invuln > 0 || b.invuln > 0) continue;
        if (!ridersOverlap(a, b)) continue;
        const aC = a.y + a.h/2, bC = b.y + b.h/2, margin = 6;
        if (aC + margin < bC) {
          a.score += 100; spawnBurst(b.x+b.w/2, b.y+b.h/2, b.color);
          eliminateHit(b); a.vy = FLAP_IMPULSE * 0.55;
        } else if (bC + margin < aC) {
          b.score += 100; spawnBurst(a.x+a.w/2, a.y+a.h/2, a.color);
          eliminateHit(a); b.vy = FLAP_IMPULSE * 0.55;
        } else {
          const dir = a.x < b.x ? -1 : 1;
          a.vx += dir*3.2; b.vx -= dir*3.2; a.vy = -3; b.vy = -3;
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // Game state machine
  // ---------------------------------------------------------------------
  let gameRunning = false;
  let matchTimeLeft = MATCH_SECONDS;
  let lastFrameTime = 0;

  btnStart.addEventListener('click', () => {
    if (players.size < 1) return;
    initAudio();
    runCountdown();
  });

  function runCountdown() {
    showPanel('countdown');
    let n = 3;
    countdownEl.textContent = n;
    const iv = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(iv);
        beginMatch();
      } else {
        countdownEl.textContent = n;
      }
    }, 800);
  }

  function beginMatch() {
    for (const p of players.values()) {
      p.x = W/2 + (Math.random()-0.5)*160; p.y = 100 + Math.random()*100;
      p.vx = 0; p.vy = 0; p.alive = true; p.eliminated = false;
      p.lives = START_LIVES; p.score = 0; p.invuln = 90; p.respawnTimer = 0;
      p.lastSentAlive = true; p.lastSentScore = -1;
    }
    particles = [];
    matchTimeLeft = MATCH_SECONDS;
    gameRunning = true;
    showPanel('game');
    send({ type: 'start_game' });
    lastFrameTime = performance.now();
    requestAnimationFrame(loop);
  }

  function checkEndCondition() {
    const total = players.size;
    const active = [...players.values()].filter(p => !p.eliminated).length;
    if (matchTimeLeft <= 0) return true;
    if (total >= 2 && active <= 1) return true;
    return false;
  }

  function endMatch() {
    gameRunning = false;
    stopAudio();
    const ranked = [...players.values()].sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      return b.score - a.score;
    });
    const results = ranked.map((p, i) => ({ playerId: p.id, name: p.name, score: p.score, rank: i+1 }));
    send({ type: 'game_over', results });

    resultsList.innerHTML = '';
    ranked.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `<span class="rank">#${i+1}</span><span class="dot" style="background:${p.color}"></span><span class="name">${escapeHtml(p.name)}</span><span>${p.score}</span>`;
      resultsList.appendChild(row);
    });
    showPanel('results');
  }

  btnAgain.addEventListener('click', () => { showPanel('lobby'); renderLobby(); });

  function updateScoreboard() {
    scoreboardEl.innerHTML = '';
    for (const p of players.values()) {
      const el = document.createElement('div');
      el.className = 'sb-entry' + (p.eliminated ? ' dead' : '');
      el.innerHTML = `<span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)} ${p.score}`;
      scoreboardEl.appendChild(el);
    }
  }

  function syncPlayerStatuses() {
    for (const p of players.values()) {
      const aliveState = !p.eliminated;
      if (p.lastSentAlive !== aliveState || p.lastSentScore !== p.score) {
        send({ type: 'player_status', playerId: p.id, alive: aliveState, score: p.score });
        p.lastSentAlive = aliveState; p.lastSentScore = p.score;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  let torchFlicker = 0;
  function drawBackground() {
    ctx.save();
    let shakeX = 0, shakeY = 0;
    if (performance.now() < shakeUntil) {
      shakeX = (Math.random()-0.5) * 8; shakeY = (Math.random()-0.5) * 8;
      ctx.translate(shakeX, shakeY);
    }
    ctx.clearRect(-10, -10, W+20, H+20);
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0, '#0B0E23'); grad.addColorStop(0.6, '#1B1F3B'); grad.addColorStop(1, '#2b1030');
    ctx.fillStyle = grad; ctx.fillRect(-10,-10,W+20,H+20);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i=0;i<50;i++){ ctx.fillRect((i*97)%W, (i*53)%(H-180), 1.5, 1.5); }

    if (arenaFlash > 0.01) {
      ctx.fillStyle = `rgba(255,200,87,${arenaFlash*0.12})`;
      ctx.fillRect(-10,-10,W+20,H+20);
      arenaFlash *= 0.85;
    }

    drawTorch(16, H-150); drawTorch(W-16, H-150);
    ctx.restore();
  }
  function drawTorch(x,y) {
    torchFlicker += 0.15;
    const flick = Math.sin(torchFlicker + x) * 3;
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(x-3, y, 6, 44);
    const glow = ctx.createRadialGradient(x, y-10+flick, 2, x, y-10+flick, 30);
    glow.addColorStop(0, 'rgba(255,200,87,0.9)'); glow.addColorStop(1, 'rgba(255,122,61,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y-10+flick, 30, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FFC857'; ctx.beginPath(); ctx.ellipse(x, y-10+flick, 5, 9, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#FF7A3D'; ctx.beginPath(); ctx.ellipse(x, y-8+flick, 3, 6, 0, 0, Math.PI*2); ctx.fill();
  }

  function drawPlatforms() {
    for (const p of platforms) {
      ctx.fillStyle = '#3d3f5c'; ctx.fillRect(p.x, p.y+4, p.w, p.h-4);
      ctx.fillStyle = '#7A7F9E'; ctx.fillRect(p.x, p.y, p.w, 6);
      ctx.fillStyle = '#5a5e82';
      for (let bx=p.x; bx<p.x+p.w; bx+=20) ctx.fillRect(bx, p.y+6, 1, p.h-6);
    }
  }

  function drawLava() {
    const t = performance.now()/300;
    ctx.fillStyle = '#3a0d10'; ctx.fillRect(0, LAVA_Y, W, H-LAVA_Y);
    ctx.fillStyle = '#E63946';
    for (let x=0;x<W;x+=20){
      const wob = Math.sin(t+x*0.1)*4;
      ctx.beginPath(); ctx.moveTo(x, LAVA_Y+6+wob); ctx.lineTo(x+20, LAVA_Y+6+Math.sin(t+(x+20)*0.1)*4);
      ctx.lineTo(x+20,H); ctx.lineTo(x,H); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#FF7A3D';
    for (let x=0;x<W;x+=20){ ctx.fillRect(x, LAVA_Y+2+Math.sin(t+x*0.1)*4, 20, 3); }
  }

  function drawRider(p) {
    if (!p.alive) return;
    if (p.invuln > 0 && Math.floor(p.invuln/4)%2===0) return;
    ctx.save();
    ctx.translate(p.x + p.w/2, p.y + p.h/2);
    ctx.scale(p.facing, 1);
    p.wingPhase += 0.35 + Math.abs(p.vy)*0.03;
    const wingUp = Math.sin(p.wingPhase) * 10;

    ctx.fillStyle = shade(p.color, -25);
    ctx.beginPath(); ctx.ellipse(0, 4, 15, 9, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.quadraticCurveTo(-16, 2 - wingUp, -20, -6 - wingUp*0.5);
    ctx.quadraticCurveTo(-10, 2, -4, 6);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = shade(p.color, -25); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10,0); ctx.quadraticCurveTo(17,-10,15,-16); ctx.stroke();
    ctx.fillStyle = shade(p.color, -25);
    ctx.beginPath(); ctx.arc(15,-16,4,0,Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#E0A458'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-2,11); ctx.lineTo(-4,18); ctx.moveTo(4,11); ctx.lineTo(6,18); ctx.stroke();

    ctx.fillStyle = '#2A2A3D';
    ctx.beginPath(); ctx.ellipse(0,-6,6,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#E8C39E';
    ctx.beginPath(); ctx.arc(2,-13,4,0,Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#D8D2C4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4,-8); ctx.lineTo(26,-14); ctx.stroke();
    ctx.fillStyle = '#FFC857';
    ctx.beginPath(); ctx.moveTo(26,-14); ctx.lineTo(20,-11); ctx.lineTo(24,-9); ctx.closePath(); ctx.fill();

    ctx.restore();

    // name tag
    ctx.font = "10px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(244,233,216,0.85)';
    ctx.fillText(p.name.slice(0,10), p.x + p.w/2, p.y - 8);
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = Math.max(0, Math.min(255, (n>>16) + amt));
    let g = Math.max(0, Math.min(255, ((n>>8)&0xff) + amt));
    let b = Math.max(0, Math.min(255, (n&0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life/40);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x-2, pt.y-2, 4, 4);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    drawBackground();
    drawPlatforms();
    for (const p of players.values()) drawRider(p);
    drawParticles();
    drawLava();
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  function loop(now) {
    if (!gameRunning) return;
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    matchTimeLeft -= dt;

    for (const p of players.values()) {
      applyPhysics(p);
      respawnIfReady(p);
    }
    resolveJousts();

    for (const pt of particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life -= 1; }
    particles = particles.filter(pt => pt.life > 0);

    updateScoreboard();
    syncPlayerStatuses();
    draw();

    if (checkEndCondition()) { endMatch(); return; }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------
  renderLobby();
  connect();
})();
