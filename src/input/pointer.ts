import type { TrackedFrame } from '../tracking/tracker';
import { syntheticHand } from './synthetic';

// Fallback for no camera or no permission: the pointer becomes the hand.
// Position inside the camera frame works like hand position (up/down pitch, left/right
// tone), and pressing is a pinch, which strikes a note on the bell and kalimba.
// With a mouse the sound follows the cursor while it is over the frame. With touch it
// plays while a finger is down.

/** The camera frame inside the element, in CSS pixels. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function startPointer(
  target: HTMLElement,
  frameRect: () => FrameRect,
  onFrame: (frame: TrackedFrame) => void,
): void {
  let inside = false;
  let pressed = false;
  let x = 0.5;
  let y = 0.5;

  const move = (e: PointerEvent): void => {
    const box = target.getBoundingClientRect();
    const f = frameRect();
    x = (e.clientX - box.left - f.x) / f.w;
    y = (e.clientY - box.top - f.y) / f.h;
    inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  };
  target.style.touchAction = 'none'; // a finger on the frame plays, it does not scroll
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerdown', (e) => {
    move(e);
    pressed = true;
    target.setPointerCapture(e.pointerId);
  });
  const up = (e: PointerEvent): void => {
    pressed = false;
    if (e.pointerType !== 'mouse') inside = false; // a lifted finger is a hand leaving
  };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('pointerleave', () => {
    if (!pressed) inside = false;
  });

  setInterval(() => {
    if (!inside) return; // no frames, so the usual hand-lost release takes over
    const f = frameRect();
    const hand = syntheticHand({ x: 1 - x, y, size: 0.12, pinch: pressed, aspect: f.h / f.w });
    onFrame({ hands: [hand], world: [hand], time: performance.now(), inferMs: 0, captureAgeMs: null });
  }, 33);
}
