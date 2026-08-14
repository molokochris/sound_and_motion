(() => {
  const screens = {
    join: document.getElementById('screen-join'),
    waiting: document.getElementById('screen-waiting'),
    play: document.getElementById('screen-play'),
    end: document.getElementById('screen-end'),
  };
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  const inputRoom = document.getElementById('input-room');
  const inputName = document.getElementById('input-name');
  const btnJoin = document.getElementById('btn-join');
  const joinError = document.getElementById('join-error');
  const myAvatar = document.getElementById('my-avatar');
  const waitingName = document.getElementById('waiting-name');
  const btnMotion = document.getElementById('btn-motion');
  const connBanner = document.getElementById('conn-banner');

  const zoneLeft = document.getElementById('zone-left');
  const zoneRight = document.getElementById('zone-right');
  const zoneFlap = document.getElementById('zone-flap');
  const tiltIndicator = document.getElementById('tilt-indicator');
  const beatPulse = document.getElementById('beat-pulse');
  const playStatus = document.getElementById('play-status');
  const playScore = document.getElementById('play-score');
  const endTitle = document.getElementById('end-title');
  const endDetail = document.getElementById('end-detail');

  // QR / copy-link is always: /controller?room=ABCD
  // Drop that into the room field so the player only types a name.
  const params = new URLSearchParams(location.search);
  const joinHint = document.getElementById('join-hint');
  const roomFromUrl = (params.get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (roomFromUrl) {
    inputRoom.value = roomFromUrl;
    if (joinHint) joinHint.textContent = 'Room code filled from the link — just enter your name.';
    document.title = `SkyJoust — Join ${roomFromUrl}`;
    setTimeout(() => inputName.focus(), 50);
  }
  try {
    const savedName = localStorage.getItem('skyjoust-name');
    if (savedName && !inputName.value) inputName.value = savedName;
  } catch (_) { /* private mode */ }

  inputRoom.addEventListener('input', () => {
    inputRoom.value = inputRoom.value.toUpperCase().replace(/[^A-Z]/g, '');
  });

  // ---------------- WebSocket connection ----------------
  let ws = null;
  let myColor = '#4ECDC4';
  let myRoom = null, myName = null, myPlayerId = null;
  let wantsReconnect = false;
  let usingTilt = false;

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  let keepaliveTimer = null;
  function startKeepalive() {
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => send({ type: 'ping', t: Date.now() }), 20000);
  }

  function connect() {
    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => {
      connBanner.classList.add('hidden');
      startKeepalive();
      if (wantsReconnect && myRoom && myName) {
        send({ type: 'join', room: myRoom, name: myName, playerId: myPlayerId });
      }
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    });

    ws.addEventListener('close', () => {
      if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
      if (wantsReconnect) {
        connBanner.classList.remove('hidden');
        setTimeout(connect, 1200);
      }
    });

    ws.addEventListener('error', () => { /* close handler will retry */ });
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'joined':
        myPlayerId = msg.playerId;
        myColor = msg.color;
        myAvatar.style.background = myColor;
        myAvatar.style.color = myColor;
        waitingName.textContent = `You're in as ${myName}`;
        if (msg.inProgress) showScreen('play');
        else if (!screens.play.classList.contains('active') && !screens.end.classList.contains('active')) {
          showScreen('waiting');
        }
        break;

      case 'join_error':
        joinError.textContent = msg.reason;
        btnJoin.disabled = false;
        break;

      case 'game_start':
        playStatus.textContent = 'ALIVE';
        playStatus.classList.remove('dead');
        playScore.textContent = '0';
        showScreen('play');
        break;

      case 'status':
        playScore.textContent = String(msg.score ?? 0);
        if (msg.alive === false) {
          playStatus.textContent = 'OUT';
          playStatus.classList.add('dead');
        } else {
          playStatus.textContent = 'ALIVE';
          playStatus.classList.remove('dead');
        }
        break;

      case 'beat':
        pulseBeat(msg.isDownbeat);
        break;

      case 'game_over': {
        const mine = (msg.results || []).find(r => r.playerId === myPlayerId);
        if (mine) {
          endTitle.textContent = mine.rank === 1 ? 'VICTORY!' : `RANK #${mine.rank}`;
          endDetail.textContent = `Final score: ${mine.score}`;
        } else {
          endTitle.textContent = 'GAME OVER';
          endDetail.textContent = 'Watch the big screen for full results.';
        }
        showScreen('end');
        setTimeout(() => showScreen('waiting'), 6000);
        break;
      }

      case 'room_closed':
        wantsReconnect = false;
        joinError.textContent = msg.reason || 'Room closed.';
        showScreen('join');
        break;

      default:
        break;
    }
  }

  function pulseBeat(isDownbeat) {
    beatPulse.classList.remove('fade');
    beatPulse.classList.add('on');
    setTimeout(() => {
      beatPulse.classList.remove('on');
      beatPulse.classList.add('fade');
    }, 60);
    if (navigator.vibrate) navigator.vibrate(isDownbeat ? 45 : 18);
  }

  // ---------------- Join flow ----------------
  btnJoin.addEventListener('click', () => {
    const room = inputRoom.value.trim().toUpperCase();
    const name = (inputName.value.trim() || 'Player').slice(0, 14);
    if (room.length !== 4) { joinError.textContent = 'Enter the 4-letter room code.'; return; }

    joinError.textContent = '';
    btnJoin.disabled = true;
    myRoom = room; myName = name;
    wantsReconnect = true;
    try { localStorage.setItem('skyjoust-name', name); } catch (_) { /* ignore */ }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connect();
      const trySend = () => {
        if (ws.readyState === WebSocket.OPEN) send({ type: 'join', room, name, playerId: myPlayerId });
        else setTimeout(trySend, 100);
      };
      trySend();
    } else {
      send({ type: 'join', room, name, playerId: myPlayerId });
    }
    setTimeout(() => { btnJoin.disabled = false; }, 1500);
  });

  [inputRoom, inputName].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnJoin.click();
    });
  });

  // ---------------- Touch controls ----------------
  function bindZone(el, action) {
    const setState = (v) => (e) => {
      e.preventDefault();
      el.classList.toggle('pressed', v);
      send({ type: 'input', action, value: v });
    };
    el.addEventListener('touchstart', setState(true), { passive: false });
    el.addEventListener('touchend', setState(false), { passive: false });
    el.addEventListener('touchcancel', setState(false), { passive: false });
    el.addEventListener('mousedown', setState(true));
    el.addEventListener('mouseup', setState(false));
    el.addEventListener('mouseleave', setState(false));
  }
  bindZone(zoneLeft, 'left');
  bindZone(zoneRight, 'right');
  bindZone(zoneFlap, 'flap');

  // ---------------- Tilt controls (optional "instrument" mode) ----------------
  btnMotion.addEventListener('click', async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { joinError.textContent = ''; return; }
      } catch (_) { return; }
    }
    usingTilt = !usingTilt;
    btnMotion.classList.toggle('on', usingTilt);
    btnMotion.textContent = usingTilt ? 'TILT CONTROLS ON' : 'ENABLE TILT CONTROLS';
    zoneLeft.classList.toggle('hidden', usingTilt);
    zoneRight.classList.toggle('hidden', usingTilt);
    tiltIndicator.classList.toggle('hidden', !usingTilt);
  });

  let lastTiltSent = 0;
  window.addEventListener('deviceorientation', (e) => {
    if (!usingTilt) return;
    const gamma = Math.max(-45, Math.min(45, e.gamma || 0)); // left/right tilt
    const now = performance.now();
    if (now - lastTiltSent < 50) return; // throttle to ~20/s
    lastTiltSent = now;
    const norm = gamma / 45; // -1..1
    send({ type: 'input', action: 'tilt', value: norm });
    tiltIndicator.style.left = `calc(50% + ${norm * 45}%)`;
  });

  // don't let the page sleep mid-game if possible
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* not fatal */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  requestWakeLock();

  connect();
})();
