/**
 * Box and path geometry in normalised frame coordinates.
 * Pure functions, no allocation in hot paths beyond what is unavoidable.
 */

import type { Box, Point } from './types.ts';

export function area(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

export function intersection(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

export function iou(a: Box, b: Box): number {
  const inter = intersection(a, b);
  if (inter === 0) return 0;
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function center(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/**
 * Ground-contact point — bottom-centre of the box. This is what we test against
 * zone polygons: where a person's feet are, not where their torso is. Using the
 * centroid instead makes a tall person near a zone edge read as inside it.
 */
export function foot(b: Box): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h };
}

export function aspect(b: Box): number {
  return b.w <= 0 ? 0 : b.h / b.w;
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Total distance travelled along a path. */
export function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}

/** Straight-line distance from first to last point. */
export function netDisplacement(path: Point[]): number {
  if (path.length < 2) return 0;
  return distance(path[0], path[path.length - 1]);
}

/**
 * Ratio of net displacement to distance travelled, 0..1.
 *
 * A person crossing a garden scores high — they go somewhere. A branch in wind
 * travels a long way but ends where it started, scoring near zero. This single
 * number is the cheapest strong discriminator we have against foliage.
 *
 * Returns 1 for paths too short to judge, so brand-new tracks are not
 * suppressed by this rule before they have moved at all.
 */
export function straightness(path: Point[]): number {
  const len = pathLength(path);
  if (len < 1e-6) return 1;
  return netDisplacement(path) / len;
}

/**
 * Ray-casting point-in-polygon. Points exactly on an edge are treated as
 * inside for the vertical-crossing convention used here; zone edges are
 * user-drawn and approximate, so edge behaviour is not load-bearing.
 */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < xCross) inside = !inside;
  }
  return inside;
}

/** Clamp a box to the frame, preserving as much of it as possible. */
export function clampBox(b: Box): Box {
  const x = Math.min(Math.max(b.x, 0), 1);
  const y = Math.min(Math.max(b.y, 0), 1);
  return {
    x,
    y,
    w: Math.min(b.w, 1 - x),
    h: Math.min(b.h, 1 - y),
  };
}

/** Advance a box by a per-frame velocity, used for short-horizon prediction. */
export function predict(b: Box, v: Point): Box {
  return clampBox({ x: b.x + v.x, y: b.y + v.y, w: b.w, h: b.h });
}
