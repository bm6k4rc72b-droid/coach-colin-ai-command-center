/**
 * Stub for @mediapipe/pose.
 *
 * pose-detection statically imports the MediaPipe BlazePose runtime even when
 * only MoveNet is used, and that package ships a non-ESM bundle with no `Pose`
 * export, which fails the production build. This app never selects the
 * MediaPipe runtime (see PlayerDetector, which requests MoveNet), so aliasing
 * it to an inert class drops roughly a megabyte of unused solver from the
 * bundle instead of shipping a workaround for code that cannot run.
 *
 * If a BlazePose runtime is ever wanted, remove the alias in vite.config.ts and
 * load MediaPipe from its CDN as that package expects.
 */

export class Pose {
  constructor() {
    throw new Error(
      'The MediaPipe BlazePose runtime is not bundled. This app uses the MoveNet runtime.',
    );
  }
}

export default { Pose };
