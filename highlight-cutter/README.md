# Highlight Cutter — AI video highlights (educational)

Find the best moments of a video and cut them into a reel, entirely in the browser. Your video is
decoded locally and never uploaded. The app shows its working: every feature is drawn on a
timeline, and each picked clip says why it was chosen.

```bash
npm install     # prebuild/predev also self-host the COCO-SSD weights into public/
npm run dev     # http://localhost:5173
npm test        # signal + vision maths, picking, demo match end to end, tour
npm run build
```

## How it decides

| Step | Technique | Code |
| --- | --- | --- |
| Loudness | Web Audio `decodeAudioData` → RMS per 50 ms → dB | `core/signal.ts`, `media/source.ts` |
| Motion | 96×54 greyscale frames, mean absolute frame difference | `core/vision.ts` |
| Scene cuts | Luma histogram distance above an adaptive threshold | `detectCuts()` |
| Objects (optional) | TensorFlow.js COCO-SSD: people, balls, boards, bikes | `ai/detector.ts` |
| Scaling | Robust median → 97th percentile scaling | `robustScale()` |
| Fusion | Weighted sum, or a sum × agreement (geometric mean) | `core/highlights.ts` |
| Picking | Best-first peaks, minimum gap, relative threshold, padding, merge | `pick()` |
| Export | Canvas `captureStream()` + audio graph → MediaRecorder `.webm` | `media/player.ts` |

## The demo has an answer key

The synthetic 60-second match (`core/demo.ts`) contains five real highlights and two traps:

- an advert break with loud music and no action
- a fast camera pan with a silent crowd

The results card grades each pick:

- **Loudness alone** is fooled by the advert.
- **Motion alone** is fooled by the pan.
- **A weighted sum** still lets the advert through.
- **Requiring agreement** finds 5/5 with no traps.

The tests check all of this end to end using a small software rasteriser.

## What pro tools add

The app's tech panel explains each of these:

- Whisper speech-to-text
- CLIP/SigLIP text-to-moment search
- YAMNet sound-event classification
- MediaPipe pose estimation
- LLM-driven edit decisions
- ffmpeg.wasm frame-accurate MP4 export
