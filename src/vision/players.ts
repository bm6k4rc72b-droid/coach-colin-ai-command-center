/**
 * Player data types and the pure geometry helpers over them.
 *
 * Deliberately free of any TensorFlow import. The detector runtime needs a GPU,
 * a DOM and a 200MB dependency tree; the question "where is this player
 * standing" is arithmetic over keypoints. Keeping them apart lets the metric
 * code be exercised directly against synthetic tracks, which is the only way to
 * check that a stated "12.9 yards of movement" is actually right.
 */

import type { Point } from './homography.ts';

export type Keypoint = { name: string; x: number; y: number; score: number };

export type Box = { x: number; y: number; width: number; height: number };

export type TrackedPlayer = {
  /** Stable across frames while the tracker holds the player. */
  id: number;
  box: Box;
  keypoints: Keypoint[];
  score: number;
  /** Assigned by the jersey-colour clustering; null until then. */
  team: 0 | 1 | null;
};

/** Keypoints below this confidence are treated as absent rather than trusted. */
const MIN_KEYPOINT_SCORE = 0.3;

export function findKeypoint(player: TrackedPlayer, name: string): Keypoint | null {
  const kp = player.keypoints.find((k) => k.name === name);
  return kp && kp.score >= MIN_KEYPOINT_SCORE ? kp : null;
}

/**
 * Where a player stands on the field: the midpoint between the two ankles.
 *
 * The feet are the only part of a player that is actually on the field plane,
 * which is the plane the homography maps. Using a box centre or the head would
 * project a point floating in the air onto the grass some yards further away.
 */
export function groundPoint(player: TrackedPlayer): Point {
  const left = findKeypoint(player, 'left_ankle');
  const right = findKeypoint(player, 'right_ankle');

  if (left && right) return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const single = left ?? right;
  if (single) return { x: single.x, y: single.y };

  // Feet occluded, a common case in a crowded pocket: the bottom-centre of the
  // box is the best remaining estimate of the contact point with the ground.
  return { x: player.box.x + player.box.width / 2, y: player.box.y + player.box.height };
}

/** Chest-height centre of a player, used for the jersey colour sample. */
export function torsoPoint(player: TrackedPlayer): Point | null {
  const ls = findKeypoint(player, 'left_shoulder');
  const rs = findKeypoint(player, 'right_shoulder');
  const lh = findKeypoint(player, 'left_hip');
  const rh = findKeypoint(player, 'right_hip');
  if (!ls || !rs || !lh || !rh) return null;

  return {
    x: (ls.x + rs.x + lh.x + rh.x) / 4,
    y: (ls.y + rs.y + lh.y + rh.y) / 4,
  };
}
