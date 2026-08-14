# Sound and Music — mobile controller

Optional React Native (Expo) app. The laptop host stays in the browser.
This app only replaces the phone page: scan the host QR, type a name,
then left / right / FLAP.

The scanner lives in its own file: `src/QrScanner.js`.
The app icon is the same bird-rider mark as the website favicon
(`assets/icon.png`, copied from `public/icon-512.png`).

## Run it

```
cd mobile
npm install
npx expo start
```

Install **Expo Go** on a phone, then scan the Expo QR (not the game QR).
Once the app is open, scan the **host screen** QR to join a room.

The app talks to the same Render relay:

`wss://sound-and-motion.onrender.com/ws`

Judges can still join in the browser at `/controller`. This app is extra.
