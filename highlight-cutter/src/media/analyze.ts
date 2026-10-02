/** Browser analysis pass: sample frames, decode audio, optionally detect objects → Features. */
import { FeatureBuilder } from '../core/extract';
import type { Features } from '../core/highlights';
import { luma } from '../core/vision';
import type { ObjectScorer } from '../ai/detector';
import type { Source } from './source';

/** Sampling interval: 0.5 s, coarser for long clips so analysis stays under ~600 frames. */
export const stepFor = (duration: number) => Math.max(0.5, Math.ceil((duration / 600) * 2) / 2);

export async function analyze(
  src: Source,
  objects: ObjectScorer | null,
  onProgress: (frac: number, label: string) => void,
  cancelled: () => boolean = () => false,
): Promise<Features | null> {
  const step = stepFor(src.duration);
  const fb = new FeatureBuilder(step, src.duration);
  const small = document.createElement('canvas');
  small.width = 96;
  small.height = 54;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  const big = document.createElement('canvas');
  big.width = 320;
  big.height = 180;
  const bctx = big.getContext('2d')!;
  const obj: number[] = [];

  onProgress(0, 'Decoding audio…');
  const audio = await src.audio();
  const n = Math.max(2, Math.floor(src.duration / step));
  for (let i = 0; i < n; i++) {
    if (cancelled()) return null;
    const t = i * step;
    await src.frameAt(sctx, 96, 54, t);
    fb.addFrame(luma(sctx.getImageData(0, 0, 96, 54).data));
    if (objects) {
      await src.frameAt(bctx, 320, 180, t);
      obj.push(await objects.score(big));
    }
    if (i % 4 === 0) {
      onProgress(i / n, `Frame ${i + 1}/${n} at ${t.toFixed(1)} s`);
      await new Promise((r) => setTimeout(r, 0)); // let the page repaint
    }
  }
  if (audio) fb.setAudio(audio.samples, audio.rate);
  if (objects) fb.objects = obj;
  onProgress(1, 'Done');
  return fb.build();
}
