// Phase 0 spike: hand tracking + one sine voice + dots overlay + honest timing numbers.
// Everything runs on the main thread on purpose, this is what we are measuring.

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { heightToUnit, unitToFreq } from './input/mapping';
import { OneEuro } from './input/oneEuro';

const ACCENT = '#7dffa0'; // placeholder, accent is decided in phase 2
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const PALM = [0, 5, 9, 13, 17] as const;
const HOLD_MS = 150; // keep sounding this long after the hand is lost
const F_LOW = 130.81; // C3
const OCTAVES = 3;

const must = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const video = must<HTMLVideoElement>('#cam');
const canvas = must<HTMLCanvasElement>('#view');
const boot = must<HTMLElement>('#boot');
const statusEl = must<HTMLElement>('#status');
const g = canvas.getContext('2d');
if (!g) throw new Error('2d context unavailable');

// ---------- state ----------
let hands: NormalizedLandmark[][] = [];
let lastSeen = -Infinity;
let sounding = false;
let muted = false;
let smoothing = true;
let delegate: 'GPU' | 'CPU' = 'GPU';
let pitchHz = 0;

const fy = new OneEuro({ minCutoff: 1.2, beta: 8, dCutoff: 1 });

// ---------- metrics ----------
const ema = (prev: number, next: number, k = 0.1): number =>
  prev === 0 ? next : prev + k * (next - prev);
let inferMs = 0;
let camToLandmarkMs = 0; // camera capture -> landmarks ready, when the browser reports capture time
let hasCaptureTime = false;
let detections = 0;
let trackFps = 0;
let renders = 0;
let renderFps = 0;
let lastFpsAt = performance.now();

// ---------- audio ----------
let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let amp: GainNode | null = null;

function initAudio(): void {
  ctx = new AudioContext({ latencyHint: 'interactive' });
  osc = new OscillatorNode(ctx, { type: 'sine', frequency: 220 });
  amp = new GainNode(ctx, { gain: 0 });
  // Safety net so the spike can never blast. The real master chain comes in phase 1.
  const limiter = new DynamicsCompressorNode(ctx, {
    threshold: -12, knee: 6, ratio: 12, attack: 0.003, release: 0.15,
  });
  osc.connect(amp).connect(limiter).connect(ctx.destination);
  osc.start();
}

function setVoice(freq: number | null): void {
  if (!ctx || !osc || !amp) return;
  const now = ctx.currentTime;
  if (freq !== null) {
    // Short time constant: fast enough to feel direct, long enough to hide frame steps.
    osc.frequency.setTargetAtTime(freq, now, 0.012);
    pitchHz = freq;
  }
  const on = freq !== null && !muted;
  if (on !== sounding) {
    amp.gain.setTargetAtTime(on ? 0.2 : 0, now, on ? 0.02 : 0.06);
    sounding = on;
  }
}

// ---------- tracking ----------
let landmarker: HandLandmarker | null = null;

async function loadTracker(): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const make = (d: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate: d },
      runningMode: 'VIDEO',
      numHands: 2,
    });
  try {
    landmarker = await make('GPU');
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    delegate = 'CPU';
    landmarker = await make('CPU');
  }
}

function onFrame(now: number, captureTime: number | undefined): void {
  if (!landmarker || document.hidden || video.readyState < 2) return;

  const t0 = performance.now();
  const result = landmarker.detectForVideo(video, now);
  const t1 = performance.now();

  inferMs = ema(inferMs, t1 - t0);
  if (captureTime !== undefined) {
    const age = t1 - captureTime;
    // Only trust it when it is on the same clock as performance.now().
    if (age > 0 && age < 1000) {
      camToLandmarkMs = ema(camToLandmarkMs, age);
      hasCaptureTime = true;
    }
  }
  detections++;
  hands = result.landmarks;

  const hand = hands[0];
  if (!hand) return;
  lastSeen = t1;

  // Palm centre is steadier than any single fingertip.
  let y = 0;
  for (const i of PALM) {
    const p = hand[i];
    if (!p) return;
    y += p.y;
  }
  y /= PALM.length;
  if (smoothing) y = fy.filter(y, t1 / 1000);

  // Height sets pitch. Horizontal position is unused in the spike.
  setVoice(unitToFreq(heightToUnit(y), F_LOW, OCTAVES));
}

function startTrackingLoop(): void {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    // Fires once per new camera frame, so we never run the model twice on one frame.
    const step: VideoFrameRequestCallback = (now, meta) => {
      onFrame(now, meta.captureTime);
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  } else {
    let lastTime = -1;
    const step = (now: number): void => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        onFrame(now, undefined);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---------- render ----------
function render(): void {
  requestAnimationFrame(render);
  if (!g) return;
  const now = performance.now();
  renders++;

  if (now - lastSeen > HOLD_MS) {
    if (hands.length > 0 || sounding) {
      hands = [];
      fy.reset();
      setVoice(null);
    }
  }

  const w = canvas.width;
  const h = canvas.height;
  g.save();
  g.translate(w, 0);
  g.scale(-1, 1); // mirror, so moving right moves right
  g.globalAlpha = 0.35;
  g.filter = 'grayscale(1)';
  if (video.readyState >= 2) g.drawImage(video, 0, 0, w, h);
  g.filter = 'none';
  g.globalAlpha = 1;
  g.fillStyle = ACCENT;
  for (const hand of hands) {
    hand.forEach((p, i) => {
      g.beginPath();
      g.arc(p.x * w, p.y * h, FINGERTIPS.has(i) ? 7 : 3.5, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.restore();

  if (now - lastFpsAt >= 1000) {
    const dt = (now - lastFpsAt) / 1000;
    trackFps = detections / dt;
    renderFps = renders / dt;
    detections = 0;
    renders = 0;
    lastFpsAt = now;
    updateStatus();
  }
}

function updateStatus(): void {
  const audioOutMs = ctx ? (ctx.baseLatency + (ctx.outputLatency || 0)) * 1000 : 0;
  const cam = hasCaptureTime ? `${camToLandmarkMs.toFixed(0)}ms` : 'n/a';
  const parts = [
    'thereminal spike',
    `hands ${hands.length}`,
    sounding ? `${pitchHz.toFixed(0)}Hz` : muted ? 'muted' : 'silent',
    `track ${trackFps.toFixed(0)}fps`,
    `render ${renderFps.toFixed(0)}fps`,
    `infer ${inferMs.toFixed(1)}ms (${delegate})`,
    `cam>landmark ${cam}`,
    `audio out ${audioOutMs.toFixed(0)}ms`,
    `smoothing ${smoothing ? 'on' : 'off'}`,
    '[f] smoothing  [space] mute',
  ];
  statusEl.textContent = parts.join(' │ ');
}

// ---------- boot ----------
let started = false;

async function start(): Promise<void> {
  if (started) return;
  started = true;
  const log = (line: string): void => {
    boot.textContent += `\n> ${line}`;
  };
  try {
    initAudio(); // must happen inside the user gesture
    log('audio ok');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: 'user' },
    });
    video.srcObject = stream;
    await video.play();
    const s = stream.getVideoTracks()[0]?.getSettings();
    log(`camera ok ${s?.width ?? '?'}x${s?.height ?? '?'} @ ${s?.frameRate?.toFixed(0) ?? '?'}fps`);

    canvas.width = video.videoWidth * 2;
    canvas.height = video.videoHeight * 2;

    log('loading hand model');
    const t = performance.now();
    await loadTracker();
    log(`hand model ok (${delegate}, ${(performance.now() - t).toFixed(0)}ms)`);

    boot.hidden = true;
    startTrackingLoop();
    requestAnimationFrame(render);
  } catch (err) {
    started = false;
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    log(`failed: ${msg}`);
    log('[press enter / tap to retry]');
  }
}

boot.addEventListener('click', () => void start());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void start();
  if (e.key === 'f') {
    smoothing = !smoothing;
    fy.reset();
  }
  if (e.key === ' ') {
    e.preventDefault();
    muted = !muted;
    if (muted) setVoice(null);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setVoice(null);
});
