import type { Colors } from '../ui/theme';
import { context2d, fitCanvas } from './canvas';

// Scope panel: oscilloscope on the left, spectrum on the right. Both read the same
// post-master analyser, so they show exactly what reaches the speakers.

const BARS = 40;
const MIN_HZ = 50;
const MAX_HZ = 12000;

export class Scope {
  private readonly g: CanvasRenderingContext2D;
  private readonly size: { dpr: number };
  private wave: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(0));
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = context2d(canvas);
    this.size = fitCanvas(canvas);
  }

  draw(analyser: AnalyserNode | null, colors: Colors): void {
    const { g, canvas } = this;
    const dpr = this.size.dpr;
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const pad = 12 * dpr;
    const split = Math.round(w * 0.7);
    const mid = Math.round(h / 2) + 0.5;

    g.strokeStyle = colors.line;
    g.lineWidth = dpr;
    g.beginPath();
    g.moveTo(pad, mid);
    g.lineTo(split - pad, mid);
    g.moveTo(split + 0.5, pad);
    g.lineTo(split + 0.5, h - pad);
    g.stroke();
    if (!analyser) return;

    if (this.wave.length !== analyser.fftSize) {
      this.wave = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    analyser.getFloatTimeDomainData(this.wave);
    analyser.getByteFrequencyData(this.bins);

    // Start drawing at a rising zero crossing so a steady tone stands still.
    const { wave } = this;
    const span = wave.length / 2;
    let start = 0;
    for (let i = 1; i < span; i++) {
      if ((wave[i - 1] ?? 0) < 0 && (wave[i] ?? 0) >= 0) {
        start = i;
        break;
      }
    }
    // Scale to the loudest sample so a quiet note is still readable. The floor keeps
    // silence from being blown up into noise.
    let peak = 0.05;
    for (let i = 0; i < span; i++) peak = Math.max(peak, Math.abs(wave[start + i] ?? 0));
    const width = split - pad * 2;
    const amp = (h / 2 - pad) * 0.85;
    g.strokeStyle = colors.accent;
    g.lineWidth = 1.5 * dpr;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < span; i++) {
      const x = pad + (i / (span - 1)) * width;
      const y = mid - ((wave[start + i] ?? 0) / peak) * amp;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();

    // Spectrum on a log frequency axis, which is how pitch is heard.
    const nyquist = analyser.context.sampleRate / 2;
    const left = split + pad;
    const barW = (w - left - pad) / BARS;
    g.fillStyle = colors.accent;
    for (let b = 0; b < BARS; b++) {
      const f0 = MIN_HZ * (MAX_HZ / MIN_HZ) ** (b / BARS);
      const f1 = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((b + 1) / BARS);
      const i0 = Math.floor((f0 / nyquist) * this.bins.length);
      const i1 = Math.max(i0 + 1, Math.ceil((f1 / nyquist) * this.bins.length));
      let peak = 0;
      for (let i = i0; i < i1; i++) peak = Math.max(peak, this.bins[i] ?? 0);
      const bar = Math.max(dpr, (peak / 255) * (h - pad * 2));
      g.fillRect(Math.round(left + b * barW), h - pad - bar, Math.max(dpr, barW - 2 * dpr), bar);
    }
  }
}
