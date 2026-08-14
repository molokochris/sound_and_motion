# SkyJoust Party

A party game: one big screen (laptop/TV) hosts the arena, and everyone else
joins with their phone as a controller. Riders flap to fly, joust each
other by striking from above, and the whole match is driven by a live,
procedurally-generated beat — flap in time with the music for a stronger
lift, and watch out for "the drop" every few bars, when gravity spikes.

## Play it (hosted)

Live: **https://sound-and-motion.onrender.com**

Judges / anyone remote — you do **not** need the same Wi‑Fi.

1. Open that URL on a laptop (or TV / shared screen). Tap **Host the arena**.
2. Everyone else opens the camera on their phone and **scans the QR**, or
   opens the same site and taps **Join a room**, then types the 4-letter code
   plus a name.
3. When riders appear on the big screen, hit **START JOUST**.

The first load can take ~30 seconds if the free Render instance was asleep —
wait, then refresh once if you still see `----` instead of a room code.
Don't close or refresh the host tab mid-match.

No installs beyond Node itself — the WebSocket server is hand-written on
top of Node's built-in `http` module, so there's nothing to `npm install`.

## Run it

```
node server.js
```

You'll see something like:

```
  SkyJoust Party server running
  --------------------------------
  Host screen (open on laptop/TV):  http://localhost:3000/host
  Phones on the same WiFi, open:
    http://192.168.1.42:3000/controller
```

1. Open the site on the laptop or TV everyone can see and click **Host the
   arena** (or go straight to `/host`).
2. Everyone else scans the QR on the host screen — or opens `/controller`
   and types the 4-letter room code plus their name. Same Wi‑Fi is only
   required for a local `localhost` run; the hosted game works from anywhere.
3. Once at least one rider has joined, hit **START JOUST** on the host
   screen. Riders' phones jump to the play screen automatically.
4. Last rider standing (or highest score when the clock runs out) wins.

## Controls (on the phone)

- Tap left/right zones to move, tap **FLAP** to gain height.
- Or tap "Enable Tilt Controls" to steer by tilting the phone instead
  (iOS will ask for a one-time motion-permission confirmation).
- Your phone buzzes on every beat of the music — flapping right on that
  buzz gives you a stronger "perfect flap."

## How the pieces fit together

```
 phone (controller.html) ──┐
 phone (controller.html) ──┼── WebSocket ── server.js ── WebSocket ── host.html (big screen)
 phone (controller.html) ──┘        (relay only, no game logic)
```

- **server.js** is a plain relay. It knows about "rooms" (one host + up to
  8 phones) and forwards small JSON messages between them. It never runs
  any game logic itself.
- **host.html / host.js** is where the entire game actually lives: physics,
  collision, scoring, and the music engine (Web Audio API, synthesized
  live — no audio files, so nothing to license or download). It renders
  everything to a `<canvas>`.
- **controller.html / controller.js** is intentionally dumb: it only sends
  button-state changes (`left`/`right`/`flap`/`tilt`) and receives small
  status updates (`alive`, `score`, `beat` for vibration).

### Why phones don't run any simulation

Real-time physics is hard to keep in sync across several phones with
different WiFi latency and clock drift. Rather than fight that, only the
**host** simulates the world — phones are pure input devices, the same
model Jackbox-style party games use. That means the only things crossing
the network are tiny, order-tolerant messages ("flap key went down"),
which is exactly the kind of traffic normal home WiFi handles cleanly even
with 8 phones connected. It also means a phone can drop and rejoin without
ever corrupting the shared game state, since it never held any of that
state to begin with.

### Music-driven gameplay, specifically

- A `setInterval`-based lookahead scheduler drives a synthesized kick/hat/
  bass loop via the Web Audio API and ticks out a `beat` event over the
  WebSocket to every phone (which vibrates in time) and to the canvas
  (a light flash).
- **Perfect flaps**: flapping within ~130ms of a beat gives 35% more lift
  and bonus points — timing your flying to the music is rewarded.
- **The drop**: every 8 beats, gravity spikes 40% for two beats and the
  screen shakes — a hazard triggered directly by the music's structure,
  not a fixed timer.
- **Tempo ramp**: BPM climbs from 128 toward 176 over the course of a
  match, so the beat window (and the pace of drops) tightens as the game
  goes on.

## Known limitations / good next steps

- If a phone's WebSocket drops mid-match and reconnects, it rejoins as a
  *new* player rather than resuming its old one (simplest correct
  behavior for a v1; a rejoin token would fix this).
- The join QR is generated in the browser (no third-party QR API). If a
  camera can't read it, type the 4-letter code at `/controller` instead.
- Designed for up to 8 riders per room; the canvas layout starts to feel
  cramped much beyond that.
