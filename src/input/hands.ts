// Turns raw landmarks into the few numbers the instrument plays from.

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface HandFeatures {
  /** Horizontal position on the mirrored screen, 0 = left, 1 = right. */
  x: number;
  /** Vertical position in the frame, 0 = top, 1 = bottom. */
  y: number;
  /** 0 = closed fist, 1 = flat open hand. */
  openness: number;
}

const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
const PALM = [0, 5, 9, 13, 17] as const;
const FINGERTIPS = [8, 12, 16, 20] as const; // thumb left out, it barely curls

// Mean fingertip-to-palm distance in palm lengths. Measured on a real hand:
// about 0.27 for a tight fist and 1.09 flat open. The range sits inside that so
// both ends are reachable without straining.
const OPENNESS_FIST = 0.35;
const OPENNESS_OPEN = 1.0;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

function mean(points: readonly Point[], indices: readonly number[]): Point | null {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of indices) {
    const p = points[i];
    if (!p) return null;
    x += p.x;
    y += p.y;
    z += p.z ?? 0;
  }
  const n = indices.length;
  return { x: x / n, y: y / n, z: z / n };
}

/** Raw openness: mean fingertip distance from the palm centre, in palm lengths. */
export function rawOpenness(points: readonly Point[]): number | null {
  const centre = mean(points, PALM);
  const wrist = points[WRIST];
  const knuckle = points[MIDDLE_KNUCKLE];
  if (!centre || !wrist || !knuckle) return null;
  const palmLength = dist(wrist, knuckle);
  if (palmLength === 0) return null;
  let sum = 0;
  for (const i of FINGERTIPS) {
    const tip = points[i];
    if (!tip) return null;
    sum += dist(tip, centre);
  }
  return sum / FINGERTIPS.length / palmLength;
}

export const normaliseOpenness = (raw: number): number =>
  clamp01((raw - OPENNESS_FIST) / (OPENNESS_OPEN - OPENNESS_FIST));

/**
 * @param image normalised image landmarks (unmirrored, as the model returns them)
 * @param world metric 3d landmarks when available, they make openness independent of
 *   how the hand is turned towards the camera
 */
export function extractFeatures(
  image: readonly Point[],
  world: readonly Point[] | undefined,
): HandFeatures | null {
  // The palm centre is steadier than any single fingertip.
  const centre = mean(image, PALM);
  const raw = rawOpenness(world ?? image);
  if (!centre || raw === null) return null;
  return { x: 1 - centre.x, y: centre.y, openness: normaliseOpenness(raw) };
}

export interface Roles {
  pitch: HandFeatures | null;
  volume: HandFeatures | null;
}

/**
 * One hand plays alone. With two, the hand on the right of the screen leads (pitch
 * and timbre) and the left one shapes (volume and macro). Screen side is used instead
 * of the model's left/right label because that label flips when hands turn.
 */
export function assignRoles(hands: readonly HandFeatures[]): Roles {
  const [a, b] = hands;
  if (!a) return { pitch: null, volume: null };
  if (!b) return { pitch: a, volume: null };
  return a.x >= b.x ? { pitch: a, volume: b } : { pitch: b, volume: a };
}

/** Fist detection with hysteresis so a half-closed hand does not chatter. */
export class FistDetector {
  private closed = false;

  constructor(
    private readonly closeBelow = 0.12,
    private readonly openAbove = 0.3,
  ) {}

  reset(): void {
    this.closed = false;
  }

  update(openness: number): boolean {
    if (this.closed) {
      if (openness > this.openAbove) this.closed = false;
    } else if (openness < this.closeBelow) {
      this.closed = true;
    }
    return this.closed;
  }
}
