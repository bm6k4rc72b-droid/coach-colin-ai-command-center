// Pure mapping from the lab state to how each body piece should look.
import * as THREE from 'three';
import { GENES } from '../data/genes';
import type { System } from '../data/genes';

export interface PieceTarget {
  visible: boolean;
  scale: number;
  glow: number;
  glowColor: THREE.Color;
  dim: number;
}

const ALIEN: Partial<Record<System, string>> = {
  muscles: '#4F8F88',
  skeleton: '#D8CCA2',
  arteries: '#7B5CC2',
  veins: '#3F6FB2',
  heart: '#6E4FB0',
  nervous: '#E2C46A',
  respiratory: '#86B7C9',
};

export const BASE_COLOR: Record<System, string> = {
  skeleton: '#E6DDC8',
  muscles: '#C47D6F',
  heart: '#B04B48',
  sensory: '#D5DCDC',
  arteries: '#C9574B',
  veins: '#5D79A6',
  nervous: '#E3CD93',
  respiratory: '#DDB2B1',
};

export function baseColor(system: System, alien: boolean) {
  return new THREE.Color(alien ? (ALIEN[system] ?? BASE_COLOR[system]) : BASE_COLOR[system]);
}

/** Fiction amplifies the real visual change up to 3x. */
export const amplify = (fiction: number) => 1 + 2 * fiction;

export function targetFor(system: System, region: string, active: string[], fiction: number, visibleSystems: System[]): PieceTarget {
  const t: PieceTarget = { visible: visibleSystems.includes(system), scale: 1, glow: 0, glowColor: new THREE.Color(0, 0, 0), dim: 0 };
  const k = amplify(fiction);
  for (const g of GENES) {
    if (!active.includes(g.id)) continue;
    const v = g.visual;
    if (!v.systems.includes(system)) continue;
    if (v.regions && !v.regions.includes(region)) continue;
    if (v.scale) t.scale += v.scale * k;
    if (v.glow && v.glow > t.glow) {
      t.glow = Math.min(1, v.glow * (0.7 + 0.3 * k));
      t.glowColor.set(g.color);
    }
    if (v.dim) t.dim = Math.min(1, 0.6 + 0.4 * fiction);
  }
  return t;
}
