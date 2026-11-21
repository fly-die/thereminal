<p align="center">
  <img src="docs/logo.svg" alt="thereminal logo" width="96" height="96">
</p>

# thereminal

A synthesizer you play with your hands in the air. Runs in the browser.

[![CI](https://github.com/fly-die/thereminal/actions/workflows/ci.yml/badge.svg)](https://github.com/fly-die/thereminal/actions/workflows/ci.yml)

Status: in development. Not deployed yet.

## What it does

- **Tracks** your hands through the webcam, 21 points per hand.
- **Plays** eight presets: theremin, glass-pad, sub-reese, fm-bell, kalimba, wind, acid and vox.
- **Stays local.** Camera frames are processed on your device and never uploaded.

## Play

| Gesture | Effect |
| --- | --- |
| Hand up / down | Pitch, snapped to the scale |
| Hand left / right | Tone of the preset |
| Open / close the hand | Louder and brighter, or quieter |
| Fist | Mute |
| Second hand up / down | Volume |
| Pinch thumb and finger | Strike a note (fm-bell, kalimba, acid) |

Keys: `1-8` preset, `space` mute, `s` scale, `k` root key, `[` `]` octave, `v` camera style, `h` hand overlay, `a` accent colour, `T` dark or light, `r` record, `?` help, `Cmd+K` or `Ctrl+K` all commands.

- **No camera?** The pointer plays instead: move over the frame, press to strike.
- **Record:** `r` saves up to 30 seconds of the camera view and sound as a video file.
- **Share:** the address bar always holds the current sound, for example `?p=glass-pad&s=minpent&k=C`.
- **Phone:** the camera fills the screen and the panels open from `menu`.

## How it works

    camera -> tracking -> smoothing -> mapping -> synthesis -> render

- **Tracking:** MediaPipe HandLandmarker, WASM with GPU delegate. Model and runtime are served from this site, no CDN.
- **Smoothing:** a One Euro filter. Steady when the hand rests, fast when it moves.
- **Mapping:** hand height to pitch, quantized to the scale with hysteresis so a note does not flicker at its border.
- **Synthesis:** Web Audio API, each preset a documented patch. Every parameter change is ramped, so there are no clicks. Preset levels are balanced by measurement, see `npm run measure`.
- **Render:** Canvas 2D. The camera is shown dimmed in black and white, or redrawn as ASCII, dither or edges.

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
| `npm run measure` | Render every preset offline and print level and brightness (dev server must be running) |

## Stack

TypeScript, Vite, MediaPipe Tasks Vision, Web Audio API, Canvas 2D, Vitest, ESLint.

## Deploy

It is a static site. `npm run build` writes everything to `dist/`, and `vercel.json` sets the cache headers. Any static host works.

## Credits

- [MediaPipe](https://github.com/google-ai-edge/mediapipe) hand landmark model and runtime, Apache 2.0.
- One Euro filter by Casiez, Roussel and Vogel (2012).
- [IBM Plex Mono](https://github.com/IBM/plex) typeface, OFL.

## License

[MIT](LICENSE).
