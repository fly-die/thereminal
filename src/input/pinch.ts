import type { Point } from './hands';

// Pinch = thumb tip touching another fingertip. Distances are measured in palm lengths
// so they do not depend on how far the hand is from the camera.

const THUMB_TIP = 4;
const FINGER_TIPS = [8, 12, 16, 20] as const; // index, middle, ring, pinky
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;

const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** Thumb-to-fingertip distance for index, middle, ring and pinky, in palm lengths. */
export function pinchDistances(points: readonly Point[]): number[] | null {
  const thumb = points[THUMB_TIP];
  const wrist = points[WRIST];
  const knuckle = points[MIDDLE_KNUCKLE];
  if (!thumb || !wrist || !knuckle) return null;
  const palm = dist(wrist, knuckle);
  if (palm === 0) return null;
  const out: number[] = [];
  for (const i of FINGER_TIPS) {
    const tip = points[i];
    if (!tip) return null;
    out.push(dist(thumb, tip) / palm);
  }
  return out;
}

/**
 * One pinch at a time. When the thumb meets the index finger it is also fairly close
 * to the middle finger, so only the closest finger can be pressed, and it has to move
 * clearly away again before anything else can trigger.
 */
export class PinchDetector {
  private pressed: number | null = null;

  constructor(
    private readonly pressBelow = 0.28,
    private readonly releaseAbove = 0.42,
  ) {}

  reset(): void {
    this.pressed = null;
  }

  get finger(): number | null {
    return this.pressed;
  }

  /** @returns the finger (0 = index) that was pressed on this update, or null */
  update(distances: readonly number[]): number | null {
    if (this.pressed !== null) {
      if ((distances[this.pressed] ?? Infinity) > this.releaseAbove) this.pressed = null;
      return null;
    }
    let best = -1;
    let bestDistance = this.pressBelow;
    distances.forEach((d, i) => {
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best < 0) return null;
    this.pressed = best;
    return best;
  }
}
