import type { TrackedFrame } from '../tracking/tracker';
import { syntheticHand } from './synthetic';

// `?demo`: two animated synthetic hands, so the whole pipeline runs without anyone in
// front of the camera. Used by the automated screenshots. Not part of normal play.

export function startDemo(onFrame: (frame: TrackedFrame) => void): void {
  const t0 = performance.now();
  setInterval(() => {
    const now = performance.now();
    const t = (now - t0) / 1000;
    // Unmirrored image space: a small x is the right side of the mirrored screen.
    const lead = syntheticHand({
      x: 0.3 + 0.08 * Math.sin(t * 0.5),
      y: 0.45 + 0.2 * Math.sin(t * 0.8),
      size: 0.13,
      curl: 0.2 + 0.2 * Math.sin(t * 0.6),
    });
    const other = syntheticHand({ x: 0.72, y: 0.5 + 0.1 * Math.sin(t * 0.4), size: 0.13, flip: true });
    const hands = [lead, other];
    onFrame({ hands, world: hands, time: now, inferMs: 0, captureAgeMs: null });
  }, 33);
}
