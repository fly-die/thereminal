import type { Point } from '../input/hands';
import type { CameraMode, OverlayMode } from '../state';
import type { Colors } from '../ui/theme';
import { CameraLayer } from './camera';
import { context2d, fitCanvas, font } from './canvas';

// Camera panel: the stylised camera frame with the hand overlay on top.
// Landmarks arrive at camera rate (30 fps) but the screen refreshes at 60+, so points
// are eased towards their targets every frame. Without that the overlay visibly steps.

const EASE_MS = 30;
const SNAP_DISTANCE = 0.25; // a jump this large is a different hand, do not ease
const TRAIL_MS = 200;
// How strongly each camera style shows. The picture modes are dimmed so the overlay pops.
const CAMERA_ALPHA: Record<CameraMode, number> = {
  mono: 0.5, color: 0.7, ascii: 0.55, dither: 1, edges: 1, off: 0,
};

const BONES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11],
  [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const STAR = [4, 12, 20, 8, 16] as const; // thumb > middle > pinky > index > ring
const PENTAGON = [4, 8, 12, 16, 20] as const;
const TIP_LIST = [4, 8, 12, 16, 20] as const;
const TIPS = new Set<number>(TIP_LIST);

export interface HandView {
  role: 'pitch' | 'volume';
  /** Normalised image landmarks, unmirrored. */
  points: readonly Point[];
  title: string;
  detail: string;
  /** Finger pinched against the thumb (0 = index), if any. */
  pinch: number | null;
}

export interface Guide {
  /** Frame height, 0 = top. */
  y: number;
  note: number;
  name: string;
  active: boolean;
}

export interface Scene {
  hands: readonly HandView[];
  guides: readonly Guide[];
  /** Current output level 0..1, makes the overlay breathe with the sound. */
  level: number;
  /** performance.now() of the last note change or strike. */
  pulseAt: number;
  camera: CameraMode;
  overlay: OverlayMode;
  motion: boolean;
}

interface Trail {
  time: number;
  path: number[];
}

export class View {
  readonly cameraLayer: CameraLayer;
  private readonly g: CanvasRenderingContext2D;
  private readonly size: { dpr: number };
  private readonly shown = new Map<string, Point[]>();
  private readonly trails: Trail[] = [];
  private lastDraw = 0;
  /** Where the camera frame sits inside the canvas, in canvas pixels. */
  frame = { x: 0, y: 0, w: 4, h: 3 };
  /** Canvas pixels per CSS pixel. */
  get dpr(): number {
    return this.size.dpr;
  }

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
  ) {
    this.g = context2d(canvas);
    this.size = fitCanvas(canvas);
    this.cameraLayer = new CameraLayer(video);
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

  draw(scene: Scene, colors: Colors, now: number): void {
    const { g, canvas, video } = this;
    const dpr = this.size.dpr;
    const dt = this.lastDraw ? now - this.lastDraw : 16;
    this.lastDraw = now;
    const k = scene.motion ? 1 - Math.exp(-dt / EASE_MS) : 1;
    const accent = (alpha: number): string => `rgba(${colors.accentRgb}, ${alpha})`;

    const cw = canvas.width;
    const ch = canvas.height;
    g.clearRect(0, 0, cw, ch);

    // Letterbox a 4:3 frame into the panel, even before the camera is up.
    const vw = video.videoWidth || 4;
    const vh = video.videoHeight || 3;
    const inset = 10 * dpr;
    const scale = Math.min((cw - inset * 2) / vw, (ch - inset * 2) / vh);
    const w = vw * scale;
    const h = vh * scale;
    const ox = (cw - w) / 2;
    const oy = (ch - h) / 2;
    this.frame = { x: ox, y: oy, w, h };
    const px = (p: Point): number => ox + (1 - p.x) * w; // mirrored
    const py = (p: Point): number => oy + p.y * h;

    this.cameraLayer.update(scene.camera, colors);
    const layer = this.cameraLayer.canvas;
    if (scene.camera !== 'off' && layer.width > 1) {
      const pixelated = scene.camera === 'dither' || scene.camera === 'edges';
      g.imageSmoothingEnabled = !pixelated;
      g.globalAlpha = CAMERA_ALPHA[scene.camera];
      g.drawImage(layer, ox, oy, w, h);
      g.globalAlpha = 1;
    }

    // Note guides: a faint line where each note sits, the sounding one lit.
    g.lineWidth = dpr;
    for (const guide of scene.guides) {
      const y = Math.round(oy + guide.y * h) + 0.5;
      g.strokeStyle = guide.active ? accent(0.6) : `rgba(${colors.fgRgb}, 0.06)`;
      g.beginPath();
      g.moveTo(ox, y);
      g.lineTo(ox + w, y);
      g.stroke();
    }

    const pulse = scene.motion ? Math.exp(-(now - scene.pulseAt) / 130) : 0;
    const live = new Set<string>();
    for (const hand of scene.hands) {
      live.add(hand.role);
      const pts = this.ease(hand, k);
      const at = (i: number): Point => pts[i] ?? { x: 0, y: 0 };
      const lead = hand.role === 'pitch';

      g.lineJoin = 'round';
      g.lineCap = 'round';

      const bones = (alpha: number, width: number): void => {
        g.strokeStyle = accent(alpha);
        g.lineWidth = width * dpr;
        g.beginPath();
        for (const [a, b] of BONES) {
          g.moveTo(px(at(a)), py(at(a)));
          g.lineTo(px(at(b)), py(at(b)));
        }
        g.stroke();
      };

      const order = scene.overlay === 'pentagon' ? PENTAGON : STAR;
      const shape = order.flatMap((i) => [px(at(i)), py(at(i))]);
      const polygon = (path: readonly number[]): void => {
        g.beginPath();
        for (let i = 0; i < path.length; i += 2) {
          if (i === 0) g.moveTo(path[i] ?? 0, path[i + 1] ?? 0);
          else g.lineTo(path[i] ?? 0, path[i + 1] ?? 0);
        }
        g.closePath();
        g.stroke();
      };

      if (scene.overlay === 'skeleton') {
        bones(0.55 + 0.4 * scene.level, 1.25 + scene.level);
      } else {
        bones(0.22, 1);
        if (lead && scene.motion) {
          // Afterimage: recent shapes fade out behind the hand.
          this.trails.push({ time: now, path: shape });
          g.lineWidth = dpr;
          for (const trail of this.trails) {
            const age = (now - trail.time) / TRAIL_MS;
            if (age <= 0 || age >= 1) continue;
            g.strokeStyle = accent((1 - age) * 0.22);
            polygon(trail.path);
          }
        }
        g.strokeStyle = accent(0.6 + 0.4 * scene.level);
        g.lineWidth = (1.25 + scene.level + pulse * 0.75) * dpr;
        polygon(shape);
      }

      const pinched = hand.pinch === null ? -1 : (TIP_LIST[hand.pinch + 1] ?? -1);
      pts.forEach((p, i) => {
        const x = px(p);
        const y = py(p);
        if (TIPS.has(i)) {
          const hit = hand.pinch !== null && (i === pinched || i === 4);
          g.fillStyle = hit ? colors.accent : colors.bg;
          g.strokeStyle = colors.accent;
          g.lineWidth = 1.5 * dpr;
          g.beginPath();
          g.arc(x, y, (5.5 + (lead ? pulse * 3 : 0) + (hit ? 2 : 0)) * dpr, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          if (!hit) {
            g.fillStyle = colors.accent;
            g.beginPath();
            g.arc(x, y, 1.75 * dpr, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.fillStyle = accent(0.85);
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
      g.strokeStyle = accent(0.7);
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

      g.textBaseline = 'middle';
      g.font = font(12, dpr);
      g.fillStyle = colors.accent;
      g.fillText(hand.title, x0, y0 - 11 * dpr);
      g.font = font(11, dpr);
      g.fillStyle = colors.dim;
      g.fillText(hand.detail, x0, y1 + 12 * dpr);
    }
    for (const role of this.shown.keys()) if (!live.has(role)) this.shown.delete(role);
    while (this.trails[0] && now - this.trails[0].time > TRAIL_MS) this.trails.shift();
    if (!live.has('pitch')) this.trails.length = 0;
  }
}
