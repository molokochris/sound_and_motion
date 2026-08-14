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

  // prefill room code from ?room= query param (used by QR code join links)
  const params = new URLSearchParams(location.search);
  if (params.get('room')) inputRoom.value = params.get('room').toUpperCase();

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

  function connect() {
    ws = new WebSocket(wsUrl());

    ws.addEventListener('open', () => {
      connBanner.classList.add('hidden');
      if (wantsReconnect && myRoom && myName) {
        send({ type: 'join', room: myRoom, name: myName });
      }
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      handleMessage(msg);
    });

    ws.addEventListener('close', () => {
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
        showScreen('waiting');
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

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connect();
      const trySend = () => {
        if (ws.readyState === WebSocket.OPEN) send({ type: 'join', room, name });
        else setTimeout(trySend, 100);
      };
      trySend();
    } else {
      send({ type: 'join', room, name });
    }
    setTimeout(() => { btnJoin.disabled = false; }, 1500);
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
