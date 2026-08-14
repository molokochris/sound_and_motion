# SkyJoust Party

A Jackbox-style party joust. One laptop or TV is the arena. Everyone else
joins on their phone as a controller. Riders flap to fly, strike from
above, and ride a live synthesized beat — flap on the pulse for extra
lift, and watch out for "the drop" when gravity spikes.

**Live:** https://sound-and-motion.onrender.com

Phones do **not** need the same Wi‑Fi. Everything (pages + WebSocket) is
hosted on Render.

## Play (for judges and teammates)

1. Open **https://sound-and-motion.onrender.com** on a laptop (or a TV /
   shared screen). Tap **Host the arena**.
2. A 4-letter room code and QR appear. The QR is always
   `https://sound-and-motion.onrender.com/controller?room=ABCD` — scan it
   and the room code is already filled in. Or open **Join a room** and
   type the code + a name.
3. When names show up on the big screen, hit **START JOUST**.
4. Last rider standing — or highest score when the 3:00 clock runs out —
   wins.

If the first load takes ~30 seconds, the free Render instance was asleep.
Wait, then refresh once if the code is still `----`. Don’t close or
refresh the host tab mid-match.

**Playing over Discord / Zoom:** one person hosts and screen-shares the
arena tab. Everyone else joins on their phone. If a camera can’t read the
QR off a screen-share, tap **Copy join link** or type the 4-letter code.

## Controls

On the phone:

- Tap left / right to move, tap **FLAP** to fly.
- Optional: **Enable Tilt Controls** to steer by tilting (iOS asks once
  for motion permission).
- The phone buzzes on every beat. Flap on that buzz for a stronger
  "perfect flap" (+10).

On the arena:

- Hit another rider from **above** to unhorse them (+100).
- Don’t fall in the lava. Each rider has **3 lives**.
- Every 8 beats, **the drop** spikes gravity for two beats.

## Run it locally

Needs Node 18+. No `npm install` required to play.

```
node server.js
```

Then open http://localhost:3000 — landing page with **Host the arena**
and **Join a room**.

```
  SkyJoust Party server running
  --------------------------------
  Open this on any device:          http://localhost:3000/
  Host screen (laptop/TV):          http://localhost:3000/host
  Phones on the same WiFi, open:
    http://192.168.1.42:3000/controller
```

Local LAN play: phones on the same Wi‑Fi can use the printed
`/controller` URL, or scan the QR (it prefers the LAN address when the
host page itself is on localhost).

```
npm test
```

## How the pieces fit together

```
 phone (controller) ──┐
 phone (controller) ──┼── WebSocket ── server.js ── WebSocket ── host (big screen)
 phone (controller) ──┘        (relay only, no game logic)
```

| Piece | Role |
|---|---|
| `public/index.html` | Landing: host vs join |
| `public/host.html` / `host.js` | The whole game: physics, scoring, canvas, music |
| `public/controller.html` / `controller.js` | Phone input + haptics only |
| `server.js` | Static files + room relay (up to 8 riders) |
| `public/shared/qr.js` | Join QR generated in the browser (no third-party API) |

The host is the single source of truth — same model as Jackbox. Phones
only send `left` / `right` / `flap` / `tilt`. A phone can drop and
rejoin as the same rider. If the host tab is gone for more than ~12
seconds, the room closes.

Music is synthesized live with the Web Audio API (no audio files).

- **Perfect flaps** — within ~130ms of a beat: 35% more lift and +10.
- **The drop** — every 8 beats, gravity ×1.4 for two beats; screen shake.
- **Tempo ramp** — 128 BPM climbs toward 176 as the match goes on.

## Deploy

Pushes to `main` on [molokochris/sound_and_motion](https://github.com/molokochris/sound_and_motion)
are what Render should serve. If the live site still looks old, open the
Render dashboard for `sound-and-motion` and **Manual Deploy** the latest
`main` commit.

Do **not** use GitHub Pages for this game. Pages cannot host the
WebSocket relay.

## Notes

- Up to 8 riders per room. The canvas gets cramped past that.
- If a camera can’t read the QR, type the 4-letter code at `/controller`.
- Click the big room code on the host screen to copy it.
