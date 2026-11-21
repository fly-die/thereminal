// Renders every preset offline in a real browser and prints its level and brightness.
// This is how the preset levels were balanced: sustained presets sit within about
// 1 dB of each other, struck presets share the same peak.
//
// Usage: start the dev server (npm run dev), then
//   node scripts/measure-presets.mjs [http://localhost:5173]
// Needs Chrome. Set CHROME to its path if it is not in the default macOS location.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const origin = process.argv[2] ?? 'http://localhost:5173';
const chromePath =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;

// Runs inside the page. Plays each preset the way a hand at mid height would.
const measure = async () => {
  const { PRESETS } = await import('/src/audio/presets/index.ts');
  const RATE = 48000;
  const SECONDS = 4;
  const lines = [];
  for (const preset of PRESETS) {
    const ctx = new OfflineAudioContext(2, RATE * SECONDS, RATE);
    const voice = preset.create(ctx);
    voice.output.connect(ctx.destination);
    const midi = preset.lowMidi + preset.octaves * 6;
    const hz = 440 * 2 ** ((midi - 69) / 12);
    voice.setTimbre(0.5);
    voice.setMacro(0.8);
    voice.setPitch(hz, 0.001);
    // One hand, mostly open: the level main.ts would send.
    voice.setLevel(preset.mode === 'pluck' ? 0.7 : 0.7 * (0.35 + 0.65 * 0.8));
    if (voice.trigger) {
      for (const t of [0.1, 0.8, 1.5, 2.2, 2.9]) {
        // Fire-and-forget on purpose: startRendering below is what gets awaited.
        void ctx.suspend(t).then(() => {
          voice.trigger(hz, 0.9);
          return ctx.resume();
        });
      }
    }
    const buffer = await ctx.startRendering();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const from = preset.mode === 'pluck' ? 0 : RATE; // skip the attack of sustained sounds
    const a = 1 / (1 + (2 * Math.PI * 3000) / RATE); // one-pole highpass at 3 kHz
    let sum = 0;
    let peak = 0;
    let high = 0;
    let y = 0;
    let previous = 0;
    for (let i = from; i < left.length; i++) {
      const mono = (left[i] + right[i]) / 2;
      sum += (left[i] ** 2 + right[i] ** 2) / 2;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      y = a * (y + mono - previous);
      previous = mono;
      high += y * y;
    }
    const db = (v) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1).padStart(6);
    const rms = Math.sqrt(sum / (left.length - from));
    const bright = ((100 * high) / Math.max(sum, 1e-12)).toFixed(1).padStart(5);
    lines.push(
      `${preset.id.padEnd(12)} ${preset.mode.padEnd(10)} rms ${db(rms)} dB   peak ${db(peak)} dB   above 3 kHz ${bright}%`,
    );
  }
  return lines.join('\n');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(
  chromePath,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(`${tmpdir()}/thereminal-`)}`, '--mute-audio', 'about:blank'],
  { stdio: 'ignore' },
);
try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!targets) throw new Error('could not reach Chrome');
  const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => (socket.onopen = resolve));
  let id = 0;
  const pending = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) pending.get(data.id)(data.result ?? data.error);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Page.enable');
  await send('Page.navigate', { url: `${origin}/favicon.svg` }); // any page on the dev server will do
  await sleep(800);
  const result = await send('Runtime.evaluate', {
    expression: `(${measure.toString()})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log(result.result?.value ?? `failed: ${JSON.stringify(result.exceptionDetails ?? result).slice(0, 800)}`);
} finally {
  chrome.kill();
}
