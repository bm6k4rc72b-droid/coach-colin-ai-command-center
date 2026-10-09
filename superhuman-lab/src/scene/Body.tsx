import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import type { System } from '../data/genes';
import { GENES } from '../data/genes';
import { useLab, VIEW_SYSTEMS } from '../state/store';
import type { AtlasManifest, AtlasPiece } from '../types';
import { tooltip } from '../ui/tooltipBus';
import { baseColor, targetFor } from './effects';
import type { PieceTarget } from './effects';

Object.assign(THREE.BufferGeometry.prototype, { computeBoundsTree });
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const ATLAS = `${import.meta.env.BASE_URL}atlas/`;
const SYSTEMS: System[] = ['skeleton', 'muscles', 'heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory'];

interface Part {
  piece: AtlasPiece;
  system: System;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  base: THREE.Vector3;
  /** Horizontal direction away from the body's long axis, for growth. */
  outward: THREE.Vector3;
  target: PieceTarget;
  scale: number;
  opacity: number;
  glow: number;
  dim: number;
  color: THREE.Color;
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

const GREY = new THREE.Color('#9AA0A6');
const noRaycast = () => undefined;

function useSystemScenes() {
  // Loaded together so the body appears complete; useGLTF caches them.
  return useGLTF(SYSTEMS.map((s) => `${ATLAS}${s}.glb`), false, true);
}

export function Body({ manifest }: { manifest: AtlasManifest }) {
  const gltfs = useSystemScenes();

  const { group, parts } = useMemo(() => {
    const byId = new Map(manifest.pieces.map((p) => [p.id, p]));
    const group = new THREE.Group();
    const parts: Part[] = [];
    gltfs.forEach((gltf, i) => {
      const system = SYSTEMS[i];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const src = o as THREE.Mesh;
        if (!src.isMesh) return;
        const piece = byId.get(src.name) ?? byId.get(src.parent?.name ?? '');
        if (!piece) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', toFloat(src.geometry.attributes.position));
        geo.setAttribute('normal', toFloat(src.geometry.attributes.normal));
        geo.setIndex(src.geometry.index);
        const [x, y, z] = piece.assembledPosition;
        geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-x, -y, -z).multiply(src.matrixWorld));
        geo.computeBoundingSphere();
        geo.computeBoundsTree();
        const color = baseColor(system, false);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: system === 'skeleton' ? 0.62 : 0.5, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(geo, mat);
        const base = new THREE.Vector3(x, y, z);
        mesh.position.copy(base);
        mesh.userData = { name: piece.name, system };
        const outward = new THREE.Vector3(x, 0, z);
        parts.push({
          piece,
          system,
          mesh,
          mat,
          base,
          outward,
          target: { visible: true, scale: 1, glow: 0, glowColor: new THREE.Color(), dim: 0 },
          scale: 1,
          opacity: 0,
          glow: 0,
          dim: 0,
          color: color.clone(),
        });
        group.add(mesh);
      });
    });
    return { group, parts };
  }, [manifest, gltfs]);

  // Retarget on state change (not per frame).
  useEffect(() => {
    const apply = () => {
      const st = useLab.getState();
      const visible = VIEW_SYSTEMS[st.view];
      for (const p of parts) {
        p.target = targetFor(p.system, p.piece.region, st.active, st.fiction, visible);
        p.color.copy(baseColor(p.system, st.alien));
      }
    };
    apply();
    useLab.getState().setReady();
    return useLab.subscribe(apply);
  }, [parts]);

  const tmp = useMemo(() => new THREE.Color(), []);
  const pulse = useRef(0);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const k = 1 - Math.exp(-6 * dt);
    pulse.current = 0.82 + 0.18 * Math.sin(state.clock.elapsedTime * 2.4);
    const hoveredName = useLab.getState().hovered?.name;
    for (const p of parts) {
      const t = p.target;
      p.scale += (t.scale - p.scale) * k;
      p.opacity += ((t.visible ? 1 : 0) - p.opacity) * k * 1.4;
      p.glow += (t.glow - p.glow) * k;
      p.dim += (t.dim - p.dim) * k;

      p.mesh.scale.setScalar(p.scale);
      p.mesh.position.copy(p.base).addScaledVector(p.outward, (p.scale - 1) * 0.85);
      const visible = p.opacity > 0.01;
      if (p.mesh.visible !== visible) {
        p.mesh.visible = visible;
        // Hidden pieces must not block the pointer.
        p.mesh.raycast = visible ? acceleratedRaycast : noRaycast;
      }
      p.mat.opacity = p.opacity;
      p.mat.transparent = p.opacity < 0.995;
      p.mat.depthWrite = p.opacity > 0.5;

      tmp.copy(p.color).lerp(GREY, p.dim * 0.7);
      p.mat.color.copy(tmp);
      p.mat.emissive.copy(t.glowColor).multiplyScalar(p.glow * 0.55 * pulse.current);
      if (p.piece.name === hoveredName) p.mat.emissive.addScalar(0.1);
    }
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ud = e.object.userData as { name: string; system: string };
    useLab.getState().hover({ name: ud.name, system: ud.system });
    if (e.pointerType !== 'touch') tooltip.move(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };
  const down = useRef<[number, number] | null>(null);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const d = down.current;
    if (d && Math.hypot(e.nativeEvent.clientX - d[0], e.nativeEvent.clientY - d[1]) > 5) return;
    e.stopPropagation();
    // Clicking a changed structure opens the gene responsible.
    const ud = e.object.userData as { system: System };
    const part = parts.find((p) => p.mesh === e.object);
    const st = useLab.getState();
    const gene = GENES.find(
      (g) => st.active.includes(g.id) && g.visual.systems.includes(ud.system) && (!g.visual.regions || (part && g.visual.regions.includes(part.piece.region))),
    );
    if (gene) st.selectGene(gene.id);
  };

  return (
    <group
      onPointerMove={onMove}
      onPointerOut={() => useLab.getState().hover(null)}
      onPointerDown={(e) => (down.current = [e.nativeEvent.clientX, e.nativeEvent.clientY])}
      onClick={onClick}
    >
      <primitive object={group} />
    </group>
  );
}
