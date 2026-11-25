// App shell: boot, wiring between tracking, mapping, audio, render and ui.

import './ui/style.css';
import { Engine } from './audio/engine';
import { PRESETS } from './audio/presets';
import type { Preset } from './audio/presets';
import { startDemo } from './input/demo';
import { FistDetector, assignRoles, extractFeatures } from './input/hands';
import type { HandFeatures, Point } from './input/hands';
import { clamp01, heightToUnit, unitToHeight } from './input/mapping';
import { OneEuro } from './input/oneEuro';
import { PinchDetector, pinchDistances } from './input/pinch';
import { startPointer } from './input/pointer';
import {
  NOTE_NAMES,
  Quantizer,
  SCALES,
  SCALE_LABELS,
  chordNote,
  midiToFreq,
  midiToName,
  scaleNotesInRange,
} from './input/scales';
import { Recorder } from './render/recorder';
import { Ruler } from './render/ruler';
import { Scope } from './render/scope';
import { View } from './render/view';
import type { Guide, HandView } from './render/view';
import { settings, subscribe } from './state';
import { createTracker } from './tracking/tracker';
import type { TrackedFrame, Tracker } from './tracking/tracker';
import { Boot } from './ui/boot';
import { buildEntries, handleKey } from './ui/commands';
import type { CameraDevice, Shell } from './ui/commands';
import { Help } from './ui/help';
import { Palette } from './ui/palette';
import { Panels } from './ui/panels';
import type { LiveControls } from './ui/panels';
import { parseShare, writeShare } from './ui/share';
import { colors, initTheme, reducedMotion } from './ui/theme';

const HOLD_MS = 150; // keep sounding this long after the hand is lost
const SOLO_VOLUME = 0.7; // level when there is no second hand to set it
const CLOSED_LEVEL = 0.35; // how quiet a nearly closed hand gets before the fist mutes
const LOW_LIGHT = 0.12; // mean camera brightness below which hands are hard to find
const STRIKE_VELOCITY = 0.9;

const demo = new URLSearchParams(location.search).has('demo');

const must = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
};

// A shared link sets the sound before anything is built.
Object.assign(settings, parseShare(new URLSearchParams(location.search)));

const video = must<HTMLVideoElement>('#cam');
const hint = must<HTMLElement>('#hint');
const notice = must<HTMLElement>('#notice');

initTheme();
const view = new View(must<HTMLCanvasElement>('#view'), video);
const ruler = new Ruler(must<HTMLCanvasElement>('#ruler'));
const scopeCanvas = must<HTMLCanvasElement>('#scope');
const scope = new Scope(scopeCanvas);
const recorder = new Recorder(view, scopeCanvas, () => updateStatus());
const panels = new Panels(
  () => toggleRecording(),
  () => document.body.classList.toggle('sheet'),
);
must<HTMLElement>('#p-cam').addEventListener('pointerdown', () => document.body.classList.remove('sheet'));
const help = new Help(must<HTMLElement>('#help'));

const shell: Shell = {
  toggleHelp: () => help.toggle(),
  openPalette: () => palette.show(),
  closeOverlays: () => {
    const any = help.open || palette.open;
    help.close();
    palette.close();
    return any;
  },
  toggleRecording: () => toggleRecording(),
  recording: () => recorder.active,
  cameras: () => cameras,
  cameraId: () => cameraId,
  useCamera: (id) => void startCamera(id).catch((err: unknown) => showNotice(`camera: ${cameraError(err)}`)),
};
const palette = new Palette(must<HTMLElement>('#palette'), buildEntries(shell));

// ---------- state ----------
let engine: Engine | null = null;
let tracker: Tracker | null = null;
let cameras: CameraDevice[] = [];
let cameraId = '';
/** No camera: the pointer plays instead. The reason stays on screen. */
let pointerNotice: string | null = null;

let hands: HandView[] = [];
let guides: Guide[] = [];
let lastSeen = -Infinity;
let tracked = false;
let everTracked = false;
let level = 0;
let note: number | null = null;
let handY: number | null = null;
let pulseAt = -Infinity;
let darkSince: number | null = null;

const filter = (): OneEuro => new OneEuro({ minCutoff: 1.2, beta: 8, dCutoff: 1 });
const f = { py: filter(), px: filter(), po: filter(), vy: filter() };
const fist = new FistDetector();
const pinch = new PinchDetector();
const quantizer = new Quantizer();

const preset = (): Preset => PRESETS[settings.preset] ?? (PRESETS[0] as Preset);
const lowMidi = (): number => preset().lowMidi + settings.octave * 12;

// ---------- metrics ----------
const ema = (prev: number, next: number): number => (prev === 0 ? next : prev + 0.1 * (next - prev));
let inferMs = 0;
let frames = 0;
let trackFps = 0;
let lastFpsAt = performance.now();

function rebuildGuides(): void {
  const p = preset();
  const low = lowMidi();
  // With the scale off there is nothing to snap to, so only octaves are marked.
  const notes = scaleNotesInRange(low, low + p.octaves * 12, settings.root, SCALES[settings.scale] ?? [0]);
  guides = notes.map((n) => ({
    y: unitToHeight((n - low) / (p.octaves * 12)),
    note: n,
    name: midiToName(n),
    active: false,
  }));
  quantizer.reset();
}

function onFrame(frame: TrackedFrame): void {
  inferMs = ema(inferMs, frame.inferMs);
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
  if (!everTracked) {
    everTracked = true;
    hint.hidden = true;
  }

  const p = preset();
  const t = frame.time / 1000;
  const smooth = (flt: OneEuro, v: number): number => (settings.smoothing ? flt.filter(v, t) : v);

  const y = smooth(f.py, roles.pitch.y);
  const x = smooth(f.px, roles.pitch.x);
  const open = smooth(f.po, roles.pitch.openness);
  handY = y;

  // Height picks the note: snapped to the scale, or to semitones for struck notes.
  const scaleNotes = SCALES[settings.scale];
  const unit = heightToUnit(y);
  let pitch = lowMidi() + unit * p.octaves * 12;
  if (scaleNotes) pitch = quantizer.next(pitch, settings.root, scaleNotes);
  else if (p.mode === 'pluck') pitch = Math.round(pitch);

  const timbre = clamp01((x - 0.1) / 0.8);
  let volume = SOLO_VOLUME;
  if (roles.volume) {
    volume = heightToUnit(smooth(f.vy, roles.volume.y));
  } else {
    f.vy.reset();
  }

  let isFist = false;
  if (p.mode === 'pluck') {
    // The hand is busy pinching, so openness does not gate the sound here.
    level = settings.muted ? 0 : volume;
    engine?.update({ hz: null, level, timbre, macro: open });
    const distances = pinchDistances(world.get(roles.pitch) ?? points.get(roles.pitch) ?? []);
    const struck = distances ? pinch.update(distances) : null;
    if (struck !== null && !settings.muted) {
      const played = chordNote(pitch, struck, settings.root, scaleNotes);
      engine?.trigger(midiToFreq(played), STRIKE_VELOCITY);
      pulseAt = frame.time;
    }
  } else {
    // Up/down = pitch, left/right = preset timbre, open/close = louder and brighter,
    // fist = mute, second hand up/down = volume.
    isFist = fist.update(open);
    level = settings.muted || isFist ? 0 : volume * (CLOSED_LEVEL + (1 - CLOSED_LEVEL) * open);
    engine?.update({ hz: midiToFreq(pitch), level, timbre, macro: open });
    if (note !== null && Math.round(note) !== Math.round(pitch)) pulseAt = frame.time;
  }
  const changed = note === null || Math.round(note) !== Math.round(pitch);
  note = pitch;
  if (changed) updateStatus();

  const name = midiToName(pitch);
  for (const guide of guides) guide.active = guide.note === Math.round(pitch);
  const verb = p.mode === 'pluck' ? 'note' : 'pitch';
  const next: HandView[] = [
    {
      role: 'pitch',
      points: points.get(roles.pitch) ?? [],
      title: isFist ? 'fist: muted' : `${verb} ${name}`,
      detail: `${p.timbreLabel} ${timbre.toFixed(2)}  open ${open.toFixed(2)}`,
      pinch: p.mode === 'pluck' ? pinch.finger : null,
    },
  ];
  if (roles.volume) {
    next.push({
      role: 'volume',
      points: points.get(roles.volume) ?? [],
      title: `volume ${(volume * 100).toFixed(0)}%`,
      detail: 'up / down',
      pinch: null,
    });
  }
  hands = next;

  const live: LiveControls = {
    note: name,
    unit,
    timbre,
    open,
    isFist,
    volume: roles.volume ? volume : null,
    pinch: p.mode === 'pluck' ? pinch.finger : null,
  };
  panels.updateControls(live);
}

/** Hand gone (or preset changed): let the sound go and forget the smoothing history. */
function release(): void {
  tracked = false;
  hands = [];
  level = 0;
  note = null;
  handY = null;
  for (const guide of guides) guide.active = false;
  for (const flt of Object.values(f)) flt.reset();
  fist.reset();
  pinch.reset();
  quantizer.reset();
  engine?.silence();
  panels.updateControls(null);
}

function render(now: number): void {
  requestAnimationFrame(render);
  if (tracked && now - lastSeen > HOLD_MS) release();

  const motion = !reducedMotion();
  view.draw(
    { hands, guides, level, pulseAt, camera: settings.camera, overlay: settings.overlay, motion },
    colors,
    now,
  );
  ruler.draw({ guides, handY }, colors);
  scope.draw(engine?.analyser ?? null, colors);
  recorder.draw(colors);

  if (now - lastFpsAt >= 1000) {
    trackFps = frames / ((now - lastFpsAt) / 1000);
    frames = 0;
    lastFpsAt = now;
    updateStatus();
    checkLight(now);
  }
}

function updateStatus(): void {
  panels.updateStatus({
    rec: recorder.active ? recorder.seconds : null,
    note: note === null ? '' : midiToName(note),
    hands: hands.length,
    trackFps,
    inferMs,
    outMs: engine?.outputLatencyMs ?? 0,
  });
}

/** A dark room is the most common reason tracking fails, so say it. */
function checkLight(now: number): void {
  if (pointerNotice !== null) return; // that notice stays
  const dark = settings.camera !== 'off' && !tracked && view.cameraLayer.brightness < LOW_LIGHT;
  if (!dark) darkSince = null;
  else darkSince ??= now;
  const show = darkSince !== null && now - darkSince > 2000;
  notice.hidden = !show;
  if (show) notice.textContent = "can't see your hands, more light helps";
}

function showNotice(text: string): void {
  notice.textContent = text;
  notice.hidden = false;
}

function toggleRecording(): void {
  if (recorder.active) {
    recorder.stop();
    return;
  }
  if (!engine) return; // nothing to record before the first gesture
  if (!Recorder.supported) {
    showNotice('recording is not supported in this browser');
    return;
  }
  const p = preset();
  const scale = settings.scale === 'off' ? 'free' : `${NOTE_NAMES[settings.root] ?? 'C'} ${SCALE_LABELS[settings.scale]}`;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  recorder.start(engine.stream, `${p.id} \u00b7 ${scale}`, `thereminal-${p.id}-${stamp}`);
}

// ---------- settings ----------
subscribe((changed) => {
  switch (changed) {
    case 'preset':
      release();
      engine?.setPreset(preset());
      rebuildGuides();
      panels.renderPresets();
      panels.renderControls();
      break;
    case 'scale':
    case 'root':
    case 'octave':
      rebuildGuides();
      break;
    case 'muted':
      if (settings.muted) engine?.silence();
      break;
    case 'smoothing':
      for (const flt of Object.values(f)) flt.reset();
      break;
  }
  panels.renderSetup();
  updateStatus();
  if (changed === 'preset' || changed === 'scale' || changed === 'root' || changed === 'octave') {
    writeShare(settings);
  }
});

// ---------- boot ----------
let started = false;
const boot = new Boot(must<HTMLElement>('#boot'), () => void start());

boot.set('title', 'thereminal v0.1');
boot.set('model', 'loading hand model', demo ? 'skipped (demo)' : '0%', 'wait');
boot.set('audio', 'initializing audio', 'waiting for input', 'wait');
boot.set('camera', 'camera', '[press enter / tap to allow]', 'wait');
boot.set('privacy', 'camera and audio stay on this device. only anonymous page views are counted.');
boot.start();

// The model starts loading right away, the camera and audio need the user gesture.
const trackerReady: Promise<Tracker | null> = demo
  ? Promise.resolve(null)
  : createTracker((fraction) => boot.set('model', 'loading hand model', `${Math.round(fraction * 100)}%`, 'wait'));
trackerReady.then(
  (t) => {
    if (t) boot.set('model', 'loading hand model', `ok (${t.delegate.toLowerCase()})`, 'ok');
  },
  (err: unknown) => boot.set('model', 'loading hand model', err instanceof Error ? err.message : String(err), 'err'),
);

function cameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError') return 'not allowed';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no camera found';
  if (name === 'NotReadableError') return 'in use by another app';
  return err instanceof Error ? err.message : String(err);
}

/** Opens a camera, the default one or a specific device, and lists what else exists. */
async function startCamera(deviceId?: string): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 60 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  });
  // Only now let go of the old camera, so a failed switch keeps the picture.
  if (video.srcObject instanceof MediaStream) for (const t of video.srcObject.getTracks()) t.stop();
  video.srcObject = stream;
  await video.play();
  const s = stream.getVideoTracks()[0]?.getSettings();
  cameraId = s?.deviceId ?? '';
  // Labels are only available once permission has been given, which it now has.
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameras = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label.toLowerCase() || `camera ${i + 1}` }));
  return `${s?.width ?? '?'}x${s?.height ?? '?'}, ${s?.frameRate?.toFixed(0) ?? '?'}fps`;
}

async function start(): Promise<void> {
  if (started) return;
  started = true;
  try {
    engine ??= new Engine(); // must happen inside the user gesture
    await engine.ctx.resume();
    engine.setPreset(preset());
    boot.set('audio', 'initializing audio', 'ok', 'ok');
  } catch (err) {
    started = false;
    boot.set('audio', 'initializing audio', err instanceof Error ? err.message : String(err), 'err');
    return;
  }

  try {
    boot.set('camera', 'camera', 'asking', 'wait');
    boot.set('camera', 'camera', `ok (${await startCamera()})`, 'ok');
  } catch (err) {
    // No camera is not a dead end: the pointer plays the same instrument.
    if (!demo) pointerNotice = `camera off (${cameraError(err)}), using pointer`;
    boot.set('camera', 'camera', demo ? 'none (demo)' : 'off, using pointer', 'ok');
  }

  if (pointerNotice === null) {
    try {
      tracker = await trackerReady;
    } catch {
      started = false; // the model line already shows what went wrong
      return;
    }
  }
  await document.fonts.load('12px "IBM Plex Mono"').catch(() => undefined);

  boot.hide();
  hint.hidden = false;
  rebuildGuides();
  updateStatus();
  if (pointerNotice !== null) {
    hint.textContent = 'move the pointer over the frame, or touch it';
    showNotice(pointerNotice);
    startPointer(
      view.canvas,
      () => ({ x: view.frame.x / view.dpr, y: view.frame.y / view.dpr, w: view.frame.w / view.dpr, h: view.frame.h / view.dpr }),
      onFrame,
    );
  } else if (tracker) {
    tracker.start(video, onFrame);
  } else {
    startDemo(onFrame);
  }
  requestAnimationFrame(render);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !started && !(e.target instanceof HTMLInputElement)) {
    void start();
    return;
  }
  handleKey(e, shell);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) release();
});

rebuildGuides();
updateStatus();
