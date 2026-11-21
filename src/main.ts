// App shell: boot, wiring between tracking, mapping, audio and the view, keyboard.

import { Engine } from './audio/engine';
import { PRESETS } from './audio/presets';
import { FistDetector, assignRoles, extractFeatures, rawOpenness } from './input/hands';
import type { HandFeatures, Point } from './input/hands';
import { clamp01, heightToUnit, unitToHeight } from './input/mapping';
import { OneEuro } from './input/oneEuro';
import {
  Quantizer,
  SCALES,
  SCALE_IDS,
  midiToFreq,
  midiToName,
  scaleNotesInRange,
} from './input/scales';
import type { ScaleId } from './input/scales';
import { View } from './render/view';
import type { Guide, HandView, LegendRow } from './render/view';
import { createTracker } from './tracking/tracker';
import type { TrackedFrame, Tracker } from './tracking/tracker';

const HOLD_MS = 150; // keep sounding this long after the hand is lost
const SOLO_VOLUME = 0.7; // level when there is no second hand to set it
const CLOSED_LEVEL = 0.35; // how quiet a nearly closed hand gets before the fist mutes
const ROOT = 0; // C, root key selection comes with the full keyboard map

const must = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

const video = must<HTMLVideoElement>('#cam');
const boot = must<HTMLElement>('#boot');
const statusEl = must<HTMLElement>('#status');
const view = new View(must<HTMLCanvasElement>('#view'), video);

// ---------- state ----------
let engine: Engine | null = null;
let tracker: Tracker | null = null;
let preset = PRESETS[0]!;
let scale: ScaleId = preset.scale;
let muted = false;
let smoothing = true;
let color = false;

let hands: HandView[] = [];
let guides: Guide[] = [];
let lastSeen = -Infinity;
let tracked = false;
let level = 0;
let midi: number | null = null;
let openRaw = 0;
let legend: LegendRow[] = [];

const filter = (): OneEuro => new OneEuro({ minCutoff: 1.2, beta: 8, dCutoff: 1 });
const f = { py: filter(), px: filter(), po: filter(), vy: filter() };
const fist = new FistDetector();
const quantizer = new Quantizer();

// ---------- metrics ----------
const ema = (prev: number, next: number): number => (prev === 0 ? next : prev + 0.1 * (next - prev));
let inferMs = 0;
let captureAgeMs = 0;
let frames = 0;
let trackFps = 0;
let draws = 0;
let drawFps = 0;
let lastFpsAt = performance.now();

function rebuildGuides(): void {
  const high = preset.lowMidi + preset.octaves * 12;
  // With the scale off there is nothing to snap to, so only octaves are marked.
  const notes = scaleNotesInRange(preset.lowMidi, high, ROOT, SCALES[scale] ?? [0]);
  guides = notes.map((note) => ({
    y: unitToHeight((note - preset.lowMidi) / (preset.octaves * 12)),
    name: midiToName(note),
    active: false,
  }));
  quantizer.reset();
}

function selectPreset(index: number): void {
  const next = PRESETS[index];
  if (!next) return;
  preset = next;
  scale = next.scale;
  engine?.setPreset(next);
  rebuildGuides();
  legend = buildLegend(null);
}

function onFrame(frame: TrackedFrame): void {
  inferMs = ema(inferMs, frame.inferMs);
  if (frame.captureAgeMs !== null) captureAgeMs = ema(captureAgeMs, frame.captureAgeMs);
  frames++;

  const points = new Map<HandFeatures, Point[]>();
  const world = new Map<HandFeatures, Point[] | undefined>();
  frame.hands.forEach((hand, i) => {
    const features = extractFeatures(hand, frame.world[i]);
    if (features) {
      points.set(features, hand);
      world.set(features, frame.world[i]);
    }
  });
  const roles = assignRoles([...points.keys()]);
  if (!roles.pitch) return; // the render loop handles hold and release
  lastSeen = frame.time;
  tracked = true;

  const t = frame.time / 1000;
  const smooth = (flt: OneEuro, v: number): number => (smoothing ? flt.filter(v, t) : v);

  const y = smooth(f.py, roles.pitch.y);
  const x = smooth(f.px, roles.pitch.x);
  const open = smooth(f.po, roles.pitch.openness);
  openRaw = rawOpenness(world.get(roles.pitch) ?? points.get(roles.pitch) ?? []) ?? 0;

  let note = preset.lowMidi + heightToUnit(y) * preset.octaves * 12;
  const scaleNotes = SCALES[scale];
  if (scaleNotes) note = quantizer.next(note, ROOT, scaleNotes);
  midi = note;

  // Three controls on the playing hand, one on the other:
  //   up/down = pitch, left/right = preset timbre, open/close = louder and brighter,
  //   fist = mute, second hand up/down = volume.
  const timbre = clamp01((x - 0.1) / 0.8);
  const isFist = fist.update(open);
  let volume = SOLO_VOLUME;
  if (roles.volume) {
    volume = heightToUnit(smooth(f.vy, roles.volume.y));
  } else {
    f.vy.reset();
  }

  level = muted || isFist ? 0 : volume * (CLOSED_LEVEL + (1 - CLOSED_LEVEL) * open);
  engine?.update({ hz: midiToFreq(note), level, timbre, macro: open });

  const name = midiToName(note);
  for (const guide of guides) guide.active = scaleNotes !== null && guide.name === name;
  const next: HandView[] = [
    {
      role: 'pitch',
      points: points.get(roles.pitch) ?? [],
      title: isFist ? 'fist: muted' : `pitch ${name}`,
      detail: `${preset.timbreLabel} ${timbre.toFixed(2)}  open ${open.toFixed(2)}`,
    },
  ];
  if (roles.volume) {
    next.push({
      role: 'volume',
      points: points.get(roles.volume) ?? [],
      title: `volume ${(volume * 100).toFixed(0)}%`,
      detail: 'up/down',
    });
  }
  hands = next;
  legend = buildLegend({ name, unit: heightToUnit(y), timbre, open, isFist, volume: roles.volume ? volume : null });
}

interface LegendInput {
  name: string;
  unit: number;
  timbre: number;
  open: number;
  isFist: boolean;
  volume: number | null;
}

/** The on-screen answer to "what does my hand do". Pass null while no hand is visible. */
function buildLegend(live: LegendInput | null): LegendRow[] {
  return [
    { gesture: 'up / down', effect: 'pitch', value: live?.unit ?? null, text: live?.name ?? '' },
    { gesture: 'left / right', effect: preset.timbreLabel, value: live?.timbre ?? null, text: '' },
    {
      gesture: 'open / close',
      effect: `loud + ${preset.macroLabel}`,
      value: live?.open ?? null,
      text: live?.isFist ? 'mute' : '',
    },
    { gesture: 'fist', effect: 'mute', value: null, text: live?.isFist ? 'on' : '' },
    {
      gesture: '2nd hand up / down',
      effect: 'volume',
      value: live?.volume ?? null,
      text: live && live.volume === null ? 'raise a 2nd hand' : '',
    },
  ];
}

function release(): void {
  tracked = false;
  hands = [];
  level = 0;
  midi = null;
  for (const guide of guides) guide.active = false;
  for (const flt of Object.values(f)) flt.reset();
  fist.reset();
  quantizer.reset();
  legend = buildLegend(null);
  engine?.silence();
}

function render(now: number): void {
  requestAnimationFrame(render);
  draws++;
  if (tracked && now - lastSeen > HOLD_MS) release();
  view.draw({ hands, guides, legend, level, color }, now);

  if (now - lastFpsAt >= 1000) {
    const dt = (now - lastFpsAt) / 1000;
    trackFps = frames / dt;
    drawFps = draws / dt;
    frames = 0;
    draws = 0;
    lastFpsAt = now;
    updateStatus();
  }
}

function updateStatus(): void {
  const parts = [
    'thereminal',
    `preset ${preset.id}`,
    `scale ${scale === 'off' ? 'off' : `C ${scale}`}`,
    muted ? 'muted' : midi === null ? 'silent' : midiToName(midi),
    `hands ${hands.length}`,
    `open raw ${openRaw.toFixed(2)}`,
    `track ${trackFps.toFixed(0)}/${drawFps.toFixed(0)}fps`,
    `infer ${inferMs.toFixed(1)}ms (${tracker?.delegate ?? '?'})`,
    `cam>landmark ${captureAgeMs ? `${captureAgeMs.toFixed(0)}ms` : 'n/a'}`,
    `audio out ${(engine?.outputLatencyMs ?? 0).toFixed(0)}ms`,
  ];
  const keys = `[1-${PRESETS.length}] preset  [s] scale  [v] camera  [f] smoothing ${smoothing ? 'on' : 'off'}  [space] mute`;
  statusEl.textContent = `${parts.join(' │ ')}\n${keys}`;
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
    engine ??= new Engine(); // must happen inside the user gesture
    await engine.ctx.resume();
    engine.setPreset(preset);
    log('audio ok');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: 'user' },
    });
    video.srcObject = stream;
    await video.play();
    const s = stream.getVideoTracks()[0]?.getSettings();
    log(`camera ok ${s?.width ?? '?'}x${s?.height ?? '?'} @ ${s?.frameRate?.toFixed(0) ?? '?'}fps`);

    log('loading hand model');
    const t = performance.now();
    tracker = await createTracker();
    log(`hand model ok (${tracker.delegate}, ${(performance.now() - t).toFixed(0)}ms)`);
    await document.fonts.load('12px "IBM Plex Mono"').catch(() => undefined);

    boot.hidden = true;
    rebuildGuides();
    legend = buildLegend(null);
    tracker.start(video, onFrame);
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
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const digit = Number.parseInt(e.key, 10);
  if (digit >= 1 && digit <= PRESETS.length) selectPreset(digit - 1);
  switch (e.key) {
    case 'Enter':
      void start();
      break;
    case 's':
      scale = SCALE_IDS[(SCALE_IDS.indexOf(scale) + 1) % SCALE_IDS.length] ?? 'off';
      rebuildGuides();
      break;
    case 'f':
      smoothing = !smoothing;
      for (const flt of Object.values(f)) flt.reset();
      break;
    case 'v':
      color = !color;
      break;
    case ' ':
      e.preventDefault();
      muted = !muted;
      if (muted) engine?.silence();
      break;
  }
  updateStatus();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
});
