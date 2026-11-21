import type { Point } from '../input/hands';

// Camera view with a debug-style overlay. Landmarks arrive at camera rate (30 fps) but
// the screen refreshes at 60+, so points are eased towards their targets every frame.
// Without that the overlay visibly steps.

const ACCENT = '125, 255, 160'; // placeholder rgb, the accent is decided in phase 2
const GREY = '#77776f';
const EASE_MS = 30;
const SNAP_DISTANCE = 0.25; // a jump this large is a different hand, do not ease

const BONES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const STAR = [4, 12, 20, 8, 16] as const; // thumb > middle > pinky > index > ring
const TIPS = new Set([4, 8, 12, 16, 20]);

export interface HandView {
  role: 'pitch' | 'volume';
  /** Normalised image landmarks, unmirrored. */
  points: readonly Point[];
  title: string;
  detail: string;
}

export interface Guide {
  /** Frame height, 0 = top. */
  y: number;
  name: string;
  active: boolean;
}

export interface LegendRow {
  gesture: string;
  effect: string;
  /** 0..1 for a live meter, null when there is nothing to show. */
  value: number | null;
  text: string;
}

export interface Scene {
  hands: readonly HandView[];
  guides: readonly Guide[];
  legend: readonly LegendRow[];
  /** Current output level 0..1, makes the overlay breathe with the sound. */
  level: number;
  color: boolean;
}

export class View {
  private readonly g: CanvasRenderingContext2D;
  private readonly shown = new Map<string, Point[]>();
  private lastDraw = 0;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
  ) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d context unavailable');
    this.g = g;
    const fit = (): void => {
      this.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * this.dpr);
      canvas.height = Math.round(canvas.clientHeight * this.dpr);
    };
    new ResizeObserver(fit).observe(canvas);
    fit();
  }

  /** Eases the displayed points towards the tracked ones. */
  private ease(hand: HandView, k: number): Point[] {
    const prev = this.shown.get(hand.role);
    const a = prev?.[0];
    const b = hand.points[0];
    const jumped = !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > SNAP_DISTANCE;
    const next =
      !prev || jumped || prev.length !== hand.points.length
        ? hand.points.map((p) => ({ x: p.x, y: p.y }))
        : prev.map((p, i) => {
            const target = hand.points[i] ?? p;
            return { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k };
          });
    this.shown.set(hand.role, next);
    return next;
  }

  draw(scene: Scene, now: number): void {
    const { g, canvas, video, dpr } = this;
    const dt = this.lastDraw ? now - this.lastDraw : 16;
    this.lastDraw = now;
    const k = 1 - Math.exp(-dt / EASE_MS);

    const cw = canvas.width;
    const ch = canvas.height;
    g.fillStyle = '#070707';
    g.fillRect(0, 0, cw, ch);
    if (!video.videoWidth) return;

    // Letterbox the camera into the canvas.
    const scale = Math.min(cw / video.videoWidth, ch / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    const ox = (cw - w) / 2;
    const oy = (ch - h) / 2;
    const px = (p: Point): number => ox + (1 - p.x) * w; // mirrored
    const py = (p: Point): number => oy + p.y * h;

    g.save();
    g.translate(ox + w, oy);
    g.scale(-1, 1);
    g.globalAlpha = scene.color ? 0.55 : 0.38;
    if (!scene.color) g.filter = 'grayscale(1) contrast(1.1)';
    g.drawImage(video, 0, 0, w, h);
    g.restore();

    g.lineWidth = dpr;
    g.strokeStyle = '#2a2a2a';
    g.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);

    const font = (size: number): string => `${size * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textBaseline = 'middle';

    // Note guides: where the hand has to be for each note.
    g.font = font(11);
    const spacing = scene.guides.length > 1 ? h / scene.guides.length : h;
    for (const guide of scene.guides) {
      const y = Math.round(oy + guide.y * h) + 0.5;
      g.strokeStyle = guide.active ? `rgba(${ACCENT}, 0.55)` : 'rgba(255, 255, 255, 0.07)';
      g.beginPath();
      g.moveTo(ox, y);
      g.lineTo(ox + w, y);
      g.stroke();
      if (guide.active || spacing > 13 * dpr || guide.name.startsWith('C') && !guide.name.includes('#')) {
        g.fillStyle = guide.active ? `rgb(${ACCENT})` : GREY;
        g.fillText(guide.name, ox + 8 * dpr, y - 7 * dpr);
      }
    }

    const live = new Set<string>();
    const glow = 0.6 + 0.4 * scene.level;
    for (const hand of scene.hands) {
      live.add(hand.role);
      const pts = this.ease(hand, k);
      const at = (i: number): Point => pts[i] ?? { x: 0, y: 0 };

      g.lineJoin = 'round';
      g.lineCap = 'round';

      g.strokeStyle = `rgba(${ACCENT}, 0.28)`;
      g.lineWidth = dpr;
      g.beginPath();
      for (const [a, b] of BONES) {
        g.moveTo(px(at(a)), py(at(a)));
        g.lineTo(px(at(b)), py(at(b)));
      }
      g.stroke();

      g.strokeStyle = `rgba(${ACCENT}, ${glow})`;
      g.lineWidth = (1.25 + scene.level) * dpr;
      g.beginPath();
      STAR.forEach((i, n) => {
        if (n === 0) g.moveTo(px(at(i)), py(at(i)));
        else g.lineTo(px(at(i)), py(at(i)));
      });
      g.closePath();
      g.stroke();

      pts.forEach((p, i) => {
        const x = px(p);
        const y = py(p);
        if (TIPS.has(i)) {
          g.fillStyle = '#070707';
          g.strokeStyle = `rgb(${ACCENT})`;
          g.lineWidth = 1.5 * dpr;
          g.beginPath();
          g.arc(x, y, 5.5 * dpr, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = `rgb(${ACCENT})`;
          g.beginPath();
          g.arc(x, y, 1.75 * dpr, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillStyle = `rgba(${ACCENT}, 0.85)`;
          g.beginPath();
          g.arc(x, y, 2 * dpr, 0, Math.PI * 2);
          g.fill();
        }
      });

      // Bounding box drawn as corner brackets, with a readout.
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, px(p));
        x1 = Math.max(x1, px(p));
        y0 = Math.min(y0, py(p));
        y1 = Math.max(y1, py(p));
      }
      const pad = 16 * dpr;
      x0 = Math.round(x0 - pad) + 0.5;
      y0 = Math.round(y0 - pad) + 0.5;
      x1 = Math.round(x1 + pad) + 0.5;
      y1 = Math.round(y1 + pad) + 0.5;
      const c = 10 * dpr;
      g.strokeStyle = `rgba(${ACCENT}, 0.7)`;
      g.lineWidth = dpr;
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      g.beginPath();
      for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]] as const) {
        g.moveTo(x + sx * c, y);
        g.lineTo(x, y);
        g.lineTo(x, y + sy * c);
      }
      g.stroke();

      g.font = font(12);
      g.fillStyle = `rgb(${ACCENT})`;
      g.fillText(hand.title, x0, y0 - 11 * dpr);
      g.font = font(11);
      g.fillStyle = GREY;
      g.fillText(hand.detail, x0, y1 + 12 * dpr);
    }
    for (const role of this.shown.keys()) if (!live.has(role)) this.shown.delete(role);

    this.drawLegend(scene.legend, ox, oy + h, font);
  }

  /** Panel in the bottom left corner, away from where hands play: gesture, target, live meter. */
  private drawLegend(
    rows: readonly LegendRow[],
    left: number,
    bottom: number,
    font: (size: number) => string,
  ): void {
    if (rows.length === 0) return;
    const { g, dpr } = this;
    const pad = 12 * dpr;
    const rowH = 20 * dpr;
    const width = 400 * dpr;
    const height = rows.length * rowH + pad * 2;
    const x = Math.round(left + 14 * dpr) + 0.5;
    const y = Math.round(bottom - height - 14 * dpr) + 0.5;

    g.fillStyle = 'rgba(7, 7, 7, 0.82)';
    g.fillRect(x, y, width, height);
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = dpr;
    g.strokeRect(x, y, width, height);

    g.font = font(11);
    g.textBaseline = 'middle';
    const title = ' controls ';
    g.fillStyle = '#070707';
    g.fillRect(x + pad, y - 6 * dpr, g.measureText(title).width, 12 * dpr);
    g.fillStyle = GREY;
    g.fillText(title, x + pad, y);

    const segments = 10;
    const segW = 6 * dpr;
    const segGap = 2 * dpr;
    rows.forEach((row, i) => {
      const cy = y + pad + rowH * (i + 0.5);
      const on = row.value !== null || row.text === 'on';
      g.fillStyle = on ? '#ededea' : GREY;
      g.fillText(row.gesture, x + pad, cy);
      g.fillStyle = on ? `rgb(${ACCENT})` : GREY;
      g.fillText(row.effect, x + pad + 150 * dpr, cy);

      const mx = x + pad + 262 * dpr;
      if (row.value !== null) {
        const filled = Math.round(row.value * segments);
        for (let n = 0; n < segments; n++) {
          g.fillStyle = n < filled ? `rgb(${ACCENT})` : 'rgba(255, 255, 255, 0.14)';
          g.fillRect(mx + n * (segW + segGap), cy - 5 * dpr, segW, 10 * dpr);
        }
      }
      if (row.text) {
        g.fillStyle = row.value !== null || row.text === 'on' ? `rgb(${ACCENT})` : GREY;
        const tx = row.value !== null ? mx + segments * (segW + segGap) + 6 * dpr : mx;
        g.fillText(row.text, tx, cy);
      }
    });
  }
}
