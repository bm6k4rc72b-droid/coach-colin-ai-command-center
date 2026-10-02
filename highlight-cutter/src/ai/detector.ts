/**
 * Optional object detection with TensorFlow.js COCO-SSD (SSDLite MobileNet v2, 80 everyday
 * classes). Lazy-loaded the first time it is switched on; weights are self-hosted with the app
 * (scripts/fetch-models.mjs) with Google's model storage as the fallback. Runs on your device.
 */
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';

/** Classes that suggest action in sports / activity footage, and how much each counts. */
const ACTION: Record<string, number> = { person: 1, 'sports ball': 3, 'skateboard': 2, 'surfboard': 2, 'skis': 2, 'snowboard': 2, 'bicycle': 1.5, 'motorcycle': 1.5, 'frisbee': 2, 'tennis racket': 2, 'baseball bat': 2, 'dog': 1 };

export class ObjectScorer {
  private model: ObjectDetection | null = null;
  private loading: Promise<void> | null = null;
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  error = '';
  lastLabels: string[] = [];

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.status = 'loading';
    this.loading = (async () => {
      try {
        const tf = await import('@tensorflow/tfjs');
        await tf.ready();
        const coco = await import('@tensorflow-models/coco-ssd');
        const local = new URL('models/coco-ssd/model.json', document.baseURI).href;
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

  /** "Action" score for one frame: confidence-weighted count of action-related objects. */
  async score(img: HTMLCanvasElement): Promise<number> {
    if (!this.model) return 0;
    const preds = await this.model.detect(img, 20, 0.35);
    this.lastLabels = preds.map((p) => p.class);
    return preds.reduce((s, p) => s + (ACTION[p.class] ?? 0) * p.score, 0);
  }
}
