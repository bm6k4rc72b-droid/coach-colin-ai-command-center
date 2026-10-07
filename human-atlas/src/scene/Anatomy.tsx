import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { useAtlas } from '../state/store';
import type { Manifest, ManifestEntry, SystemId } from '../types';
import { applyState, focusPiece, materialFor, registerPiece, tick, unregisterSystem } from './engine';
import { tooltip } from '../ui/tooltipBus';

// BVH-accelerated raycasting for every mesh.
Object.assign(THREE.BufferGeometry.prototype, { computeBoundsTree, disposeBoundsTree });
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const ASSET_BASE = `${import.meta.env.BASE_URL}anatomy/`;

/** Copy a (possibly quantized / interleaved) attribute into a plain Float32 one. */
function toFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Turn a system GLB into standalone pieces. Each glTF node is named by its
 * BodyParts3D ID; its (dequantization) transform is baked so the geometry is
 * centred on the piece, and the piece's position comes from the manifest.
 */
function buildSystem(scene: THREE.Group, system: SystemId, manifest: Manifest) {
  const group = new THREE.Group();
  const built: Array<[ManifestEntry, THREE.Mesh, THREE.MeshStandardMaterial]> = [];
  group.name = system;
  const byId = new Map(manifest.pieces.map((p) => [p.id, p]));
  scene.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) sources.push(o as THREE.Mesh);
  });
  for (const src of sources) {
    const id = byId.has(src.name) ? src.name : src.parent?.name ?? '';
    const entry = byId.get(id);
    if (!entry) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', toFloat(src.geometry.attributes.position));
    geo.setAttribute('normal', toFloat(src.geometry.attributes.normal));
    geo.setIndex(src.geometry.index);
    const bake = new THREE.Matrix4()
      .makeTranslation(-entry.assembledPosition[0], -entry.assembledPosition[1], -entry.assembledPosition[2])
      .multiply(src.matrixWorld);
    geo.applyMatrix4(bake);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.computeBoundsTree();
    const material = materialFor(system);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = entry.id;
    built.push([entry, mesh, material]);
    group.add(mesh);
  }
  return { group, built };
}

function SystemModel({ system, manifest }: { system: SystemId; manifest: Manifest }) {
  const gltf = useGLTF(`${ASSET_BASE}${system}.glb`, false, true);
  const { group, built } = useMemo(() => buildSystem(gltf.scene, system, manifest), [gltf, system, manifest]);
  // Register in an effect (not during render) so StrictMode's double mount is harmless.
  // Geometry stays cached with the GLTF for the lifetime of the page.
  useEffect(() => {
    for (const [entry, mesh, material] of built) registerPiece(entry, mesh, material);
    useAtlas.getState().markLoaded(system);
    return () => unregisterSystem(system);
  }, [built, system]);
  return <primitive object={group} />;
}

// Load order: what is visible first and cheapest first, muscles (largest) last.
const LOAD_ORDER: SystemId[] = ['skeleton', 'heart', 'arteries', 'veins', 'nervous', 'respiratory', 'sensory', 'muscles'];

export function Anatomy() {
  const manifest = useAtlas((s) => s.manifest);
  const down = useRef<{ x: number; y: number } | null>(null);

  // Store → engine targets. Subscribing (rather than selecting) keeps React out of it.
  useEffect(() => {
    applyState(useAtlas.getState());
    return useAtlas.subscribe((st, prev) => applyState(st, prev));
  }, []);

  useFrame((_, dt) => tick(Math.min(dt, 0.2)));

  if (!manifest) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const id = e.object.userData.id as string | undefined;
    useAtlas.getState().hover(id ?? null);
    if (e.pointerType !== 'touch') tooltip.move(e.nativeEvent.clientX, e.nativeEvent.clientY);
    document.body.style.cursor = id ? 'pointer' : '';
  };
  const onOut = () => {
    useAtlas.getState().hover(null);
    document.body.style.cursor = '';
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    down.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const d = down.current;
    if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) > 5) return;
    e.stopPropagation();
    const id = e.object.userData.id as string | undefined;
    if (!id) return;
    useAtlas.getState().select(id);
    focusPiece(id);
  };

  return (
    <group onPointerMove={onMove} onPointerOut={onOut} onPointerDown={onDown} onClick={onClick}>
      {LOAD_ORDER.map((s) => (
        <Suspense key={s} fallback={null}>
          <SystemModel system={s} manifest={manifest} />
        </Suspense>
      ))}
    </group>
  );
}
