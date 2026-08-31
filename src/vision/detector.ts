/**
 * Multi-player detection and tracking.
 *
 * MoveNet MultiPose gives us, per frame, up to 6 people with 17 keypoints each
 * plus a bounding box, and — with tracking enabled — a stable id across frames.
 * That id is what makes a "player" a continuous thing rather than a fresh blob
 * every frame, and it is the PID shown on the overlay.
 *
 * Pose keypoints rather than plain boxes matter here: a box centre drifts as a
 * player's arms swing, while the ankles stay on the field plane the homography
 * actually maps.
 *
 * Pure helpers over the output live in ./players.ts, which this module does not
 * wrap, so callers that only need geometry can avoid loading TensorFlow.
 */

import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import type { Keypoint, Box, TrackedPlayer } from './players.ts';

export type { Keypoint, Box, TrackedPlayer } from './players.ts';
export { findKeypoint, groundPoint, torsoPoint } from './players.ts';

/**
 * Weights are fetched from TF Hub by default. Point VITE_MOVENET_MODEL_URL at a
 * self-hosted copy to run without internet — worth doing for practice fields
 * with no usable signal, and required in any network that blocks tfhub.dev.
 * See README, "Self-hosting the model weights".
 */
const MODEL_URL: string | undefined = import.meta.env?.VITE_MOVENET_MODEL_URL;

export class PlayerDetector {
  private detector: poseDetection.PoseDetector | null = null;

  async load(): Promise<void> {
    await tf.setBackend('webgl');
    await tf.ready();

    this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
      enableTracking: true,
      // A bounding-box tracker is the right choice for football: players are
      // constantly occluded by each other, and box overlap survives that far
      // better than keypoint matching, which needs limbs to stay visible.
      trackerType: poseDetection.TrackerType.BoundingBox,
      // maxAge is in milliseconds: hold a track through a second of occlusion so
      // a quarterback swallowed by the pocket keeps his id when he emerges.
      trackerConfig: { maxTracks: 12, maxAge: 1000, minSimilarity: 0.15 },
      ...(MODEL_URL ? { modelUrl: MODEL_URL } : {}),
    });
  }

  get ready(): boolean {
    return this.detector !== null;
  }

  async detect(source: HTMLVideoElement, timestampMs: number): Promise<TrackedPlayer[]> {
    if (!this.detector) return [];

    const poses = await this.detector.estimatePoses(source, {}, timestampMs);

    return poses
      .filter((pose) => (pose.score ?? 0) >= 0.2)
      .map((pose, index) => {
        const keypoints: Keypoint[] = pose.keypoints.map((k) => ({
          name: k.name ?? 'unknown',
          x: k.x,
          y: k.y,
          score: k.score ?? 0,
        }));

        return {
          id: pose.id ?? index,
          box: boxFrom(pose, keypoints),
          keypoints,
          score: pose.score ?? 0,
          team: null,
        } satisfies TrackedPlayer;
      });
  }

  dispose(): void {
    this.detector?.dispose();
    this.detector = null;
  }
}

function boxFrom(pose: poseDetection.Pose, keypoints: Keypoint[]): Box {
  if (pose.box) {
    return {
      x: pose.box.xMin,
      y: pose.box.yMin,
      width: pose.box.width,
      height: pose.box.height,
    };
  }

  // MoveNet omits the box when tracking is off; fall back to the keypoint hull.
  const confident = keypoints.filter((k) => k.score >= 0.3);
  const pts = confident.length > 0 ? confident : keypoints;
  const xs = pts.map((k) => k.x);
  const ys = pts.map((k) => k.y);
  const xMin = Math.min(...xs);
  const yMin = Math.min(...ys);

  return { x: xMin, y: yMin, width: Math.max(...xs) - xMin, height: Math.max(...ys) - yMin };
}
