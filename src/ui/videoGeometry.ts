/**
 * Screen <-> video coordinate mapping.
 *
 * The detector reports positions in the video's intrinsic pixels (e.g. 1280x720)
 * while taps arrive in CSS pixels against an element that is letterboxed by
 * `object-fit: contain`. Every tap — calibration corners, picking the QB,
 * marking where the ball landed — has to cross that gap exactly, or the
 * homography is calibrated against the wrong points.
 */

export type Rect = { left: number; top: number; width: number; height: number };

/** The area inside `element` actually covered by video under object-fit: contain. */
export function contentRect(element: HTMLVideoElement): Rect | null {
  const { videoWidth, videoHeight } = element;
  if (videoWidth === 0 || videoHeight === 0) return null;

  const box = element.getBoundingClientRect();
  const scale = Math.min(box.width / videoWidth, box.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;

  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

/** Convert a pointer event into intrinsic video pixels, or null if outside. */
export function clientToVideo(
  element: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = contentRect(element);
  if (!rect) return null;

  const x = ((clientX - rect.left) / rect.width) * element.videoWidth;
  const y = ((clientY - rect.top) / rect.height) * element.videoHeight;

  if (x < 0 || y < 0 || x > element.videoWidth || y > element.videoHeight) return null;
  return { x, y };
}
