import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GROUP_STYLE, REGION_BY_ID, regionForMesh } from '../data/regions';
import type { RegionId } from '../data/regions';
import { DURATION, SCENARIOS } from '../data/scenarios';
import type { PathwayId } from '../data/scenarios';
import { TRAINER_STEPS } from '../data/trainer';
import { activityAt, emptyActivity } from '../sim/activity';
import type { Activity } from '../sim/activity';
import { clock } from '../sim/clock';
import { useBrain } from '../state/store';
import type { AtlasManifest, AtlasPiece } from '../types';
import { tooltip } from '../ui/tooltipBus';

export const ATLAS = `${import.meta.env.BASE_URL}atlas/`;
/** Centre of the brain in atlas coordinates; the scene is re-centred on it. */
export const BRAIN_CENTER = new THREE.Vector3(0, 1.57, -0.012);

const DEEP = new Set<RegionId>(['thalamus', 'colliculus', 'amygdala', 'hypothalamus', 'brainstem', 'hippocampus', 'striatum']);
const HIDDEN = new Set(['white matter structure of cerebral hemisphere', 'central canal of spinal cord']);

const NEUTRAL_DEEP = new THREE.Color('#D9CDBE');
const NEUTRAL_SHELL = new THREE.Color('#E8E0D6');
const SKULL = new THREE.Color('#EEE7DB');
const GROUP_COLOR = Object.fromEntries(
  Object.entries(GROUP_STYLE).map(([k, v]) => [k, new THREE.Color(v.color)]),
) as Record<keyof typeof GROUP_STYLE, THREE.Color>;
const BLACK = new THREE.Color(0, 0, 0);

interface Part {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  region: RegionId | null;
  base: THREE.Vector3;
  peelDir: THREE.Vector3;
  baseOpacity: number;
  shell: boolean;
  level: number;
}

const strip = (n: string) => n.replace(/\b(left|right) /, '');

function toFloat(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Bake each glTF node into a geometry centred on its manifest position. */
function extract(scene: THREE.Group, pieces: Map<string, AtlasPiece>, keep: (p: AtlasPiece) => boolean) {
  scene.updateMatrixWorld(true);
  const out: Array<{ piece: AtlasPiece; geo: THREE.BufferGeometry }> = [];
  scene.traverse((o) => {
    const src = o as THREE.Mesh;
    if (!src.isMesh) return;
    const piece = pieces.get(src.name) ?? pieces.get(src.parent?.name ?? '');
    if (!piece || !keep(piece)) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', toFloat(src.geometry.attributes.position));
    geo.setAttribute('normal', toFloat(src.geometry.attributes.normal));
    geo.setIndex(src.geometry.index);
    const [x, y, z] = piece.assembledPosition;
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(-x, -y, -z).multiply(src.matrixWorld));
    geo.computeBoundingSphere();
    out.push({ piece, geo });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Pathways between region centroids (left hemisphere, which faces the camera).

const PATHS: Record<PathwayId, RegionId[]> = {
  lowRoad: ['thalamus', 'amygdala'],
  highRoad: ['thalamus', 'visual', 'lpfc'],
  regulation: ['ofc', 'amygdala'],
  alarm: ['amygdala', 'hypothalamus', 'brainstem'],
  salience: ['insula', 'cingulate'],
  habit: ['lpfc', 'striatum'],
  context: ['hippocampus', 'lpfc'],
  action: ['lpfc', 'motor'],
};

const PATH_GROUP: Record<PathwayId, keyof typeof GROUP_STYLE> = {
  lowRoad: 'fast',
  highRoad: 'slow',
  regulation: 'slow',
  alarm: 'body',
  salience: 'fast',
  habit: 'habit',
  context: 'slow',
  action: 'slow',
};

function regionCentroids(pieces: AtlasPiece[]) {
  const acc = new Map<RegionId, { sum: THREE.Vector3; n: number }>();
  for (const p of pieces) {
    if (p.side === 'right') continue;
    const r = regionForMesh(strip(p.name));
    if (!r) continue;
    const a = acc.get(r) ?? { sum: new THREE.Vector3(), n: 0 };
    a.sum.add(new THREE.Vector3(...p.assembledPosition).sub(BRAIN_CENTER));
    a.n++;
    acc.set(r, a);
  }
  const out = new Map<RegionId, THREE.Vector3>();
  for (const [r, a] of acc) out.set(r, a.sum.divideScalar(a.n));
  return out;
}

function Pathways({ centroids }: { centroids: Map<RegionId, THREE.Vector3> }) {
  const built = useMemo(() => {
    return (Object.keys(PATHS) as PathwayId[]).map((id) => {
      const pts = PATHS[id].map((r) => centroids.get(r)!.clone());
      // Bow each segment slightly outward so routes read as arcs, not chords.
      const withMid: THREE.Vector3[] = [];
      pts.forEach((pt, i) => {
        withMid.push(pt);
        if (i < pts.length - 1) {
          const mid = pt.clone().add(pts[i + 1]).multiplyScalar(0.5);
          mid.add(mid.clone().setY(0).normalize().multiplyScalar(0.006)).add(new THREE.Vector3(0, 0.006, 0));
          withMid.push(mid);
        }
      });
      const curve = new THREE.CatmullRomCurve3(withMid);
      const color = new THREE.Color(GROUP_STYLE[PATH_GROUP[id]].color);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.00065, 6, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }),
      );
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.0024, 16, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }),
      );
      tube.renderOrder = spark.renderOrder = 10;
      tube.raycast = spark.raycast = () => undefined;
      return { id, curve, tube, spark };
    });
  }, [centroids]);

  useFrame((state) => {
    const st = useBrain.getState();
    const sc = SCENARIOS.find((s) => s.id === st.scenarioId)!;
    const now = state.clock.elapsedTime * 1000;
    for (const b of built) {
      const tubeMat = b.tube.material as THREE.MeshBasicMaterial;
      const sparkMat = b.spark.material as THREE.MeshBasicMaterial;
      let progress = -1;
      if (st.mode === 'simulate') {
        for (const ev of sc.paths) {
          if (ev.path !== b.id) continue;
          const k = (clock.t - ev.at) / ev.dur;
          if (k >= 0 && k <= 1) progress = k;
        }
      } else if (st.mode === 'trainer' && b.id === 'regulation' && st.trainerStep >= 2) {
        progress = ((now / 1400) % 1 + 1) % 1;
      }
      const target = progress >= 0 ? 0.55 : st.mode === 'simulate' && sc.paths.some((e) => e.path === b.id) ? 0.1 : 0;
      tubeMat.opacity += (target - tubeMat.opacity) * 0.15;
      if (progress >= 0) {
        b.spark.position.copy(b.curve.getPointAt(progress));
        sparkMat.opacity = Math.sin(Math.PI * progress) * 0.95 + 0.05;
      } else sparkMat.opacity *= 0.8;
      b.tube.visible = tubeMat.opacity > 0.01;
      b.spark.visible = sparkMat.opacity > 0.01;
    }
  });

  return (
    <group>
      {built.map((b) => (
        <group key={b.id}>
          <primitive object={b.tube} />
          <primitive object={b.spark} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export function Brain({ manifest }: { manifest: AtlasManifest }) {
  const nervous = useGLTF(`${ATLAS}nervous.glb`, false, true);
  const skeleton = useGLTF(`${ATLAS}skeleton.glb`, false, true);

  const { group, parts, skull, centroids } = useMemo(() => {
    const byId = new Map(manifest.pieces.map((p) => [p.id, p]));
    const group = new THREE.Group();
    const parts: Part[] = [];
    const brainPieces = extract(nervous.scene, byId, (p) => p.region === 'Brain' && !HIDDEN.has(p.name));
    for (const { piece, geo } of brainPieces) {
      const region = regionForMesh(strip(piece.name));
      const deep = region ? DEEP.has(region) : false;
      const shell = !deep;
      const baseOpacity = deep ? 0.96 : /ventricle|aqueduct|foramen|plexus/.test(piece.name) ? 0.1 : 0.17;
      const mat = new THREE.MeshStandardMaterial({
        color: deep ? NEUTRAL_DEEP : NEUTRAL_SHELL,
        roughness: 0.55,
        metalness: 0,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: deep,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const base = new THREE.Vector3(...piece.assembledPosition).sub(BRAIN_CENTER);
      mesh.position.copy(base);
      mesh.userData = { region, name: piece.name };
      if (shell) mesh.renderOrder = 2;
      const peelDir = base.clone().setY(base.y * 0.6);
      if (peelDir.lengthSq() < 1e-6) peelDir.set(0, 1, 0);
      peelDir.normalize();
      parts.push({ mesh, mat, region, base, peelDir, baseOpacity, shell, level: 0 });
      group.add(mesh);
    }

    // A faint skull for scale and orientation.
    const skull = new THREE.Group();
    const skullMat = new THREE.MeshStandardMaterial({ color: SKULL, roughness: 0.7, transparent: true, opacity: 0.07, depthWrite: false });
    for (const { piece, geo } of extract(skeleton.scene, byId, (p) => p.region === 'Head' && p.category === 'Bone')) {
      const mesh = new THREE.Mesh(geo, skullMat);
      mesh.position.copy(new THREE.Vector3(...piece.assembledPosition).sub(BRAIN_CENTER));
      mesh.raycast = () => undefined;
      mesh.renderOrder = 3;
      skull.add(mesh);
    }
    return { group, parts, skull, centroids: regionCentroids(manifest.pieces.filter((p) => p.region === 'Brain')) };
  }, [manifest, nervous, skeleton]);

  useEffect(() => {
    useBrain.getState().setReady();
  }, []);

  const act = useRef<Activity>(emptyActivity());
  const target = useRef<Activity>(emptyActivity());
  const peel = useRef(0);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.advance(dt);
    const st = useBrain.getState();
    const sc = SCENARIOS.find((s) => s.id === st.scenarioId)!;

    // Target activity for the current mode.
    if (st.mode === 'trainer') {
      const step = TRAINER_STEPS[st.trainerStep];
      const t = target.current;
      for (const k of Object.keys(t) as RegionId[]) t[k] = step.activity[k] ?? 0;
      if (step.choices && st.trainerChoice !== null && !step.choices[st.trainerChoice].good) {
        // Suppression: the alarm stays up.
        t.amygdala = 0.75;
        t.insula = 0.7;
        t.hypothalamus = 0.6;
        t.ofc = 0.35;
      }
    } else if (st.mode === 'simulate') {
      activityAt(sc, clock.t, st.mods, target.current);
    } else {
      for (const k of Object.keys(target.current) as RegionId[]) target.current[k] = 0;
    }
    const lambda = st.mode === 'simulate' ? 30 : 3;
    for (const k of Object.keys(act.current) as RegionId[]) {
      act.current[k] += (target.current[k] - act.current[k]) * (1 - Math.exp(-lambda * dt));
    }

    // Phase index for the info card (store only changes when it changes).
    if (st.mode === 'simulate') {
      let idx = 0;
      sc.phases.forEach((ph, i) => {
        if (clock.t >= ph.at) idx = i;
      });
      st.setPhaseIndex(idx);
    }

    peel.current += ((st.peel ? 1 : 0) - peel.current) * (1 - Math.exp(-5 * dt));

    for (const p of parts) {
      const highlighted = st.selectedRegion !== null && p.region === st.selectedRegion;
      const hovered = st.hovered?.name === p.mesh.userData.name;
      const level = Math.max(p.region ? act.current[p.region] : 0, highlighted ? 0.55 : 0);
      p.level = level;
      const groupColor = p.region ? GROUP_COLOR[REGION_BY_ID[p.region].group] : BLACK;
      tmpColor.copy(p.shell ? NEUTRAL_SHELL : NEUTRAL_DEEP);
      if (p.region) tmpColor.lerp(groupColor, Math.min(1, level * 1.1));
      p.mat.color.copy(tmpColor);
      p.mat.emissive.copy(groupColor).multiplyScalar(level * 0.5);
      if (hovered) p.mat.emissive.addScalar(0.08);
      const opacity = p.shell ? p.baseOpacity + (0.88 - p.baseOpacity) * Math.min(1, level * 1.3) : p.baseOpacity;
      p.mat.opacity = opacity;
      p.mat.depthWrite = opacity > 0.6;
      p.mesh.position.copy(p.base).addScaledVector(p.peelDir, peel.current * (p.shell ? 0.05 : 0));
    }
    skull.visible = st.skull;
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const ud = e.object.userData as { region: RegionId | null; name: string };
    useBrain.getState().hover({ region: ud.region, name: ud.name });
    if (e.pointerType !== 'touch') tooltip.move(e.nativeEvent.clientX, e.nativeEvent.clientY);
    document.body.style.cursor = ud.region ? 'pointer' : '';
  };
  const onOut = () => {
    useBrain.getState().hover(null);
    document.body.style.cursor = '';
  };
  const down = useRef<[number, number] | null>(null);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const d = down.current;
    if (d && Math.hypot(e.nativeEvent.clientX - d[0], e.nativeEvent.clientY - d[1]) > 5) return;
    e.stopPropagation();
    const region = (e.object.userData as { region: RegionId | null }).region;
    if (region) useBrain.getState().selectRegion(region);
  };

  return (
    <group>
      <group
        onPointerMove={onMove}
        onPointerOut={onOut}
        onPointerDown={(e) => (down.current = [e.nativeEvent.clientX, e.nativeEvent.clientY])}
        onClick={onClick}
      >
        <primitive object={group} />
      </group>
      <primitive object={skull} />
      <Pathways centroids={centroids} />
    </group>
  );
}

export { DURATION };
