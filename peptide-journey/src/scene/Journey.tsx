import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PEPTIDE_BY_ID } from '../data/peptides';
import type { Peptide, Stop, System } from '../data/peptides';
import { clock } from '../sim/clock';
import { level, model, uToT } from '../sim/pk';
import { useJourney } from '../state/store';
import type { AtlasManifest, AtlasPiece } from '../types';
import { tooltip } from '../ui/tooltipBus';
import { rig } from './rig';

export const ATLAS = `${import.meta.env.BASE_URL}atlas/`;
const SYSTEMS: System[] = ['skeleton', 'muscles', 'heart', 'sensory', 'arteries', 'veins', 'nervous', 'respiratory', 'viscera'];

const BASE_COLOR: Record<System, string> = {
  skeleton: '#E6DDC8',
  muscles: '#C47D6F',
  heart: '#C98C86',
  sensory: '#D5DCDC',
  arteries: '#D9A9A2',
  veins: '#A9B6CC',
  nervous: '#E8DCC2',
  respiratory: '#E4CFCD',
  viscera: '#D7CBB4',
};

/** Resting opacity: organs readable, everything else a faint context. */
const BASE_OPACITY: Record<System, number> = {
  skeleton: 0.1,
  muscles: 0,
  heart: 0.55,
  sensory: 0.15,
  arteries: 0.3,
  veins: 0.25,
  nervous: 0.22,
  respiratory: 0.08,
  viscera: 0.5,
};

const CLEAR_COLOR = new THREE.Color('#5E7F8C');
const HEART_HUB = new THREE.Vector3(0.022, 1.244, 0.021);

/** Representative centres for whole-system targets. */
const SYSTEM_CENTER: Partial<Record<System, THREE.Vector3>> = {
  muscles: new THREE.Vector3(0.1, 0.66, 0.02),
  skeleton: new THREE.Vector3(-0.07, 0.88, -0.02),
  arteries: new THREE.Vector3(0.015, 1.14, -0.01),
  veins: new THREE.Vector3(-0.02, 1.0, -0.02),
};

const strip = (n: string) => n.replace(/\b(left|right) /, '');

interface Part {
  piece: AtlasPiece;
  base: string;
  system: System;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  glow: number;
  opacity: number;
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

function stopMatches(stop: Stop | { meshes?: string[]; systems?: System[] }, part: Part) {
  return (stop.meshes?.includes(part.base) ?? false) || (stop.systems?.includes(part.system) ?? false);
}

/** World-space box around a stop, for camera focus and particle routes. */
export function stopBox(stop: { meshes?: string[]; systems?: System[] }, parts: Part[]): THREE.Box3 {
  const box = new THREE.Box3();
  if (stop.meshes?.length) {
    for (const p of parts) {
      if (!stop.meshes.includes(p.base)) continue;
      const c = new THREE.Vector3(...p.piece.assembledPosition);
      const h = new THREE.Vector3(...p.piece.size).multiplyScalar(0.5);
      box.expandByPoint(c.clone().sub(h)).expandByPoint(c.clone().add(h));
    }
  }
  if (box.isEmpty() && stop.systems?.length) {
    const c = SYSTEM_CENTER[stop.systems[0]] ?? new THREE.Vector3(0, 1, 0);
    box.setFromCenterAndSize(c, new THREE.Vector3(0.3, 0.45, 0.2));
  }
  return box;
}

// Shared so the UI can ask the scene to frame a stop.
let partsRef: Part[] = [];
export function focusStop(stop: { meshes?: string[]; systems?: System[] }) {
  const box = stopBox(stop, partsRef);
  if (box.isEmpty() || !rig.camera || !rig.controls) return;
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.06);
  const dir = rig.camera.position.clone().sub(rig.controls.target).normalize();
  rig.flyTo(center.clone().addScaledVector(dir, Math.max(0.45, r * 4.2)), center, 900);
}

// ---------------------------------------------------------------------------
// Particle routes: source → heart → each target, through the bloodstream.

interface Route {
  curve: THREE.CatmullRomCurve3;
  sparks: THREE.Mesh[];
  weight: number;
}

function buildRoutes(p: Peptide, parts: Part[]): Route[] {
  const from = p.source.point ? new THREE.Vector3(...p.source.point) : stopBox(p.source, parts).getCenter(new THREE.Vector3());
  const color = new THREE.Color(p.color);
  return p.targets.map((t) => {
    const to = stopBox(t, parts).getCenter(new THREE.Vector3());
    const pts = [from, from.clone().lerp(HEART_HUB, 0.5).add(new THREE.Vector3(0, 0, 0.04)), HEART_HUB.clone(), HEART_HUB.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0, 0.04)), to];
    const curve = new THREE.CatmullRomCurve3(pts);
    const sparks = Array.from({ length: 5 }, () => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 12, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, depthTest: false }),
      );
      m.renderOrder = 20;
      m.raycast = () => undefined;
      return m;
    });
    return { curve, sparks, weight: t.weight };
  });
}

// ---------------------------------------------------------------------------

export function Journey({ manifest }: { manifest: AtlasManifest }) {
  const gltfs = useGLTF(SYSTEMS.map((s) => `${ATLAS}${s}.glb`), false, true);
  const peptideId = useJourney((s) => s.peptideId);
  const peptide = PEPTIDE_BY_ID[peptideId];

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
        const mat = new THREE.MeshStandardMaterial({
          color: BASE_COLOR[system],
          roughness: 0.55,
          metalness: 0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.userData = { name: piece.name, system };
        if (system !== 'viscera' && system !== 'heart') mesh.renderOrder = 2;
        parts.push({ piece, base: strip(piece.name), system, mesh, mat, glow: 0, opacity: 0 });
        group.add(mesh);
      });
    });
    return { group, parts };
  }, [manifest, gltfs]);

  useEffect(() => {
    partsRef = parts;
    useJourney.getState().setReady();
  }, [parts]);

  const routes = useMemo(() => buildRoutes(peptide, parts), [peptide, parts]);

  // Injection depot marker.
  const depot = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.0035, 10, 40),
      new THREE.MeshBasicMaterial({ color: '#13242D', transparent: true, opacity: 0, depthTest: false }),
    );
    m.renderOrder = 21;
    m.raycast = () => undefined;
    return m;
  }, []);

  const pc = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.advance(dt);
    const st = useJourney.getState();
    const p = PEPTIDE_BY_ID[st.peptideId];
    const t = uToT(clock.u) * (clock.u > 0 ? 1 : 0);
    const lvl = level(p, t);
    const m = model(p);
    pc.set(p.color);
    const k = 1 - Math.exp(-10 * dt);

    // Source activity: a gland glows while it secretes; an injection depot empties.
    const sourceLevel =
      m.kind === 'secretion' ? (t > 0 && t <= m.peakT ? 1 : t > 0 ? Math.exp(-(t - m.peakT) / (m.peakT * 0.3)) : 0) : t > 0 ? Math.exp(-m.ka * t) : 0;

    for (const part of parts) {
      let glow = 0;
      let color = pc;
      for (const s of p.targets) if (stopMatches(s, part)) glow = Math.max(glow, lvl * s.weight);
      let clear = 0;
      for (const s of p.clearance) if (stopMatches(s, part)) clear = Math.max(clear, lvl * s.weight * 0.8);
      if (clear > glow) {
        glow = clear;
        color = CLEAR_COLOR;
      }
      if (!p.source.point && p.source.meshes?.includes(part.base)) {
        if (sourceLevel > glow) {
          glow = sourceLevel;
          color = pc;
        }
      }
      if ((part.system === 'arteries' || part.system === 'veins') && glow < lvl * 0.35) glow = lvl * 0.35;

      part.glow += (glow - part.glow) * k;
      let target = BASE_OPACITY[part.system];
      if (part.system === 'skeleton' && !st.skeleton) target = 0;
      // Whole-system targets (muscle, bone) fade in as they respond.
      // Capped so organs behind them stay visible.
      if (part.system === 'muscles') target = Math.max(target, part.glow * 0.3);
      else if (part.system === 'skeleton') target = Math.max(target, part.glow * 0.45);
      else target = Math.min(0.95, target + part.glow * 0.45);
      part.opacity += (target - part.opacity) * k;

      const mat = part.mat;
      tmp.set(BASE_COLOR[part.system]).lerp(color, Math.min(1, part.glow * 0.9));
      mat.color.copy(tmp);
      mat.emissive.copy(color).multiplyScalar(part.glow * 0.45);
      if (st.hovered?.name === part.piece.name) mat.emissive.addScalar(0.08);
      mat.opacity = part.opacity;
      mat.depthWrite = part.opacity > 0.6;
      const visible = part.opacity > 0.01;
      if (part.mesh.visible !== visible) {
        part.mesh.visible = visible;
        part.mesh.raycast = visible ? THREE.Mesh.prototype.raycast : () => undefined;
      }
    }

    // Particles flow while the peptide is in the blood (real-time motion, not sim time).
    const time = state.clock.elapsedTime;
    for (const r of routes) {
      r.sparks.forEach((s, i) => {
        const prog = (time * 0.22 + i / r.sparks.length) % 1;
        s.position.copy(r.curve.getPointAt(prog));
        const mat = s.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(1, lvl * r.weight * 1.2) * Math.sin(Math.PI * prog) ** 0.5;
        s.visible = mat.opacity > 0.02;
      });
    }

    // Injection depot ring.
    if (p.source.point) {
      depot.position.set(...p.source.point);
      depot.lookAt(rig.camera?.position ?? new THREE.Vector3(0, 1, 5));
      const dm = depot.material as THREE.MeshBasicMaterial;
      dm.opacity = 0.25 + 0.65 * sourceLevel;
      depot.scale.setScalar(0.8 + 0.6 * sourceLevel + 0.05 * Math.sin(time * 4));
      depot.visible = true;
    } else depot.visible = false;
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ud = e.object.userData as { name: string; system: string };
    useJourney.getState().hover({ name: ud.name, system: ud.system });
    if (e.pointerType !== 'touch') tooltip.move(e.nativeEvent.clientX, e.nativeEvent.clientY);
  };

  return (
    <group>
      <group onPointerMove={onMove} onPointerOut={() => useJourney.getState().hover(null)}>
        <primitive object={group} />
      </group>
      <primitive object={depot} />
      {routes.map((r, i) => (
        <group key={`${peptideId}-${i}`}>
          {r.sparks.map((s, j) => (
            <primitive key={j} object={s} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** For the tooltip: what a structure does for the current peptide. */
export function roleFor(p: Peptide, name: string, system: System) {
  const base = strip(name);
  const fake = { base, system } as Part;
  const target = p.targets.find((s) => stopMatches(s, fake));
  if (target) return `Target: ${target.effect}`;
  const clear = p.clearance.find((s) => stopMatches(s, fake));
  if (clear) return `Clears it: ${clear.effect}`;
  if (p.source.meshes?.includes(base)) return `Source: ${p.source.text}`;
  return null;
}
