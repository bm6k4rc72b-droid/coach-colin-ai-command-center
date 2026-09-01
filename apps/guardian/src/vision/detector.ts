/**
 * Binding to the native detection plugin.
 *
 * The heavy lifting happens in a Vision Camera frame processor plugin written
 * in Swift (Core ML) and Kotlin (LiteRT). Those live under ios/ and android/
 * and are built by EAS; see README for the build steps.
 *
 * Until that plugin is compiled in, `detect` returns an empty frame rather than
 * throwing, so the app installs, runs, shows the camera and exercises every
 * screen on day one. That matters: you can test the whole product loop —
 * permissions, zones, events, notifications — before the model is ready.
 */
import { VisionCameraProxy, type Frame as CameraFrame } from 'react-native-vision-camera';
import type { Detection, DetectionLabel } from '../core/types.ts';

export interface DetectorOutput {
  detections: Detection[];
  /** Mean luma, 0..1. Feeds the illumination-transient gate. */
  brightness: number;
  /** True when the native plugin is present; false means we are running blind. */
  live: boolean;
}

const plugin = VisionCameraProxy.initFrameProcessorPlugin('guardianDetect', {});

const EMPTY: DetectorOutput = { detections: [], brightness: 0.5, live: false };

interface RawBox {
  x: number; y: number; w: number; h: number; score: number; label: string;
}

function toLabel(raw: string): DetectionLabel {
  'worklet';
  if (raw === 'person') return 'person';
  if (raw === 'car' || raw === 'truck' || raw === 'bus' || raw === 'motorcycle') return 'vehicle';
  if (raw === 'cat' || raw === 'dog' || raw === 'bird' || raw === 'horse') return 'animal';
  return 'other';
}

/**
 * Runs on the worklet thread — never call this from React. `scoreFloor` is
 * applied natively so weak boxes never cross the bridge.
 */
export function detect(frame: CameraFrame, scoreFloor: number): DetectorOutput {
  'worklet';
  if (plugin == null) return EMPTY;

  const raw = plugin.call(frame, { scoreFloor }) as unknown as
    { boxes: RawBox[]; brightness: number } | null;
  if (raw == null) return EMPTY;

  const detections: Detection[] = [];
  for (let i = 0; i < raw.boxes.length; i++) {
    const b = raw.boxes[i];
    detections.push({
      box: { x: b.x, y: b.y, w: b.w, h: b.h },
      score: b.score,
      label: toLabel(b.label),
    });
  }
  return { detections, brightness: raw.brightness, live: true };
}

export const detectorAvailable = plugin != null;
