/** Keeps a canvas' pixel size in sync with its CSS size and the screen's pixel ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, onResize?: () => void): { dpr: number } {
  const state = { dpr: 1 };
  const fit = (): void => {
    state.dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * state.dpr);
    const h = Math.round(canvas.clientHeight * state.dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      onResize?.();
    }
  };
  new ResizeObserver(fit).observe(canvas);
  fit();
  return state;
}

export function context2d(canvas: HTMLCanvasElement | OffscreenCanvas, readback = false) {
  const g = canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!g) throw new Error('2d context unavailable');
  return g as CanvasRenderingContext2D;
}

export const font = (size: number, dpr: number): string =>
  `${size * dpr}px "IBM Plex Mono", ui-monospace, monospace`;
