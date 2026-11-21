import type { Colors } from '../ui/theme';
import { context2d, font } from './canvas';
import type { View } from './view';

// Records the stylised camera view with the hand overlay, the scope and the sound.
// The whole page cannot be captured without a screen-share prompt, so the recording is
// composed on its own canvas: camera frame on top, scope strip below, watermark in the
// corner. The watermark exists only in the recording, never on screen.

const WIDTH = 1280;
const STRIP = 110;
const MAX_MS = 30_000;
const WATERMARK = 'thereminal · flynndiener.ch';
// mp4 first because it plays everywhere it gets shared, webm as the fallback.
const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export class Recorder {
  private readonly canvas = document.createElement('canvas');
  private readonly g = context2d(this.canvas);
  private recorder: MediaRecorder | null = null;
  private startedAt = 0;
  private timer = 0;
  private label = '';

  constructor(
    private readonly view: View,
    private readonly scope: HTMLCanvasElement,
    private readonly onChange: () => void,
  ) {}

  static get supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && TYPES.some((t) => MediaRecorder.isTypeSupported(t));
  }

  get active(): boolean {
    return this.recorder !== null;
  }

  get seconds(): number {
    return this.active ? Math.floor((performance.now() - this.startedAt) / 1000) : 0;
  }

  /** @param label shown bottom left, for example "glass-pad, C minor pent" */
  start(audio: MediaStream, label: string, name: string): void {
    if (this.active) return;
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return;
    const frame = this.view.frame;
    this.canvas.width = WIDTH;
    this.canvas.height = Math.round((WIDTH * frame.h) / frame.w / 2) * 2 + STRIP; // even, encoders want that
    this.label = label;

    const stream = this.canvas.captureStream(30);
    for (const track of audio.getAudioTracks()) stream.addTrack(track);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${name}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    };
    recorder.start(1000);
    this.recorder = recorder;
    this.startedAt = performance.now();
    this.timer = window.setTimeout(() => this.stop(), MAX_MS);
    this.onChange();
  }

  stop(): void {
    if (!this.recorder) return;
    clearTimeout(this.timer);
    this.recorder.stop();
    this.recorder = null;
    this.onChange();
  }

  /** Composes one frame. Call every render tick, it does nothing unless recording. */
  draw(colors: Colors): void {
    if (!this.active) return;
    const { g, canvas, view, scope } = this;
    const w = canvas.width;
    const camH = canvas.height - STRIP;
    const f = view.frame;
    g.fillStyle = colors.bg;
    g.fillRect(0, 0, w, canvas.height);
    g.drawImage(view.canvas, f.x, f.y, f.w, f.h, 0, 0, w, camH);
    g.drawImage(scope, 0, camH, w, STRIP);
    g.fillStyle = colors.line;
    g.fillRect(0, camH, w, 1);

    g.font = font(18, 1);
    g.textBaseline = 'alphabetic';
    const pad = 18;
    const text = (s: string, align: CanvasTextAlign, x: number): void => {
      g.textAlign = align;
      const m = g.measureText(s).width;
      g.fillStyle = `rgba(${colors.dark ? '7, 7, 7' : '244, 244, 241'}, 0.7)`;
      g.fillRect(align === 'left' ? x - 8 : x - m - 8, camH - pad - 22, m + 16, 30);
      g.fillStyle = colors.fg;
      g.fillText(s, x, camH - pad);
    };
    text(this.label, 'left', pad + 8);
    text(WATERMARK, 'right', w - pad - 8);
    g.textAlign = 'left';
  }
}
