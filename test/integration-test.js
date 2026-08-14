const { spawn } = require('child_process');
const path = require('path');

const PORT = 4123;
const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT) },
});

let serverOutput = '';
server.stdout.on('data', (d) => { serverOutput += d.toString(); });
server.stderr.on('data', (d) => { console.error('SERVER STDERR:', d.toString()); });

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  await wait(600); // let server boot

  const results = { pass: [], fail: [] };
  function check(name, cond) {
    (cond ? results.pass : results.fail).push(name);
    console.log((cond ? 'PASS ' : 'FAIL ') + name);
  }

  // ---- basic HTTP static + API checks ----
  const infoRes = await fetch(`http://localhost:${PORT}/api/info`);
  const info = await infoRes.json();
  check('api/info returns port', info.port === PORT);

  const hostPageRes = await fetch(`http://localhost:${PORT}/host`);
  check('host page 200', hostPageRes.status === 200);
  const controllerPageRes = await fetch(`http://localhost:${PORT}/controller`);
  check('controller page 200', controllerPageRes.status === 200);
  const notFoundRes = await fetch(`http://localhost:${PORT}/nope.html`);
  check('missing file 404', notFoundRes.status === 404);

  // ---- WebSocket flow: host creates room, two players join, input relays ----
  const hostWs = new WebSocket(`ws://localhost:${PORT}/ws`);
  const hostMessages = [];
  hostWs.addEventListener('message', (e) => hostMessages.push(JSON.parse(e.data)));
  await new Promise((res) => hostWs.addEventListener('open', res));
  hostWs.send(JSON.stringify({ type: 'host_create' }));
  await wait(200);

  const created = hostMessages.find(m => m.type === 'room_created');
  check('room_created received', !!created && /^[A-Z]{4}$/.test(created.room));
  const roomCode = created.room;

  const p1 = new WebSocket(`ws://localhost:${PORT}/ws`);
  const p1Messages = [];
  p1.addEventListener('message', (e) => p1Messages.push(JSON.parse(e.data)));
  await new Promise((res) => p1.addEventListener('open', res));
  p1.send(JSON.stringify({ type: 'join', room: roomCode, name: 'Alice' }));
  await wait(150);

  const joined1 = p1Messages.find(m => m.type === 'joined');
  check('player 1 joined ack', !!joined1 && joined1.room === roomCode);
  const p1Id = joined1.playerId;

  const hostSawJoin = hostMessages.find(m => m.type === 'player_joined' && m.name === 'Alice');
  check('host notified of player_joined', !!hostSawJoin && hostSawJoin.playerId === p1Id);

  const p2 = new WebSocket(`ws://localhost:${PORT}/ws`);
  const p2Messages = [];
  p2.addEventListener('message', (e) => p2Messages.push(JSON.parse(e.data)));
  await new Promise((res) => p2.addEventListener('open', res));
  p2.send(JSON.stringify({ type: 'join', room: roomCode, name: 'Bob' }));
  await wait(150);
  const joined2 = p2Messages.find(m => m.type === 'joined');
  check('player 2 joined ack', !!joined2);
  check('players got different colors', joined1.color !== joined2.color);

  // bad room code
  const p3 = new WebSocket(`ws://localhost:${PORT}/ws`);
  const p3Messages = [];
  p3.addEventListener('message', (e) => p3Messages.push(JSON.parse(e.data)));
  await new Promise((res) => p3.addEventListener('open', res));
  p3.send(JSON.stringify({ type: 'join', room: 'ZZZZ', name: 'Ghost' }));
  await wait(150);
  check('bad room code rejected', !!p3Messages.find(m => m.type === 'join_error'));

  // input relay: player -> server -> host
  hostMessages.length = 0;
  p1.send(JSON.stringify({ type: 'input', action: 'flap', value: true }));
  await wait(150);
  const inputMsg = hostMessages.find(m => m.type === 'input');
  check('input relayed to host with correct playerId/action', !!inputMsg && inputMsg.playerId === p1Id && inputMsg.action === 'flap' && inputMsg.value === true);

  // host -> beat -> both players
  p1Messages.length = 0; p2Messages.length = 0;
  hostWs.send(JSON.stringify({ type: 'beat', beatIndex: 4, isDownbeat: true, bpm: 128 }));
  await wait(150);
  check('player1 received beat', !!p1Messages.find(m => m.type === 'beat' && m.isDownbeat === true));
  check('player2 received beat', !!p2Messages.find(m => m.type === 'beat' && m.isDownbeat === true));

  // host -> game_start -> both players
  p1Messages.length = 0; p2Messages.length = 0;
  hostWs.send(JSON.stringify({ type: 'start_game' }));
  await wait(150);
  check('player1 received game_start', !!p1Messages.find(m => m.type === 'game_start'));
  check('player2 received game_start', !!p2Messages.find(m => m.type === 'game_start'));

  // player disconnect -> host notified
  hostMessages.length = 0;
  p2.close();
  await wait(250);
  check('host notified of player_left', !!hostMessages.find(m => m.type === 'player_left'));

  // host disconnect -> remaining player notified room closed
  p1Messages.length = 0;
  hostWs.close();
  await wait(250);
  check('remaining player notified room_closed', !!p1Messages.find(m => m.type === 'room_closed'));

  p1.close(); p3.close();
  await wait(100);

  console.log('\n---- SUMMARY ----');
  console.log(`${results.pass.length} passed, ${results.fail.length} failed`);
  if (results.fail.length) {
    console.log('FAILED:', results.fail);
  }

  server.kill();
  process.exit(results.fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  server.kill();
  process.exit(1);
});
