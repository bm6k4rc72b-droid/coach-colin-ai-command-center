/**
 * Real person segmentation with MediaPipe Tasks Vision (Image Segmenter, selfie model), running
 * in the browser. Lazy-loaded: the WASM runtime comes from a CDN, the model is bundled.
 */
import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { MEDIAPIPE } from '../config/lab';

export class PersonSegmenter {
  private seg: ImageSegmenter | null = null;
  private loading: Promise<void> | null = null;
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  error = '';
  delegate: 'GPU' | 'CPU' = 'GPU';
  lastMs = 0;

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    this.loading = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
        const modelAssetPath = new URL(MEDIAPIPE.segmenterModel, document.baseURI).href;
        const local = new URL(MEDIAPIPE.wasmLocal, document.baseURI).href.replace(/\/$/, '');
        const make = async (delegate: 'GPU' | 'CPU', wasm: string) =>
          ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks(wasm), {
            baseOptions: { modelAssetPath, delegate },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        const attempts: ['GPU' | 'CPU', string][] = [
          ['GPU', local],
          ['CPU', local],
          ['GPU', MEDIAPIPE.wasmCdn],
          ['CPU', MEDIAPIPE.wasmCdn],
        ];
        let lastErr: unknown = null;
        for (const [delegate, wasm] of attempts) {
          try {
            this.seg = await make(delegate, wasm);
            this.delegate = delegate;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!this.seg) throw lastErr instanceof Error ? lastErr : new Error('MediaPipe runtime could not be loaded');
        this.status = 'ready';
      } catch (e) {
        this.status = 'error';
        this.error = e instanceof Error ? e.message : String(e);
      }
    })();
    return this.loading;
  }

  /** Person confidence (0..1) per pixel at w×h, or null if not ready. */
  segment(source: HTMLCanvasElement, w: number, h: number, timestampMs: number): Float32Array | null {
    if (!this.seg) return null;
    const t0 = performance.now();
    const result = this.seg.segmentForVideo(source, timestampMs);
    const mask = result.confidenceMasks?.[0];
    let out: Float32Array | null = null;
    if (mask) {
      const data = mask.getAsFloat32Array();
      if (mask.width === w && mask.height === h) out = new Float32Array(data);
      else {
        out = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
          const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / h));
          for (let x = 0; x < w; x++) out[y * w + x] = data[sy * mask.width + Math.min(mask.width - 1, Math.floor((x * mask.width) / w))];
        }
      }
    }
    result.close();
    this.lastMs = performance.now() - t0;
    return out;
  }
}
