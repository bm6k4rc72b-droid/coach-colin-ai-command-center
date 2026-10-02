/**
 * Hover picking in the 3D view (measure tool): which vessel is under the cursor and its
 * lumen diameter there.
 */
import * as THREE from 'three';
import type { VesselId } from '../anatomy/vessels';
import type { SceneRenderer } from '../scene/renderer';

export interface HoverInfo {
  vessel: VesselId;
  name: string;
  s: number;
  diameter: number;
  reference: number;
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function pickVessel(r: SceneRenderer, x: number, y: number, names: (id: VesselId) => string): HoverInfo | null {
  ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
  ray.setFromCamera(ndc, r.orbit.camera);
  const hits = ray.intersectObjects(r.vessels.pickables, false);
  if (!hits.length) return null;
  const h = hits[0];
  const id = h.object.userData.vessel as VesselId;
  const d = r.vessels.diameterAtHit(id, h.point);
  if (!d) return null;
  return { vessel: id, name: names(id), s: d.s, diameter: d.d, reference: d.ref };
}
