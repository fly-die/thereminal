<p align="center">
  <img src="docs/logo.svg" alt="thereminal logo" width="96" height="96">
</p>

# thereminal

A synthesizer you play with your hands in the air. Runs in the browser.

Status: phase 0 spike. One sine voice, hand height sets pitch.

## What it does

- **Tracks** your hands through the webcam, 21 points per hand.
- **Plays** a synth voice from where your hand is. Higher hand, higher note.
- **Stays local.** Camera frames are processed on your device and never uploaded.

## How it works

    camera -> tracking -> smoothing -> mapping -> synthesis -> render

- **Tracking:** MediaPipe HandLandmarker, WASM with GPU delegate. Model and runtime are served from this site, no CDN.
- **Smoothing:** a One Euro filter. Steady when the hand rests, fast when it moves.
- **Mapping:** hand height to pitch on an exponential scale, so equal distance means equal interval.
- **Synthesis:** Web Audio API. Every parameter change is ramped, so there are no clicks.
- **Render:** Canvas 2D overlay on a dimmed, mirrored camera image.

## Privacy

There is no backend. The page asks for the camera, runs the hand model in your browser and plays sound. No frames, landmarks or audio leave the device.

## Run locally

```
npm install
npm run dev
```

Open the printed address, press enter and allow the camera. The first run copies the MediaPipe runtime into `public/`.

## Test

```
npm test
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type check and production build |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript only |

## Stack

TypeScript, Vite, MediaPipe Tasks Vision, Web Audio API, Canvas 2D, Vitest, ESLint.

## Credits

- [MediaPipe](https://github.com/google-ai-edge/mediapipe) hand landmark model and runtime, Apache 2.0.
- One Euro filter by Casiez, Roussel and Vogel (2012).
- [IBM Plex Mono](https://github.com/IBM/plex) typeface, OFL.

## License

[MIT](LICENSE).
