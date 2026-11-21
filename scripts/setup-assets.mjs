// Self-hosts the MediaPipe runtime so nothing is fetched from a CDN at runtime.
// - wasm: copied from node_modules (stays in sync with the installed package)
// - model: downloaded once at setup time, then served from /public
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = resolve(root, 'public/mediapipe');
const modelPath = resolve(outDir, 'hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(outDir, { recursive: true });

if (!(await exists(wasmSrc))) {
  console.error('setup: @mediapipe/tasks-vision not installed, run npm install first');
  process.exit(1);
}
await cp(wasmSrc, resolve(outDir, 'wasm'), { recursive: true });
console.log('setup: wasm copied');

if (await exists(modelPath)) {
  console.log('setup: model present');
} else {
  console.log('setup: downloading hand model (about 8 MB)');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`setup: model download failed with HTTP ${res.status}`);
    process.exit(1);
  }
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('setup: model saved');
}
