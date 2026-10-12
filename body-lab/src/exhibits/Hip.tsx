// Exhibit 4: hip load. The real left femur in a test rig. A piston presses on
// the femoral head with the force measured by instrumented hip implants
// (Bergmann et al.), cycling at the pace of the chosen activity.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../state/store';
import { useAtlasGroup } from '../lib/atlas';
import { ACTIVITIES, type ActivityId, hipForceN } from '../models/physiology';
import { PLINTH_TOP, glow } from '../scene/Room';
import { Chips, Group, Slider, Tile, fmt } from '../ui/kit';

const FEMUR_H = 0.6;
const BASE = PLINTH_TOP + 0.05;
const RIG_TOP = BASE + FEMUR_H + 0.3;
const MAX_BW = 8.7;

const boneMat = new THREE.MeshPhysicalMaterial({ color: '#E6DDC8', roughness: 0.55, clearcoat: 0.2 });
const BONE = new THREE.Color('#E6DDC8');
const HOT = new THREE.Color('#FF8A3D');
const RED = new THREE.Color('#FF3B2F');
const meterMat = new THREE.MeshBasicMaterial({ color: glow('#FFB35C', 2.4), toneMapped: false });

const gauss = (x: number, m: number, s: number) => Math.exp(-((x - m) ** 2) / (2 * s * s));

/** Fraction of peak load through one cycle of each activity, and cycles per second. */
const PROFILE: Record<ActivityId, { hz: number; f: (phi: number) => number }> = {
  walk: { hz: 0.95, f: (p) => Math.max(gauss(p, 0.16, 0.06), 0.92 * gauss(p, 0.46, 0.07), 0.12) },
  upstairs: { hz: 0.8, f: (p) => Math.max(0.9 * gauss(p, 0.18, 0.07), gauss(p, 0.44, 0.08), 0.12) },
  downstairs: { hz: 0.8, f: (p) => Math.max(gauss(p, 0.14, 0.05), 0.85 * gauss(p, 0.42, 0.08), 0.12) },
  jog: { hz: 1.4, f: (p) => Math.max(gauss(p, 0.18, 0.07), 0.05) },
  stumble: { hz: 0.4, f: (p) => Math.max(gauss(p, 0.3, 0.025), 0.3 * gauss(p, 0.42, 0.06), 0.12) },
};

function Femur({ onHead }: { onHead: (head: THREE.Vector3) => void }) {
  const { object } = useAtlasGroup('skeleton', (p) => p.name === 'left femur', FEMUR_H, () => boneMat);
  const head = useMemo(() => {
    // The highest vertex is the top of the femoral head: where the piston presses.
    object.updateMatrixWorld(true);
    const best = new THREE.Vector3(0, -Infinity, 0);
    const v = new THREE.Vector3();
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.y > best.y) best.copy(v);
      }
    });
    return best;
  }, [object]);
  onHead(head);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const l = load.current;
    boneMat.color.copy(BONE).lerp(l < 0.5 ? HOT : RED, l < 0.5 ? l * 2 * 0.6 : 0.6 + (l - 0.5) * 0.8);
    boneMat.emissive.copy(HOT).multiplyScalar(0.25 * l);
    // A slight, exaggerated squash so the load reads.
    ref.current?.scale.set(1 + 0.01 * l, 1 - 0.018 * l, 1 + 0.01 * l);
  });
  return (
    <group ref={ref} position={[0, BASE + FEMUR_H / 2, 0]}>
      <primitive object={object} />
    </group>
  );
}

/** Current load as a fraction of the worst case (stumbling); shared by the parts of the rig. */
const load = { current: 0 };

function Rig() {
  const piston = useRef<THREE.Group>(null);
  const meter = useRef<THREE.Mesh>(null);
  const headRef = useRef(new THREE.Vector3(-0.08, BASE + FEMUR_H, 0));
  const t = useRef(0);
  const { mass, activity } = useLab((s) => s.hip);
  const bw = ACTIVITIES.find((a) => a.id === activity)!.bw;
  const kgEq = hipForceN(mass, bw) / 9.81;
  const plates = Math.min(14, Math.max(1, Math.round(kgEq / 50)));

  useFrame((_, dt) => {
    const { activity: act } = useLab.getState().hip;
    const prof = PROFILE[act];
    const peak = ACTIVITIES.find((a) => a.id === act)!.bw;
    t.current += dt * prof.hz;
    const f = prof.f(t.current % 1);
    load.current = (f * peak) / MAX_BW;
    const head = headRef.current;
    if (piston.current) piston.current.position.set(head.x, head.y + 0.005 - 0.012 * f, head.z);
    if (meter.current) {
      meter.current.scale.y = Math.max(0.001, load.current);
      meter.current.position.y = BASE + 0.05 + (load.current * 0.7) / 2;
    }
  });

  return (
    <group>
      <Femur onHead={(h) => headRef.current.copy(h).add(new THREE.Vector3(0, BASE + FEMUR_H / 2, 0))} />
      {/* Base plate, pillars and crossbar */}
      <mesh position={[0, BASE - 0.02, 0]}>
        <boxGeometry args={[1.0, 0.04, 0.42]} />
        <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
      </mesh>
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, (BASE + RIG_TOP) / 2, -0.12]}>
          <cylinderGeometry args={[0.025, 0.025, RIG_TOP - BASE, 16]} />
          <meshStandardMaterial color="#9aa6b0" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, RIG_TOP, -0.12]}>
        <boxGeometry args={[0.95, 0.06, 0.1]} />
        <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Load meter on the right pillar */}
      <mesh position={[0.42, BASE + 0.4, -0.06]}>
        <boxGeometry args={[0.03, 0.7, 0.012]} />
        <meshStandardMaterial color="#12171c" />
      </mesh>
      <mesh ref={meter} position={[0.42, BASE + 0.05, -0.05]} material={meterMat}>
        <boxGeometry args={[0.018, 0.7, 0.012]} />
      </mesh>
      {/* Piston: an arm from the crossbar down onto the femoral head, with plates stacked on top */}
      <group ref={piston}>
        <group>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.03, 0.034, 0.05, 24]} />
            <meshStandardMaterial color="#c9d2d8" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.03 + (RIG_TOP - BASE - FEMUR_H) / 2, 0]}>
            <cylinderGeometry args={[0.014, 0.014, RIG_TOP - BASE - FEMUR_H, 12]} />
            <meshStandardMaterial color="#9aa6b0" metalness={0.9} roughness={0.2} />
          </mesh>
          {Array.from({ length: plates }, (_, i) => (
            <mesh key={i} position={[0, RIG_TOP - BASE - FEMUR_H + 0.07 + i * 0.026, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.02, 32]} />
              <meshStandardMaterial color={i % 2 ? '#2c343c' : '#39434d'} metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export function HipScene() {
  return <Rig />;
}

export function HipPanel() {
  const h = useLab((s) => s.hip);
  const set = (v: Partial<typeof h>) => useLab.getState().set('hip', v);
  return (
    <>
      <Group title="Activity">
        <Chips label="Activity" value={h.activity} onChange={(activity) => set({ activity })} options={ACTIVITIES.map((a) => ({ value: a.id, label: a.label }))} />
      </Group>
      <Group title="Controls">
        <Slider label="Body mass" value={h.mass} min={40} max={150} display={`${h.mass} kg`} onChange={(mass) => set({ mass })} />
      </Group>
    </>
  );
}

export function HipReadouts() {
  const { mass, activity } = useLab((s) => s.hip);
  const a = ACTIVITIES.find((x) => x.id === activity)!;
  const n = hipForceN(mass, a.bw);
  return (
    <>
      <Tile label="Peak hip force" value={fmt(n)} unit="N" tone={a.bw > 4 ? 'high' : 'cyan'} />
      <Tile label="Body weights" value={`×${fmt(a.bw, 1)}`} />
      <Tile label="Like holding" value={fmt(n / 9.81)} unit="kg" />
      <Tile label="Over 5,000 steps" value={fmt((n * 5000) / 9810)} unit="tonnes" />
      <Tile label="Measured by" value={a.source} wide />
    </>
  );
}
