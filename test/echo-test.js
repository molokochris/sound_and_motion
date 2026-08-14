const http = require('http');
const { WSServer } = require('../lib/miniws');

const server = http.createServer((req, res) => { res.end('ok'); });
const wss = new WSServer();
wss.attach(server, '/ws');

wss.on('connection', (conn) => {
  conn.on('message', (msg) => {
    conn.send('echo:' + msg);
  });
});

server.listen(0, async () => {
  const port = server.address().port;
  const ws = new WebSocket(`ws://localhost:${port}/ws`);

  let received = [];
  ws.addEventListener('open', () => {
    ws.send('hello');
    ws.send('x'.repeat(200)); // trigger 16-bit length branch
  });
  ws.addEventListener('message', (ev) => {
    received.push(ev.data);
    if (received.length === 2) {
      console.log('MSG1_OK:', received[0] === 'echo:hello');
      console.log('MSG2_OK:', received[1] === 'echo:' + 'x'.repeat(200));
      ws.close();
      server.close(() => process.exit(0));
    }
  });
  ws.addEventListener('error', (e) => { console.log('WS_ERROR', e.message); process.exit(1); });

  setTimeout(() => { console.log('TIMEOUT_FAIL'); process.exit(1); }, 4000);
});
