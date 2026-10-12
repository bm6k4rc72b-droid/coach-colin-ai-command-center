// Exhibit 1: the heart as a pump. Real BodyParts3D heart beating at the chosen
// rate, blood particles in the outflow loop at the cardiac output, and a dial
// reading mean arterial pressure.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../state/store';
import { useAtlasGroup } from '../lib/atlas';
import { cardiacOutput, meanArterialPressure, pressureBand } from '../models/physiology';
import { Glass, PLINTH_TOP, glow } from '../scene/Room';
import { Chips, Group, Slider, Tile, fmt } from '../ui/kit';

const HEART_Y = PLINTH_TOP + 0.4;
const heartMat = new THREE.MeshPhysicalMaterial({ color: '#B04B48', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 });
const valveMat = new THREE.MeshPhysicalMaterial({ color: '#E3C9B8', roughness: 0.5 });

/** Contraction curve: quick squeeze in systole (first ~35% of the beat), slow refill. */
function squeeze(phase: number) {
  return phase < 0.35 ? Math.sin((Math.PI * phase) / 0.35) : 0;
}

const LOOP = new THREE.CatmullRomCurve3(
  [
    [0.08, HEART_Y + 0.16, 0],
    [0.3, HEART_Y + 0.38, 0.05],
    [0.72, HEART_Y + 0.3, 0.05],
    [0.82, HEART_Y - 0.05, 0.05],
    [0.7, PLINTH_TOP + 0.08, 0.1],
    [0.3, PLINTH_TOP + 0.06, 0.12],
    [-0.02, HEART_Y - 0.18, 0.06],
  ].map((p) => new THREE.Vector3(...(p as [number, number, number]))),
  false,
  'catmullrom',
  0.4,
);
const N_CELLS = 46;

function Flow() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const offset = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tube = useMemo(() => new THREE.TubeGeometry(LOOP, 120, 0.028, 14, false), []);
  useFrame((_, dt) => {
    const { hr, sv } = useLab.getState().heart;
    const co = cardiacOutput(hr, sv);
    const t = performance.now() / 1000;
    const phase = (t * hr) / 60 % 1;
    // Blood surges in systole, coasts in diastole.
    offset.current += dt * co * 0.018 * (0.35 + 1.6 * squeeze(phase));
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < N_CELLS; i++) {
      const u = (i / N_CELLS + offset.current) % 1;
      dummy.position.copy(LOOP.getPointAt(u));
      dummy.scale.setScalar(0.85 + 0.3 * Math.sin(i * 12.9));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshPhysicalMaterial color="#d8eef5" transparent opacity={0.16} roughness={0.05} clearcoat={1} depthWrite={false} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, N_CELLS]}>
        <sphereGeometry args={[0.014, 10, 8]} />
        <meshBasicMaterial color={glow('#ff5a4e', 2.2)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const MAP_MAX = 160;
const DIAL_SWEEP = Math.PI * 1.4;

function Gauge() {
  const needle = useRef<THREE.Group>(null);
  const shown = useRef(90);
  const arc = (from: number, to: number) => {
    const a0 = DIAL_SWEEP / 2 - (from / MAP_MAX) * DIAL_SWEEP;
    const a1 = DIAL_SWEEP / 2 - (to / MAP_MAX) * DIAL_SWEEP;
    return new THREE.RingGeometry(0.105, 0.125, 48, 1, Math.PI / 2 + a1, a0 - a1);
  };
  const bands = useMemo(
    () => [
      { g: arc(0, 65), c: glow('#59D8F0', 1.6) },
      { g: arc(65, 105), c: glow('#7BE08A', 1.6) },
      { g: arc(105, MAP_MAX), c: glow('#FF7A5C', 1.8) },
    ],
    [],
  );
  useFrame((_, dt) => {
    const { hr, sv, svr } = useLab.getState().heart;
    const target = Math.min(MAP_MAX, meanArterialPressure(hr, sv, svr));
    // Small pulse around the mean, like a real arterial trace.
    const phase = ((performance.now() / 1000) * hr) / 60 % 1;
    shown.current += (target - shown.current) * Math.min(1, dt * 4);
    const v = shown.current + 6 * squeeze(phase) - 3;
    if (needle.current) needle.current.rotation.z = DIAL_SWEEP / 2 - (Math.max(0, v) / MAP_MAX) * DIAL_SWEEP;
  });
  return (
    <group position={[0.82, HEART_Y + 0.02, 0.12]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.15, 0.15, 0.03, 48]} />
        <meshStandardMaterial color="#1b2229" roughness={0.4} metalness={0.5} />
      </mesh>
      <group rotation-x={0} position={[0, 0, 0.017]}>
        <mesh>
          <circleGeometry args={[0.135, 48]} />
          <meshStandardMaterial color="#0e1318" roughness={0.6} />
        </mesh>
        {bands.map((b, i) => (
          <mesh key={i} geometry={b.g} position-z={0.001}>
            <meshBasicMaterial color={b.c} toneMapped={false} />
          </mesh>
        ))}
        <group ref={needle} position-z={0.004}>
          <mesh position={[0, 0.055, 0]}>
            <boxGeometry args={[0.006, 0.11, 0.002]} />
            <meshBasicMaterial color={glow('#FFB35C', 2.6)} toneMapped={false} />
          </mesh>
        </group>
        <mesh position-z={0.006}>
          <circleGeometry args={[0.012, 20]} />
          <meshStandardMaterial color="#c9d2d8" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <mesh position={[0, -0.22, -0.02]}>
        <cylinderGeometry args={[0.012, 0.012, 0.32, 10]} />
        <meshStandardMaterial color="#2a323a" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function BeatingHeart() {
  const { object } = useAtlasGroup(
    'heart',
    () => true,
    0.36,
    (p) => (/valve|papillary/.test(p.name) ? valveMat : heartMat),
  );
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const { hr } = useLab.getState().heart;
    const phase = ((performance.now() / 1000) * hr) / 60 % 1;
    const s = 1 - 0.075 * squeeze(phase);
    ref.current?.scale.set(s, 1 - 0.05 * squeeze(phase), s);
    heartMat.emissive.setRGB(0.35 * squeeze(phase), 0.03 * squeeze(phase), 0.02 * squeeze(phase));
  });
  return (
    <group ref={ref} position={[-0.05, HEART_Y, 0]} rotation-y={0.35}>
      <primitive object={object} />
    </group>
  );
}

export function HeartScene() {
  return (
    <group>
      <BeatingHeart />
      <Glass args={[0.3, 0.3, 0.84, 48, 1, true]} position={[-0.05, PLINTH_TOP + 0.42, 0]} />
      <Flow />
      <Gauge />
      <mesh position={[-0.05, PLINTH_TOP + 0.01, 0]}>
        <cylinderGeometry args={[0.32, 0.34, 0.02, 48]} />
        <meshStandardMaterial color="#2b333b" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

const PRESETS = {
  rest: { label: 'Resting adult', hr: 70, sv: 70, svr: 17 },
  athlete: { label: 'Trained athlete', hr: 48, sv: 105, svr: 16 },
  exercise: { label: 'Hard exercise', hr: 160, sv: 110, svr: 6 },
  bleed: { label: 'Severe blood loss', hr: 140, sv: 25, svr: 16 },
} as const;
type PresetId = keyof typeof PRESETS;

export function HeartPanel() {
  const h = useLab((s) => s.heart);
  const set = (v: Partial<typeof h>) => useLab.getState().set('heart', v);
  const active = (Object.keys(PRESETS) as PresetId[]).find(
    (k) => PRESETS[k].hr === h.hr && PRESETS[k].sv === h.sv && PRESETS[k].svr === h.svr,
  );
  return (
    <>
      <Group title="Scenario">
        <Chips
          label="Scenario"
          value={active ?? null}
          onChange={(k) => set({ hr: PRESETS[k].hr, sv: PRESETS[k].sv, svr: PRESETS[k].svr })}
          options={(Object.keys(PRESETS) as PresetId[]).map((k) => ({ value: k, label: PRESETS[k].label }))}
        />
      </Group>
      <Group title="Controls">
        <Slider label="Heart rate" value={h.hr} min={40} max={200} display={`${h.hr} bpm`} onChange={(hr) => set({ hr })} />
        <Slider label="Stroke volume" value={h.sv} min={20} max={130} display={`${h.sv} mL`} onChange={(sv) => set({ sv })} />
        <Slider
          label="Vessel resistance"
          value={h.svr}
          min={4}
          max={30}
          step={0.5}
          display={`${h.svr} WU`}
          onChange={(svr) => set({ svr })}
        />
      </Group>
    </>
  );
}

export function HeartReadouts() {
  const { hr, sv, svr } = useLab((s) => s.heart);
  const co = cardiacOutput(hr, sv);
  const map = meanArterialPressure(hr, sv, svr);
  const band = pressureBand(map);
  return (
    <>
      <Tile label="Cardiac output" value={fmt(co, 1)} unit="L/min" tone="cyan" />
      <Tile label="Mean pressure" value={fmt(map)} unit="mmHg" tone={band.tone} />
      <Tile label="Blood per day" value={fmt((co * 60 * 24) / 1000, 1)} unit="tonnes" />
      <Tile label="Beats per day" value={fmt(hr * 60 * 24)} />
      <Tile label="Verdict" value={band.label} wide tone={band.tone} />
    </>
  );
}
