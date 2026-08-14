// WebSocket client for the existing Sound and Music relay.
// Same messages as public/controller.js — the host does not change.

const DEFAULT_WS = 'wss://sound-and-motion.onrender.com/ws';

export default class GameSocket {
  constructor({ url = DEFAULT_WS, onMessage, onOpen, onClose } = {}) {
    this.url = url;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.ws = null;
    this.keep = null;
    this.shouldReconnect = false;
    this.room = null;
    this.name = null;
    this.playerId = null;
  }

  connect() {
    this.shouldReconnect = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this._startKeepalive();
      if (this.room && this.name) {
        this.send({ type: 'join', room: this.room, name: this.name, playerId: this.playerId });
      }
      if (this.onOpen) this.onOpen();
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.type === 'joined') this.playerId = msg.playerId;
      if (msg.type === 'room_closed') this.stopReconnect();
      if (this.onMessage) this.onMessage(msg);
    };

    ws.onclose = () => {
      this._stopKeepalive();
      if (this.onClose) this.onClose();
      if (this.shouldReconnect) setTimeout(() => this.connect(), 1200);
    };

    ws.onerror = () => { /* close handler retries */ };
  }

  join(room, name) {
    this.room = room;
    this.name = name;
    this.connect();
    if (this.ws && this.ws.readyState === 1) {
      this.send({ type: 'join', room, name, playerId: this.playerId });
    }
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  input(action, value) {
    this.send({ type: 'input', action, value });
  }

  stopReconnect() {
    this.shouldReconnect = false;
    this._stopKeepalive();
    if (this.ws) {
      try { this.ws.close(); } catch (_) { /* ignore */ }
    }
  }

  _startKeepalive() {
    this._stopKeepalive();
    this.keep = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 20000);
  }

  _stopKeepalive() {
    if (this.keep) clearInterval(this.keep);
    this.keep = null;
  }
}
