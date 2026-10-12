// Exhibit 3: nerve conduction. One metre of axon in a glass tube. With myelin
// the impulse jumps from node to node; without it, it crawls.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../state/store';
import { conductionSpeed, fibreClass, playbackSeconds, travelMs } from '../models/physiology';
import { PLINTH_TOP, glow } from '../scene/Room';
import { Toggle } from '../ui/controls';
import { Chips, Group, Slider, Tile, fmt } from '../ui/kit';

const Y = PLINTH_TOP + 0.36;
const X0 = -0.95;
const X1 = 0.95;
const SHEATHS = 9;
const GAP = 0.03;
const sheathLen = (X1 - X0 - GAP * (SHEATHS + 1)) / SHEATHS;
/** x of each node of Ranvier (the gaps), including both ends. */
const NODES = Array.from({ length: SHEATHS + 1 }, (_, i) => X0 + GAP / 2 + i * (sheathLen + GAP));

const axonRadius = (d: number) => 0.008 + 0.0026 * d;

const pulseMat = new THREE.MeshBasicMaterial({ color: glow('#59D8F0', 3), toneMapped: false });
const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a2a1a'), toneMapped: false });
const LAMP_OFF = new THREE.Color('#3a2a1a');
const LAMP_ON = glow('#FFB35C', 4);

function Axon() {
  const { d, myelin } = useLab((s) => s.nerve);
  const r = axonRadius(d);
  const pulse = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const nodeMats = useMemo(
    () => NODES.map(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#2a5560'), toneMapped: false })),
    [],
  );

  useFrame((_, dt) => {
    const { d: dd, myelin: my } = useLab.getState().nerve;
    const ms = travelMs(1, conductionSpeed(dd, my));
    const dur = playbackSeconds(ms);
    clock.current += dt;
    const cycle = dur + 0.8;
    if (clock.current > cycle) clock.current -= cycle;
    const p = Math.min(1, clock.current / dur);
    const travelling = clock.current < dur;
    let x: number;
    if (my) {
      const i = Math.min(NODES.length - 1, Math.floor(p * NODES.length));
      x = NODES[i];
      nodeMats.forEach((m, k) => {
        const lit = travelling && k <= i ? Math.max(0, 1 - (i - k) * 0.35) : 0;
        m.color.set('#2a5560').lerp(glow('#59D8F0', 3), lit);
      });
    } else {
      x = X0 + (X1 - X0) * p;
    }
    if (pulse.current) {
      pulse.current.position.x = x;
      pulse.current.visible = travelling;
    }
    // Lamp at the far end flashes on arrival and fades.
    const since = clock.current - dur;
    lampMat.color.copy(LAMP_OFF).lerp(LAMP_ON, since >= 0 ? Math.max(0, 1 - since / 0.6) : 0);
  });

  return (
    <group>
      {/* Axon core */}
      <mesh position={[0, Y, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[r, r, X1 - X0, 24]} />
        <meshStandardMaterial color="#C9A86A" roughness={0.5} emissive="#3a2a10" />
      </mesh>
      {/* Myelin sheaths and nodes of Ranvier */}
      {myelin &&
        Array.from({ length: SHEATHS }, (_, i) => (
          <mesh key={i} position={[NODES[i] + GAP / 2 + sheathLen / 2, Y, 0]} rotation-z={Math.PI / 2}>
            <capsuleGeometry args={[r * 1.9, Math.max(0.001, sheathLen - r * 3.8), 8, 24]} />
            <meshPhysicalMaterial color="#EDE6D8" roughness={0.35} clearcoat={0.6} transparent opacity={0.92} />
          </mesh>
        ))}
      {myelin &&
        NODES.map((nx, i) => (
          <mesh key={i} position={[nx, Y, 0]} rotation-z={Math.PI / 2} material={nodeMats[i]}>
            <cylinderGeometry args={[r * 1.15, r * 1.15, GAP * 0.7, 20]} />
          </mesh>
        ))}
      {/* The impulse */}
      <group ref={pulse} position={[X0, Y, 0]}>
        <mesh rotation-y={Math.PI / 2} material={pulseMat}>
          <torusGeometry args={[(myelin ? r * 1.9 : r) + 0.012, 0.007, 10, 36]} />
        </mesh>
        <mesh material={pulseMat}>
          <sphereGeometry args={[r * 1.05, 16, 12]} />
        </mesh>
      </group>
    </group>
  );
}

function Fixtures() {
  const ms = useLab((s) => travelMs(1, conductionSpeed(s.nerve.d, s.nerve.myelin)));
  const slow = (playbackSeconds(ms) * 1000) / ms;
  return (
    <group>
      {/* Glass tube and end caps */}
      <mesh position={[0, Y, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.11, 0.11, X1 - X0 + 0.08, 40, 1, true]} />
        <meshPhysicalMaterial color="#d8eef5" transparent opacity={0.12} roughness={0.05} clearcoat={1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[X0 - 0.06, X1 + 0.06].map((x) => (
        <mesh key={x} position={[x, Y, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.125, 0.125, 0.05, 40]} />
          <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {[X0 + 0.15, X1 - 0.15].map((x) => (
        <mesh key={x} position={[x, (PLINTH_TOP + Y) / 2 - 0.05, 0]}>
          <cylinderGeometry args={[0.012, 0.012, Y - PLINTH_TOP - 0.1, 10]} />
          <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Arrival lamp */}
      <mesh position={[X1 + 0.06, Y + 0.17, 0]} material={lampMat}>
        <sphereGeometry args={[0.04, 24, 16]} />
      </mesh>
      <Html position={[X0 - 0.02, Y - 0.2, 0]} className="scene-note" zIndexRange={[5, 0]}>
        skin
      </Html>
      <Html position={[X1 + 0.02, Y - 0.2, 0]} className="scene-note" zIndexRange={[5, 0]}>
        <span className="is-end">spinal cord · 1 m</span>
      </Html>
      <Html position={[0, Y + 0.2, 0]} center className="scene-note is-dim" zIndexRange={[5, 0]}>
        {slow >= 1.5 ? `slowed down ×${fmt(slow)}` : 'real time'}
      </Html>
    </group>
  );
}

export function NerveScene() {
  return (
    <group>
      <Fixtures />
      <Axon />
    </group>
  );
}

const PRESETS = {
  aa: { label: 'Aα · position', d: 15, myelin: true },
  ab: { label: 'Aβ · touch', d: 8, myelin: true },
  ad: { label: 'Aδ · sharp pain', d: 3, myelin: true },
  c: { label: 'C · dull pain', d: 0.8, myelin: false },
} as const;
type PresetId = keyof typeof PRESETS;

// Diameter slider runs on a log scale, 0.2–20 µm.
const toD = (u: number) => Math.round(0.2 * 100 ** u * 10) / 10;
const toU = (d: number) => Math.log(d / 0.2) / Math.log(100);

export function NervePanel() {
  const n = useLab((s) => s.nerve);
  const set = (v: Partial<typeof n>) => useLab.getState().set('nerve', v);
  const active = (Object.keys(PRESETS) as PresetId[]).find((k) => PRESETS[k].d === n.d && PRESETS[k].myelin === n.myelin);
  return (
    <>
      <Group title="Fibre type">
        <Chips
          label="Fibre type"
          value={active ?? null}
          onChange={(k) => set({ d: PRESETS[k].d, myelin: PRESETS[k].myelin })}
          options={(Object.keys(PRESETS) as PresetId[]).map((k) => ({ value: k, label: PRESETS[k].label }))}
        />
      </Group>
      <Group title="Controls">
        <Slider
          label="Fibre diameter"
          value={toU(n.d)}
          min={0}
          max={1}
          step={0.005}
          display={`${fmt(n.d, n.d < 10 ? 1 : 0)} µm`}
          onChange={(u) => set({ d: Math.max(0.2, toD(u)) })}
        />
        <div className="row">
          <span className="slider-label">Myelin sheath</span>
          <Toggle label="Myelin sheath" on={n.myelin} onChange={(myelin) => set({ myelin })} />
        </div>
      </Group>
    </>
  );
}

export function NerveReadouts() {
  const { d, myelin } = useLab((s) => s.nerve);
  const v = conductionSpeed(d, myelin);
  const ms = travelMs(1, v);
  return (
    <>
      <Tile label="Speed" value={fmt(v, v < 10 ? 1 : 0)} unit="m/s" tone="cyan" />
      <Tile label="Same in km/h" value={fmt(v * 3.6)} unit="km/h" />
      <Tile label="Over 1 metre" value={ms >= 1000 ? fmt(ms / 1000, 2) : fmt(ms, ms < 10 ? 1 : 0)} unit={ms >= 1000 ? 's' : 'ms'} />
      <Tile label="Toe to brain" value={fmt(travelMs(1.7, v), 0)} unit="ms" />
      <Tile label="Fibre" value={fibreClass(d, myelin)} wide />
    </>
  );
}
