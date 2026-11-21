import type { TrackedFrame } from '../tracking/tracker';
import type { Point } from './hands';

// A synthetic hand for `?demo`: lets the whole pipeline run without a camera, which is
// what the automated screenshots and layout checks use. Not part of normal play.

// Open right hand, wrist at the origin, in palm lengths, y pointing up the screen.
const TEMPLATE: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.35, -0.25], [-0.6, -0.5], [-0.78, -0.75], [-0.9, -0.98],
  [-0.28, -0.95], [-0.33, -1.35], [-0.36, -1.62], [-0.38, -1.85],
  [-0.03, -1.0], [-0.03, -1.45], [-0.03, -1.75], [-0.03, -2.0],
  [0.2, -0.95], [0.24, -1.35], [0.26, -1.62], [0.28, -1.83],
  [0.4, -0.82], [0.5, -1.12], [0.56, -1.33], [0.6, -1.52],
];
const KNUCKLES = new Set([0, 1, 5, 9, 13, 17]);

/** @param curl 0 = flat open, 1 = fingers folded onto the palm */
function hand(cx: number, cy: number, size: number, curl: number, flip: boolean): Point[] {
  return TEMPLATE.map(([tx, ty], i) => {
    let x = tx;
    let y = ty;
    if (!KNUCKLES.has(i)) {
      const base = TEMPLATE[i <= 4 ? 1 : 5 + Math.floor((i - 5) / 4) * 4] ?? [0, 0];
      x = base[0] + (tx - base[0]) * (1 - curl * 0.85);
      y = base[1] + (ty - base[1]) * (1 - curl * 0.85);
    }
    if (flip) x = -x;
    return { x: cx + x * size * 0.75, y: cy + y * size + size, z: 0 };
  });
}

export function startDemo(onFrame: (frame: TrackedFrame) => void): void {
  const t0 = performance.now();
  setInterval(() => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    // Unmirrored image space: a small x is the right side of the mirrored screen.
    const lead = hand(0.3 + 0.08 * Math.sin(t * 0.5), 0.42 + 0.2 * Math.sin(t * 0.8), 0.13, 0.25 + 0.25 * Math.sin(t * 0.6), false);
    const other = hand(0.72, 0.5 + 0.1 * Math.sin(t * 0.4), 0.13, 0.05, true);
    const hands = [lead, other];
    onFrame({ hands, world: hands, time: now, inferMs: 0, captureAgeMs: null });
  }, 33);
}
