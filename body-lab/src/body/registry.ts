// The whole body, assembled from Human Atlas's BodyParts3D systems. Every
// piece is its own mesh so it can be hovered, selected, ghosted and animated.
import * as THREE from 'three';
import type { Layer } from '../state/store';
import type { AtlasManifest, AtlasPiece } from '../types';

/** Height of the round dais the body stands on. */
export const DAIS_TOP = 0.08;

export const LAYER_OF: Record<string, Layer> = {
  skeleton: 'skeleton',
  muscles: 'muscles',
  heart: 'organs',
  respiratory: 'organs',
  viscera: 'organs',
  nervous: 'nervous',
  sensory: 'nervous',
  arteries: 'vessels',
  veins: 'vessels',
};

export const SYSTEM_LABEL: Record<string, string> = {
  skeleton: 'Skeleton',
  muscles: 'Muscles',
  heart: 'Heart',
  respiratory: 'Respiratory',
  viscera: 'Organs & glands',
  nervous: 'Nervous system',
  sensory: 'Sensory organs',
  arteries: 'Arteries',
  veins: 'Veins',
};

// Human Atlas's muted specimen palette.
export const SYSTEM_COLOR: Record<string, string> = {
  skeleton: '#E6DDC8',
  muscles: '#C47D6F',
  heart: '#B04B48',
  sensory: '#D5DCDC',
  arteries: '#C9574B',
  veins: '#5D79A6',
  nervous: '#E3CD93',
  respiratory: '#DDB2B1',
  viscera: '#CDB28F',
};

export interface Part {
  piece: AtlasPiece;
  system: string;
  layer: Layer;
  /** Exhibit this structure opens, if any. */
  exhibit: number | null;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  /** Assembled position in world space; animations offset from here. */
  home: THREE.Vector3;
  opacity: number;
  glow: number;
  glowColor: THREE.Color;
}

/** Which exhibit a structure belongs to. */
export function exhibitFor(p: AtlasPiece): number | null {
  if (p.system === 'heart') return 0;
  if (p.system === 'respiratory') return 1;
  if (/^(left|right) (femur|hip bone)$/.test(p.name)) return 3;
  if (/^pancrea|^stomach/.test(p.name)) return 4;
  if (p.system === 'nervous') return 5;
  return null;
}

function toFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Meshes for one system, each centred on its own origin so it can scale in place. */
export function buildSystem(scene: THREE.Object3D, system: string, manifest: AtlasManifest): Part[] {
  const byId = new Map(manifest.pieces.map((p) => [p.id, p]));
  const parts: Part[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const src = o as THREE.Mesh;
    if (!src.isMesh) return;
    const piece = byId.get(src.name) ?? byId.get(src.parent?.name ?? '');
    if (!piece) return;
    const [x, y, z] = piece.assembledPosition;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', toFloat(src.geometry.attributes.position));
    geo.setAttribute('normal', toFloat(src.geometry.attributes.normal));
    geo.setIndex(src.geometry.index);
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-x, -y, -z).multiply(src.matrixWorld));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      color: SYSTEM_COLOR[system],
      roughness: system === 'skeleton' ? 0.62 : 0.48,
      metalness: 0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const home = new THREE.Vector3(x, y + DAIS_TOP, z);
    mesh.position.copy(home);
    mesh.userData = { id: piece.id, name: piece.name, system };
    parts.push({
      piece,
      system,
      layer: LAYER_OF[system],
      exhibit: exhibitFor(piece),
      mesh,
      mat,
      home,
      opacity: 0,
      glow: 0,
      glowColor: new THREE.Color('#ffffff'),
    });
  });
  return parts;
}

/** Live registry shared by the scene, the effects and the camera. */
if (import.meta.env.DEV) queueMicrotask(() => Object.assign(window, { __body: body }));

export const body = {
  parts: [] as Part[],
  add(parts: Part[]) {
    this.parts.push(...parts);
  },
};

/** World-space centre of the pieces matching a test, from the manifest. */
export function centreOf(manifest: AtlasManifest, test: (p: AtlasPiece) => boolean) {
  const box = new THREE.Box3();
  for (const p of manifest.pieces) {
    if (!test(p)) continue;
    const c = new THREE.Vector3(...p.assembledPosition);
    const h = new THREE.Vector3(...p.size).multiplyScalar(0.5);
    box.expandByPoint(c.clone().sub(h)).expandByPoint(c.clone().add(h));
  }
  const c = box.isEmpty() ? new THREE.Vector3(0, 1, 0) : box.getCenter(new THREE.Vector3());
  return c.add(new THREE.Vector3(0, DAIS_TOP, 0));
}

export interface Focus {
  target: THREE.Vector3;
  dist: number;
  dir: THREE.Vector3;
  /** Where the hotspot sits. */
  anchor: THREE.Vector3;
}

/** Camera framing and hotspot for each exhibit, in exhibit order. */
export function focusPoints(m: AtlasManifest): Focus[] {
  const heart = centreOf(m, (p) => p.system === 'heart');
  const lungs = centreOf(m, (p) => /lobe of/.test(p.name));
  const brain = centreOf(m, (p) => p.system === 'nervous' && p.region === 'Brain');
  const pancreas = centreOf(m, (p) => /^pancreas/.test(p.name));
  const hip = centreOf(m, (p) => p.name === 'left hip bone');
  const knee = centreOf(m, (p) => p.name === 'left tibia');
  const f = (target: THREE.Vector3, dist: number, dir: [number, number, number], anchor = target) => ({
    target,
    dist,
    dir: new THREE.Vector3(...dir).normalize(),
    anchor,
  });
  return [
    f(heart, 0.72, [0.45, 0.12, 1], heart.clone().add(new THREE.Vector3(0.02, 0, 0.08))),
    f(lungs, 0.95, [0.35, 0.1, 1], lungs.clone().add(new THREE.Vector3(-0.09, 0.06, 0.1))),
    f(new THREE.Vector3(0.03, 0.88, 0), 2.6, [0.75, 0.08, 1], knee.clone().add(new THREE.Vector3(0.02, 0.05, 0.06))),
    f(hip.clone().add(new THREE.Vector3(0.02, -0.08, 0)), 1.35, [0.9, 0.1, 1], hip.clone().add(new THREE.Vector3(0.03, -0.06, 0.1))),
    f(pancreas, 0.65, [0.3, 0.15, 1], pancreas.clone().add(new THREE.Vector3(0, 0, 0.12))),
    f(brain, 0.62, [0.7, 0.18, 1], brain.clone().add(new THREE.Vector3(0, 0.05, 0.1))),
  ];
}
