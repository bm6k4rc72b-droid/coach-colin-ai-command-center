/**
 * Real person detection with TensorFlow.js COCO-SSD (lite MobileNet v2), used as the cloak's
 * "red team". Lazy-loaded; weights download from Google's tfjs-models storage on first use.
 */
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
import { MEDIAPIPE } from '../config/lab';

export interface Detection {
  score: number;
  bbox: [number, number, number, number];
}

export class PersonDetector {
  private model: ObjectDetection | null = null;
  private loading: Promise<void> | null = null;
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  error = '';
  lastMs = 0;

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    this.loading = (async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();
        const coco = await import('@tensorflow-models/coco-ssd');
        const local = new URL(MEDIAPIPE.cocoLocal, document.baseURI).href;
        try {
          this.model = await coco.load({ base: 'lite_mobilenet_v2', modelUrl: local });
        } catch {
          this.model = await coco.load({ base: 'lite_mobilenet_v2' });
        }
        this.status = 'ready';
      } catch (e) {
        this.status = 'error';
        this.error = e instanceof Error ? e.message : String(e);
      }
    })();
    return this.loading;
  }

  /** Best person detection in the image (score 0 if none). */
  async detectPerson(img: HTMLCanvasElement): Promise<Detection> {
    if (!this.model) return { score: 0, bbox: [0, 0, 0, 0] };
    const t0 = performance.now();
    const preds = await this.model.detect(img, 10, 0.15);
    this.lastMs = performance.now() - t0;
    const people = preds.filter((p) => p.class === 'person').sort((a, b) => b.score - a.score);
    return people.length ? { score: people[0].score, bbox: people[0].bbox as Detection['bbox'] } : { score: 0, bbox: [0, 0, 0, 0] };
  }
}
