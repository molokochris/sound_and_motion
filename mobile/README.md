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

Uses Expo SDK 55 (current Expo Go). If install complains about peer
deps, the project has `.npmrc` with `legacy-peer-deps=true`.

## Android APK (no Expo Go)

A release APK is built locally here:

`mobile/dist/sound-and-music.apk`

Copy it to a phone and install it (allow unknown sources). Then open
**Sound and Music** and scan the host QR.

Rebuild later:

```
cd mobile
npx expo prebuild --platform android
cd android
gradlew.bat assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

Install **Expo Go** on a phone, then scan the Expo QR (not the game QR).
Once the app is open, scan the **host screen** QR to join a room.

The app talks to the same Render relay:

`wss://sound-and-motion.onrender.com/ws`

Judges can still join in the browser at `/controller`. This app is extra.
