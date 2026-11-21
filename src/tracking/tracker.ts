import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Point } from '../input/hands';

// Tracking runs on the main thread. Measured on an M-series MacBook Air in Chrome:
// about 10 ms per frame on the GPU delegate at the camera's 30 fps, so a worker would
// add complexity (and Safari risk) without buying anything.

export interface TrackedFrame {
  /** Normalised image landmarks per hand, unmirrored. */
  hands: Point[][];
  /** Metric 3d landmarks per hand, same order. */
  world: Point[][];
  /** performance.now() when the landmarks became available. */
  time: number;
  inferMs: number;
  /** Camera capture to landmarks, when the browser reports capture time. */
  captureAgeMs: number | null;
}

export interface Tracker {
  readonly delegate: 'GPU' | 'CPU';
  start(video: HTMLVideoElement, onFrame: (frame: TrackedFrame) => void): void;
}

const MODEL_URL = '/mediapipe/hand_landmarker.task';
const MODEL_BYTES = 7_819_105; // fallback when the server sends no content length

/** Downloads the model by hand so the boot log can show real progress. */
async function fetchModel(onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`hand model failed to load (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(0.99, received / total));
  }
  const model = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.length;
  }
  return model;
}

export async function createTracker(onProgress: (fraction: number) => void): Promise<Tracker> {
  const [fileset, model] = await Promise.all([
    FilesetResolver.forVisionTasks('/mediapipe/wasm'),
    fetchModel(onProgress),
  ]);
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });

  let delegate: 'GPU' | 'CPU' = 'GPU';
  let landmarker: HandLandmarker;
  try {
    landmarker = await make('GPU');
  } catch (err) {
    console.warn('GPU delegate failed, falling back to CPU', err);
    delegate = 'CPU';
    landmarker = await make('CPU');
  }

  const detect = (
    video: HTMLVideoElement,
    now: number,
    captureTime: number | undefined,
  ): TrackedFrame | null => {
    if (document.hidden || video.readyState < 2) return null;
    const t0 = performance.now();
    const result = landmarker.detectForVideo(video, now);
    const t1 = performance.now();
    // Only trust the capture time when it is on the same clock as performance.now().
    const age = captureTime === undefined ? Number.NaN : t1 - captureTime;
    return {
      hands: result.landmarks,
      world: result.worldLandmarks,
      time: t1,
      inferMs: t1 - t0,
      captureAgeMs: age > 0 && age < 1000 ? age : null,
    };
  };

  return {
    delegate,
    start(video, onFrame) {
      const emit = (now: number, captureTime: number | undefined): void => {
        const frame = detect(video, now, captureTime);
        if (frame) onFrame(frame);
      };
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        // Fires once per new camera frame, so the model never runs twice on one frame.
        const step: VideoFrameRequestCallback = (now, meta) => {
          emit(now, meta.captureTime);
          video.requestVideoFrameCallback(step);
        };
        video.requestVideoFrameCallback(step);
      } else {
        let lastTime = -1;
        const step = (now: number): void => {
          if (video.currentTime !== lastTime) {
            lastTime = video.currentTime;
            emit(now, undefined);
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    },
  };
}
