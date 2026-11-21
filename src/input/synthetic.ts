import type { Point } from './hands';

// A drawn hand in landmark form. The pointer fallback and the demo mode feed this
// through the same pipeline a tracked hand goes through, so mapping, audio and overlay
// need no special cases.

// Open right hand, wrist at the origin, in palm lengths, y pointing down the screen.
const TEMPLATE: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.35, -0.25], [-0.6, -0.5], [-0.78, -0.75], [-0.9, -0.98],
  [-0.28, -0.95], [-0.33, -1.35], [-0.36, -1.62], [-0.38, -1.85],
  [-0.03, -1.0], [-0.03, -1.45], [-0.03, -1.75], [-0.03, -2.0],
  [0.2, -0.95], [0.24, -1.35], [0.26, -1.62], [0.28, -1.83],
  [0.4, -0.82], [0.5, -1.12], [0.56, -1.33], [0.6, -1.52],
];
const KNUCKLES = new Set([0, 1, 5, 9, 13, 17]);
const PALM = [0, 5, 9, 13, 17] as const;
const THUMB_TIP = 4;
const INDEX_TIP = 8;

export interface SyntheticHand {
  /** Palm centre in normalised, unmirrored image space. */
  x: number;
  y: number;
  /** Palm length as a fraction of the frame height. */
  size: number;
  /** 0 = flat open, 1 = fingers folded onto the palm. */
  curl?: number;
  /** Mirror it into a left hand. */
  flip?: boolean;
  /** Index finger touching the thumb. */
  pinch?: boolean;
  /** Frame height / width, so the hand is not stretched. */
  aspect?: number;
}

export function syntheticHand(h: SyntheticHand): Point[] {
  const curl = h.curl ?? 0;
  const aspect = h.aspect ?? 0.75;
  const shape = TEMPLATE.map(([tx, ty], i) => {
    let x = tx;
    let y = ty;
    if (!KNUCKLES.has(i)) {
      const base = TEMPLATE[i <= 4 ? 1 : 5 + Math.floor((i - 5) / 4) * 4] ?? [0, 0];
      x = base[0] + (tx - base[0]) * (1 - curl * 0.85);
      y = base[1] + (ty - base[1]) * (1 - curl * 0.85);
    }
    return { x: h.flip ? -x : x, y };
  });
  if (h.pinch) {
    const thumb = shape[THUMB_TIP];
    if (thumb) shape[INDEX_TIP] = { ...thumb };
  }
  // Place it so the palm centre, which is what the instrument reads, sits on (x, y).
  let cx = 0;
  let cy = 0;
  for (const i of PALM) {
    cx += shape[i]?.x ?? 0;
    cy += shape[i]?.y ?? 0;
  }
  cx /= PALM.length;
  cy /= PALM.length;
  return shape.map((p) => ({
    x: h.x + (p.x - cx) * h.size * aspect,
    y: h.y + (p.y - cy) * h.size,
    z: 0,
  }));
}
