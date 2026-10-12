// Exhibit 5: the half-life race. Three glass columns hold what is left of
// natural GLP-1 and two GLP-1 medicines once each is in the blood, on a
// log clock from one minute to four weeks.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../state/store';
import { RACERS, formatHours, raceHours, remaining } from '../models/physiology';
import { PLINTH_TOP, glow } from '../scene/Room';
import { IconPause, IconPlay, IconReset } from '../ui/icons';
import { Group, Slider, Tile, fmt } from '../ui/kit';

const H = 0.78;
const R = 0.13;
const SPACING = 0.62;

function Column({ index }: { index: number }) {
  const racer = RACERS[index];
  const liquid = useRef<THREE.Mesh>(null);
  const surface = useRef<THREE.Mesh>(null);
  const shown = useRef(1);
  const x = (index - 1) * SPACING;
  useFrame((_, dt) => {
    const { u } = useLab.getState().race;
    const target = remaining(racer.halfLifeH, raceHours(u));
    shown.current += (target - shown.current) * Math.min(1, dt * 8);
    const f = Math.max(0.0005, shown.current);
    if (liquid.current) {
      liquid.current.scale.y = f;
      liquid.current.position.y = PLINTH_TOP + 0.04 + (H * f) / 2;
    }
    if (surface.current) {
      surface.current.position.y = PLINTH_TOP + 0.04 + H * f;
      surface.current.visible = shown.current > 0.002;
    }
  });
  return (
    <group position={[x, 0, 0]}>
      <mesh ref={liquid}>
        <cylinderGeometry args={[R * 0.92, R * 0.92, H, 40]} />
        <meshPhysicalMaterial color={racer.color} emissive={racer.color} emissiveIntensity={0.55} transparent opacity={0.85} roughness={0.2} />
      </mesh>
      <mesh ref={surface} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[R * 0.92, 40]} />
        <meshBasicMaterial color={glow(racer.color, 2.2)} toneMapped={false} />
      </mesh>
      {/* Glass, base and cap */}
      <mesh position={[0, PLINTH_TOP + 0.04 + H / 2, 0]}>
        <cylinderGeometry args={[R, R, H + 0.02, 40, 1, true]} />
        <meshPhysicalMaterial color="#d8eef5" transparent opacity={0.14} roughness={0.05} clearcoat={1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[PLINTH_TOP + 0.02, PLINTH_TOP + 0.06 + H].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[R + 0.02, R + 0.02, 0.04, 40]} />
          <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Half-way mark */}
      <mesh position={[0, PLINTH_TOP + 0.04 + H / 2, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[R + 0.003, 0.0025, 6, 48]} />
        <meshBasicMaterial color={glow('#ffffff', 1.2)} toneMapped={false} transparent opacity={0.5} />
      </mesh>
      <Html position={[0, PLINTH_TOP + H + 0.2, 0]} center className="scene-note" zIndexRange={[5, 0]}>
        <span style={{ color: racer.color }}>●</span> {racer.label}
      </Html>
    </group>
  );
}

function Player() {
  useFrame((_, dt) => {
    const { race, set } = useLab.getState();
    if (!race.playing) return;
    const u = race.u + dt * 0.07;
    set('race', u >= 1 ? { u: 1, playing: false } : { u });
  });
  return null;
}

export function HalfLifeScene() {
  return (
    <group>
      <Player />
      {RACERS.map((r, i) => (
        <Column key={r.id} index={i} />
      ))}
    </group>
  );
}

export function HalfLifePanel() {
  const r = useLab((s) => s.race);
  const set = (v: Partial<typeof r>) => useLab.getState().set('race', v);
  return (
    <Group title="Clock">
      <Slider
        label="Time since it reached the blood"
        value={r.u}
        min={0}
        max={1}
        step={0.001}
        display={formatHours(raceHours(r.u))}
        onChange={(u) => set({ u, playing: false })}
      />
      <div className="button-row">
        <button type="button" className="btn is-primary" onClick={() => set({ playing: !r.playing, u: r.u >= 1 ? 0 : r.u })}>
          {r.playing ? <IconPause /> : <IconPlay />}
          {r.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn" onClick={() => set({ u: 0, playing: false })}>
          <IconReset />
          Reset
        </button>
      </div>
    </Group>
  );
}

function pct(f: number) {
  if (f >= 0.995) return '100';
  if (f >= 0.1) return fmt(f * 100);
  if (f >= 0.001) return fmt(f * 100, 1);
  return '<0.1';
}

export function HalfLifeReadouts() {
  const u = useLab((s) => s.race.u);
  const h = raceHours(u);
  return (
    <>
      <Tile label="Elapsed" value={formatHours(h)} tone="cyan" />
      {RACERS.map((r) => (
        <Tile key={r.id} label={r.label.replace('Natural ', '')} value={pct(remaining(r.halfLifeH, h))} unit="%" />
      ))}
    </>
  );
}
