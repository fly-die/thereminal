import type { CameraMode } from '../state';
import type { Colors } from '../ui/theme';
import { context2d } from './canvas';

// mono (the default) and color show the camera picture, dimmed by the view so the
// accent-coloured hand overlay stays the brightest thing on screen. The other modes
// reduce the frame to a small greyscale grid and redraw it as text or pixels, so the
// player looks like part of the terminal.
// The layer is only rebuilt when the camera delivers a new frame (30 fps), the view
// composites the cached result at screen rate.

const RAMP = ' .:-=+*#%@';
const ASCII_COLS = 96;
const CELL_W = 14; // glyph cell in layer pixels, 2x for sharp text on retina screens
const CELL_H = 28;
const PIXEL_W = 224; // grid for dither and edges
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

export class CameraLayer {
  /** The stylised frame, mirrored, ready to draw. Empty in "off" mode. */
  readonly canvas = document.createElement('canvas');
  private readonly g = context2d(this.canvas, true);
  private readonly sample = document.createElement('canvas');
  private readonly sg = context2d(this.sample, true);
  private readonly atlas = document.createElement('canvas');
  private atlasKey = '';
  private lastTime = -1;
  private lastMode: CameraMode | null = null;
  /** Mean brightness of the last frame, 0..1. Used for the low light warning. */
  brightness = 0.5;

  constructor(private readonly video: HTMLVideoElement) {}

  /** Call every render tick, it does nothing unless there is a new camera frame. */
  update(mode: CameraMode, colors: Colors, force = false): void {
    const { video } = this;
    if (!video.videoWidth) return;
    if (!force && video.currentTime === this.lastTime && mode === this.lastMode) return;
    this.lastTime = video.currentTime;
    this.lastMode = mode;

    if (mode === 'off') {
      this.canvas.width = 1;
      this.canvas.height = 1;
      return;
    }
    const aspect = video.videoHeight / video.videoWidth;
    if (mode === 'mono' || mode === 'color') this.picture(mode === 'mono');
    else if (mode === 'ascii') this.ascii(aspect, colors);
    else this.pixels(mode, aspect, colors);
  }

  /** The camera picture itself, mirrored, optionally in black and white. */
  private picture(mono: boolean): void {
    const { canvas, g, video } = this;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    g.save();
    g.translate(w, 0);
    g.scale(-1, 1);
    g.drawImage(video, 0, 0, w, h);
    g.restore();
    if (mono) {
      // Done by hand instead of with ctx.filter, which Safari does not support.
      const image = g.getImageData(0, 0, w, h);
      const d = image.data;
      for (let o = 0; o < d.length; o += 4) {
        const y = ((d[o] ?? 0) * 54 + (d[o + 1] ?? 0) * 183 + (d[o + 2] ?? 0) * 19) >> 8;
        d[o] = y;
        d[o + 1] = y;
        d[o + 2] = y;
      }
      g.putImageData(image, 0, 0);
    }
    this.grid(32, 24); // only for the brightness reading
  }

  /** Mirrored greyscale grid of the current frame, one byte of brightness per cell. */
  private grid(cols: number, rows: number): Uint8Array {
    const { sample, sg, video } = this;
    if (sample.width !== cols || sample.height !== rows) {
      sample.width = cols;
      sample.height = rows;
    }
    sg.save();
    sg.translate(cols, 0);
    sg.scale(-1, 1);
    sg.drawImage(video, 0, 0, cols, rows);
    sg.restore();
    const rgba = sg.getImageData(0, 0, cols, rows).data;
    const out = new Uint8Array(cols * rows);
    let sum = 0;
    for (let i = 0; i < out.length; i++) {
      const o = i * 4;
      const y = ((rgba[o] ?? 0) * 54 + (rgba[o + 1] ?? 0) * 183 + (rgba[o + 2] ?? 0) * 19) >> 8;
      out[i] = y;
      sum += y;
    }
    this.brightness = sum / out.length / 255;
    return out;
  }

  private buildAtlas(colors: Colors): void {
    const key = `${colors.dim}`;
    if (key === this.atlasKey) return;
    this.atlasKey = key;
    const { atlas } = this;
    atlas.width = RAMP.length * CELL_W;
    atlas.height = CELL_H;
    const g = context2d(atlas);
    g.clearRect(0, 0, atlas.width, atlas.height);
    g.fillStyle = colors.dim;
    g.font = `${CELL_H * 0.82}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    [...RAMP].forEach((ch, i) => g.fillText(ch, i * CELL_W + CELL_W / 2, CELL_H / 2));
  }

  private ascii(aspect: number, colors: Colors): void {
    const cols = ASCII_COLS;
    // Character cells are twice as tall as wide, so half as many rows keep the aspect.
    const rows = Math.round((cols * aspect * CELL_W) / CELL_H);
    const grid = this.grid(cols, rows);
    this.buildAtlas(colors);
    const { canvas, g, atlas } = this;
    if (canvas.width !== cols * CELL_W || canvas.height !== rows * CELL_H) {
      canvas.width = cols * CELL_W;
      canvas.height = rows * CELL_H;
    }
    g.clearRect(0, 0, canvas.width, canvas.height);
    const dark = colors.bg === '#070707';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const y = grid[r * cols + c] ?? 0;
        // On the light theme dark areas get the dense glyphs, like ink on paper.
        const v = dark ? y : (255 - y) * 0.6; // lighter touch, paper should stay mostly empty
        const i = Math.min(RAMP.length - 1, (v * RAMP.length) >> 8);
        if (i === 0) continue;
        g.drawImage(atlas, i * CELL_W, 0, CELL_W, CELL_H, c * CELL_W, r * CELL_H, CELL_W, CELL_H);
      }
    }
  }

  private pixels(mode: 'dither' | 'edges', aspect: number, colors: Colors): void {
    const cols = PIXEL_W;
    const rows = Math.round(cols * aspect);
    const grid = this.grid(cols, rows);
    const { canvas, g } = this;
    if (canvas.width !== cols || canvas.height !== rows) {
      canvas.width = cols;
      canvas.height = rows;
    }
    const image = g.createImageData(cols, rows);
    const [r, gr, b] = colors.fgRgb.split(',').map(Number);
    const dark = colors.bg === '#070707';
    const at = (x: number, y: number): number => grid[y * cols + x] ?? 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let on: boolean;
        if (mode === 'dither') {
          const threshold = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) * 16;
          const v = dark ? at(x, y) : 255 - at(x, y);
          on = v * 0.7 > threshold; // under-exposed on purpose, it has to stay calm
        } else {
          if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) continue;
          // Sobel gradient: bright where neighbouring pixels differ, so only outlines stay.
          const gx =
            at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
            at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
          const gy =
            at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
            at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
          on = Math.abs(gx) + Math.abs(gy) > 110;
        }
        if (!on) continue;
        const o = (y * cols + x) * 4;
        image.data[o] = r ?? 255;
        image.data[o + 1] = gr ?? 255;
        image.data[o + 2] = b ?? 255;
        image.data[o + 3] = mode === 'dither' ? 62 : 150;
      }
    }
    g.putImageData(image, 0, 0);
  }
}
