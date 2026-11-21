import type { Colors } from '../ui/theme';
import { context2d, fitCanvas, font } from './canvas';
import type { Guide } from './view';

// Pitch panel: the playable notes as a vertical ruler. The hollow marker follows the
// hand continuously, the lit note is the one that actually sounds, so you can watch
// the pitch snap.

export interface RulerScene {
  guides: readonly Guide[];
  /** Raw hand height, 0 = top, null when no hand is up. */
  handY: number | null;
}

export class Ruler {
  private readonly g: CanvasRenderingContext2D;
  private readonly size: { dpr: number };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = context2d(canvas);
    this.size = fitCanvas(canvas);
  }

  draw(scene: RulerScene, colors: Colors): void {
    const { g, canvas } = this;
    const dpr = this.size.dpr;
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const top = 14 * dpr;
    const usable = h - top - 10 * dpr;
    const yOf = (frameY: number): number => top + frameY * usable;

    g.font = font(11, dpr);
    g.textBaseline = 'middle';
    g.textAlign = 'right';
    const spacing = scene.guides.length > 1 ? (usable * 0.8) / (scene.guides.length - 1) : usable;
    const crowded = spacing < 13 * dpr;
    const tickX = w - 26 * dpr;

    for (const guide of scene.guides) {
      const y = Math.round(yOf(guide.y)) + 0.5;
      const natural = !guide.name.includes('#');
      const isC = guide.name.startsWith('C') && natural;
      g.strokeStyle = guide.active ? colors.accent : colors.line;
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(tickX, y);
      g.lineTo(tickX + (guide.active ? 14 : isC ? 10 : 6) * dpr, y);
      g.stroke();
      if (guide.active || !crowded || isC) {
        g.fillStyle = guide.active ? colors.accent : isC ? colors.dim : colors.faint;
        g.fillText(guide.name, tickX - 6 * dpr, y);
      }
    }

    if (scene.handY !== null) {
      const y = yOf(scene.handY);
      const x = w - 5 * dpr;
      g.strokeStyle = colors.fg;
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(x, y - 4 * dpr);
      g.lineTo(x - 6 * dpr, y);
      g.lineTo(x, y + 4 * dpr);
      g.closePath();
      g.stroke();
    }
  }
}
