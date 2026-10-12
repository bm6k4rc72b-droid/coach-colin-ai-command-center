// Exhibit 2: the airway tree. A branching model (each tube splits in two,
// Murray's law diameters) inside the real BodyParts3D lungs. Air particles
// visibly slow down as the tree widens.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../state/store';
import { useAtlasGroup } from '../lib/atlas';
import { MAX_GEN, airSpeedCmS, airwayDiameterMm, airways, totalAreaCm2 } from '../models/physiology';
import { PLINTH_TOP, glow } from '../scene/Room';
import { Chips, Group, Slider, Tile, fmt } from '../ui/kit';

const DRAWN = 9; // generations drawn; deeper ones are too small to see
const TOP = PLINTH_TOP + 1.02;
const L0 = 0.15;

interface Seg {
  gen: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  children: number[];
}

function buildTree() {
  const segs: Seg[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, side: THREE.Vector3, gen: number): number => {
    const len = L0 * 0.8 ** gen * (gen === 0 ? 1.3 : 1);
    const end = start.clone().addScaledVector(dir, len);
    const idx = segs.length;
    segs.push({ gen, start, end, radius: Math.max(0.0028, 0.021 * 2 ** (-gen / 3)), children: [] });
    if (gen < DRAWN) {
      const angle = gen === 0 ? 0.62 : 0.5 - gen * 0.012;
      for (const sign of [-1, 1]) {
        // Asymmetric like real lungs: one branch slightly steeper.
        const d = dir.clone().applyAxisAngle(side, sign * angle * (sign > 0 ? 1 : 0.86)).normalize();
        // Rotate the branching plane 90° every generation, so the tree fills space.
        const nextSide = new THREE.Vector3().crossVectors(d, side).normalize();
        segs[idx].children.push(grow(end, d, nextSide, gen + 1));
      }
    }
    return idx;
  };
  grow(new THREE.Vector3(0, TOP, 0), up.clone().negate(), new THREE.Vector3(0, 0, 1), 0);
  return segs;
}

const dummy = new THREE.Object3D();
const Y = new THREE.Vector3(0, 1, 0);
function placeSegment(s: Seg, widen = 1) {
  const dir = s.end.clone().sub(s.start);
  dummy.position.copy(s.start).add(s.end).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
  dummy.scale.set(s.radius * widen, dir.length(), s.radius * widen);
  dummy.updateMatrix();
  return dummy.matrix;
}

const lungMat = new THREE.MeshPhysicalMaterial({
  color: '#E6B9B6',
  transparent: true,
  opacity: 0.13,
  roughness: 0.3,
  depthWrite: false,
  side: THREE.DoubleSide,
});

function Lungs() {
  const { object } = useAtlasGroup('respiratory', (p) => /lobe/.test(p.name), 0.66, () => lungMat);
  return <primitive object={object} position={[0, TOP - 0.47, -0.02]} />;
}

const N_PARTICLES = 40;

function Tree() {
  const segs = useMemo(buildTree, []);
  const base = useRef<THREE.InstancedMesh>(null);
  const hi = useRef<THREE.InstancedMesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const gen = useLab((s) => s.air.gen);
  const shownGen = Math.min(gen, DRAWN);

  useEffect(() => {
    const mesh = base.current!;
    const tissue = new THREE.Color('#D9B3A8');
    const dim = new THREE.Color('#7d6863');
    segs.forEach((s, i) => {
      mesh.setMatrixAt(i, placeSegment(s));
      mesh.setColorAt(i, s.gen <= shownGen ? tissue : dim);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const h = hi.current!;
    let n = 0;
    segs.forEach((s) => {
      if (s.gen === shownGen) h.setMatrixAt(n++, placeSegment(s, 1.35));
    });
    h.count = n;
    h.instanceMatrix.needsUpdate = true;
  }, [segs, shownGen]);

  // Particles walk random root-to-tip paths; their speed follows the model's
  // mean air speed in each generation, so they crawl in the deep tree.
  const particles = useMemo(
    () => Array.from({ length: N_PARTICLES }, (_, i) => ({ seg: 0, f: i / N_PARTICLES, seed: i * 7.31 })),
    [],
  );
  useFrame((_, dt) => {
    const { flow } = useLab.getState().air;
    const v0 = airSpeedCmS(0, flow);
    const mesh = dots.current;
    if (!mesh) return;
    particles.forEach((p, i) => {
      const s = segs[p.seg];
      const v = 0.28 * Math.sqrt(airSpeedCmS(s.gen, flow) / v0) * Math.sqrt(flow / 0.5);
      p.f += (dt * v) / s.start.distanceTo(s.end);
      while (p.f >= 1) {
        p.f -= 1;
        const kids = segs[p.seg].children;
        if (!kids.length) {
          p.seg = 0;
          p.f = 0;
          break;
        }
        p.seed = (p.seed * 9301 + 49297) % 233280;
        p.seg = kids[p.seed / 233280 < 0.5 ? 0 : 1];
      }
      const cur = segs[p.seg];
      dummy.position.lerpVectors(cur.start, cur.end, p.f);
      dummy.quaternion.identity();
      dummy.scale.setScalar(Math.max(0.35, 1 - cur.gen * 0.07));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  const tipLabel = segs.find((s) => s.gen === DRAWN)!.end;
  return (
    <group>
      <instancedMesh ref={base} args={[undefined, undefined, segs.length]}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, true]} />
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={hi} args={[undefined, undefined, 2 ** DRAWN]}>
        <cylinderGeometry args={[1, 1, 1, 10, 1, true]} />
        <meshBasicMaterial color={glow('#59D8F0', 2.2)} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={dots} args={[undefined, undefined, N_PARTICLES]}>
        <sphereGeometry args={[0.009, 8, 6]} />
        <meshBasicMaterial color={glow('#FFE2B0', 3)} toneMapped={false} />
      </instancedMesh>
      {gen > DRAWN && (
        <Html position={tipLabel.toArray()} center className="scene-note" zIndexRange={[5, 0]}>
          generation {gen} is {gen - DRAWN} more splits below these tips
        </Html>
      )}
    </group>
  );
}

function Breathe({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const { flow } = useLab.getState().air;
    const rate = flow > 1 ? 30 : 12; // breaths per minute
    const s = 1 + 0.018 * Math.sin(((performance.now() / 1000) * rate * Math.PI * 2) / 60);
    if (ref.current) {
      ref.current.scale.set(s, 1, s);
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function AirwaysScene() {
  return (
    <group>
      <Breathe>
        <Lungs />
        <Tree />
      </Breathe>
      <mesh position={[0, PLINTH_TOP + 0.01, 0]}>
        <cylinderGeometry args={[0.42, 0.44, 0.02, 48]} />
        <meshStandardMaterial color="#2b333b" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function AirwaysPanel() {
  const a = useLab((s) => s.air);
  const set = (v: Partial<typeof a>) => useLab.getState().set('air', v);
  return (
    <>
      <Group title="Breathing">
        <Chips
          label="Breathing"
          value={a.flow === 0.5 ? 'rest' : a.flow === 3 ? 'exercise' : null}
          onChange={(v) => set({ flow: v === 'rest' ? 0.5 : 3 })}
          options={[
            { value: 'rest', label: 'At rest · 0.5 L/s' },
            { value: 'exercise', label: 'Exercise · 3 L/s' },
          ]}
        />
      </Group>
      <Group title="Controls">
        <Slider
          label="Generation"
          value={a.gen}
          min={0}
          max={MAX_GEN}
          display={a.gen === 0 ? '0 · trachea' : a.gen === 1 ? '1 · main bronchi' : a.gen >= 17 ? `${a.gen} · gas exchange` : `${a.gen}`}
          onChange={(gen) => set({ gen })}
        />
      </Group>
    </>
  );
}

export function AirwaysReadouts() {
  const { gen, flow } = useLab((s) => s.air);
  const d = airwayDiameterMm(gen);
  const area = totalAreaCm2(gen);
  const speed = airSpeedCmS(gen, flow);
  return (
    <>
      <Tile label="Tubes" value={fmt(airways(gen))} tone="cyan" />
      <Tile label="Each tube" value={d >= 1 ? fmt(d, 1) : fmt(d * 1000)} unit={d >= 1 ? 'mm' : 'µm'} />
      <Tile label="Total opening" value={fmt(area, area < 10 ? 1 : 0)} unit="cm²" />
      <Tile label="Air speed" value={speed >= 100 ? fmt(speed / 100, 1) : fmt(speed, speed < 10 ? 1 : 0)} unit={speed >= 100 ? 'm/s' : 'cm/s'} />
    </>
  );
}
