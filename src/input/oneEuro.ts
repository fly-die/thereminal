// One Euro filter (Casiez, Roussel, Vogel 2012).
// Low cutoff at rest kills jitter, cutoff rises with speed to keep lag low.

const alpha = (cutoffHz: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
};

export interface OneEuroOptions {
  /** Cutoff at rest in Hz. Lower = steadier, laggier. */
  minCutoff: number;
  /** How fast the cutoff opens up with speed. Higher = less lag when moving. */
  beta: number;
  /** Cutoff for the derivative estimate in Hz. */
  dCutoff: number;
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(private readonly opts: OneEuroOptions) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  /** @param value raw sample @param tSec timestamp in seconds */
  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = tSec;
      return value;
    }
    const dt = tSec - this.t;
    if (dt <= 0) return this.x;
    this.t = tSec;

    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.opts.dCutoff, dt) * (rawDx - this.dx);

    const cutoff = this.opts.minCutoff + this.opts.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
