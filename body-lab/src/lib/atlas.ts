// Loads real BodyParts3D meshes (via Human Atlas) for an exhibit, centred and
// scaled to a target height, as one group.
import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { AtlasManifest, AtlasPiece } from '../types';

export const ATLAS = `${import.meta.env.BASE_URL}atlas/`;

let manifestPromise: Promise<AtlasManifest> | null = null;
let manifest: AtlasManifest | null = null;
export function loadManifest() {
  manifestPromise ??= fetch(`${ATLAS}manifest.json`)
    .then((r) => r.json() as Promise<AtlasManifest>)
    .then((m) => (manifest = m));
  return manifestPromise;
}

/** Suspends until the manifest is loaded. */
function useManifest(): AtlasManifest {
  if (manifest) return manifest;
  throw loadManifest();
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

export function useAtlasGroup(
  system: string,
  keep: (p: AtlasPiece) => boolean,
  height: number,
  material: (p: AtlasPiece) => THREE.Material,
) {
  const m = useManifest();
  const gltf = useGLTF(`${ATLAS}${system}.glb`, false, true);
  return useMemo(() => {
    const byId = new Map(m.pieces.map((p) => [p.id, p]));
    const group = new THREE.Group();
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const piece = byId.get(src.name) ?? byId.get(src.parent?.name ?? '');
      if (!piece || !keep(piece)) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', toFloat(src.geometry.attributes.position));
      geo.setAttribute('normal', toFloat(src.geometry.attributes.normal));
      geo.setIndex(src.geometry.index);
      geo.applyMatrix4(src.matrixWorld);
      const mesh = new THREE.Mesh(geo, material(piece));
      mesh.userData.piece = piece;
      group.add(mesh);
    });
    // Centre on the bounding box and scale to the requested height.
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    group.children.forEach((c) => c.position.sub(center));
    const s = height / size.y;
    const wrap = new THREE.Group();
    wrap.add(group);
    wrap.scale.setScalar(s);
    return { object: wrap, size: size.multiplyScalar(s) };
    // keep/material are stable per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, gltf, height]);
}
