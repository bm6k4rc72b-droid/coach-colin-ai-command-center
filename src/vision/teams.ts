/**
 * Team assignment from jersey colour.
 *
 * Knowing which players are defenders is what turns "someone is near the QB"
 * into "pressure". Rather than asking the user to tag 22 players, we sample the
 * jersey colour at each player's torso and cluster the frame into two groups.
 *
 * Two persistent centroids are kept and nudged toward the observed colours, so
 * assignments stay stable as players run through shadow, sun and motion blur
 * instead of flipping team every frame.
 */

import type { TrackedPlayer } from './players.ts';
import { torsoPoint } from './players.ts';

type Rgb = { r: number; g: number; b: number };

/** Patch half-width, in pixels, sampled around the torso point. */
const SAMPLE_RADIUS = 6;
/** How fast centroids follow new observations; low keeps assignments stable. */
const CENTROID_LEARNING_RATE = 0.05;

export class TeamClassifier {
  private centroids: [Rgb, Rgb] | null = null;
  private readonly scratch: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor() {
    this.scratch = document.createElement('canvas');
    this.ctx = this.scratch.getContext('2d', { willReadFrequently: true });
  }

  /** Mutates `players`, filling in `team`, and returns the same array. */
  classify(players: TrackedPlayer[], frame: HTMLVideoElement): TrackedPlayer[] {
    if (!this.ctx || players.length === 0) return players;

    const width = frame.videoWidth;
    const height = frame.videoHeight;
    if (width === 0 || height === 0) return players;

    if (this.scratch.width !== width || this.scratch.height !== height) {
      this.scratch.width = width;
      this.scratch.height = height;
    }
    this.ctx.drawImage(frame, 0, 0, width, height);

    const samples = players.map((player) => this.sampleJersey(player, width, height));

    if (!this.centroids) {
      this.centroids = seedCentroids(samples.filter((s): s is Rgb => s !== null));
      if (!this.centroids) return players;
    }

    for (let i = 0; i < players.length; i++) {
      const sample = samples[i];
      if (!sample) continue;

      const d0 = colourDistance(sample, this.centroids[0]);
      const d1 = colourDistance(sample, this.centroids[1]);
      const team: 0 | 1 = d0 <= d1 ? 0 : 1;
      players[i].team = team;

      this.centroids[team] = blend(this.centroids[team], sample, CENTROID_LEARNING_RATE);
    }

    return players;
  }

  /** Drop learned colours — call when the camera moves to a new matchup. */
  reset(): void {
    this.centroids = null;
  }

  private sampleJersey(player: TrackedPlayer, width: number, height: number): Rgb | null {
    if (!this.ctx) return null;

    const torso = torsoPoint(player);
    if (!torso) return null;

    const x = Math.round(torso.x) - SAMPLE_RADIUS;
    const y = Math.round(torso.y) - SAMPLE_RADIUS;
    const size = SAMPLE_RADIUS * 2;
    if (x < 0 || y < 0 || x + size > width || y + size > height) return null;

    const { data } = this.ctx.getImageData(x, y, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return { r: r / pixels, g: g / pixels, b: b / pixels };
  }
}

/**
 * Seed the two centroids with the most-separated pair of observed colours.
 *
 * Picking the extremes rather than random starts avoids the classic k-means
 * failure where both centroids land inside one team's jerseys and the split
 * ends up arbitrary.
 */
function seedCentroids(samples: Rgb[]): [Rgb, Rgb] | null {
  if (samples.length < 2) return null;

  let best: [Rgb, Rgb] = [samples[0], samples[1]];
  let bestDistance = -1;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const d = colourDistance(samples[i], samples[j]);
      if (d > bestDistance) {
        bestDistance = d;
        best = [samples[i], samples[j]];
      }
    }
  }
  return best;
}

function colourDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function blend(centroid: Rgb, sample: Rgb, rate: number): Rgb {
  return {
    r: centroid.r + (sample.r - centroid.r) * rate,
    g: centroid.g + (sample.g - centroid.g) * rate,
    b: centroid.b + (sample.b - centroid.b) * rate,
  };
}
