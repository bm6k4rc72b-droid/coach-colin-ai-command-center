// Exhibit 6: fast and slow. A reaction test against the real BodyParts3D
// brain: wait for the light, tap, and compare with how fast the brain's
// alarm system and its meaning system work.
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab, type ReactionPhase } from '../state/store';
import { useAtlasGroup } from '../lib/atlas';
import { REACTION_BENCHMARKS, reactionVerdict } from '../models/physiology';
import { PLINTH_TOP, glow } from '../scene/Room';
import { Group, Tile, fmt } from '../ui/kit';

const BRAIN_Y = PLINTH_TOP + 0.3;
const brainMat = new THREE.MeshPhysicalMaterial({ color: '#E3CD93', roughness: 0.5, clearcoat: 0.3 });
const ringMat = new THREE.MeshBasicMaterial({ toneMapped: false });
const BRAIN = new THREE.Color('#E3CD93');

const LAMP: Record<ReactionPhase, THREE.Color> = {
  idle: new THREE.Color('#2b3540'),
  waiting: glow('#FF5A4E', 2.4),
  go: glow('#6CF09A', 3.2),
  result: glow('#59D8F0', 2),
  early: glow('#FF5A4E', 1.2),
};

let timer: ReturnType<typeof setTimeout> | undefined;

function start() {
  clearTimeout(timer);
  const set = useLab.getState().set;
  set('reaction', { phase: 'waiting', result: null });
  timer = setTimeout(() => set('reaction', { phase: 'go', goAt: performance.now() }), 1500 + Math.random() * 2500);
}

/** Space, click or tap: start, react or try again depending on the phase. */
export function tap(at = performance.now()) {
  const { reaction: r, set } = useLab.getState();
  if (r.phase === 'waiting') {
    clearTimeout(timer);
    set('reaction', { phase: 'early' });
  } else if (r.phase === 'go') {
    const ms = Math.round(at - r.goAt);
    set('reaction', {
      phase: 'result',
      result: ms,
      best: r.best === null ? ms : Math.min(r.best, ms),
      tries: [...r.tries, ms].slice(-5),
    });
  } else {
    start();
  }
}

function Brain() {
  const { object } = useAtlasGroup('nervous', (p) => p.region === 'Brain', 0.3, () => brainMat);
  const ref = useRef<THREE.Group>(null);
  const flash = useRef(0);
  useFrame((_, dt) => {
    const { phase } = useLab.getState().reaction;
    flash.current = phase === 'go' ? 1 : Math.max(0, flash.current - dt * 1.5);
    brainMat.emissive.copy(phase === 'waiting' ? new THREE.Color('#40160f') : BRAIN).multiplyScalar(
      phase === 'waiting' ? 0.5 + 0.5 * Math.sin(performance.now() / 160) : 0.35 * flash.current,
    );
    ringMat.color.lerp(LAMP[phase], Math.min(1, dt * 14));
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={ref} position={[0, BRAIN_Y, 0]}>
      <primitive object={object} />
    </group>
  );
}

export function ReactionScene() {
  return (
    <group>
      <Brain />
      {/* Dome */}
      <mesh position={[0, PLINTH_TOP + 0.05, 0]}>
        <sphereGeometry args={[0.36, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#d8eef5" transparent opacity={0.12} roughness={0.04} clearcoat={1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, PLINTH_TOP + 0.025, 0]}>
        <cylinderGeometry args={[0.4, 0.42, 0.05, 64]} />
        <meshStandardMaterial color="#2a323a" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Signal ring */}
      <mesh position={[0, PLINTH_TOP + 0.052, 0]} rotation-x={-Math.PI / 2} material={ringMat}>
        <ringGeometry args={[0.37, 0.395, 64]} />
      </mesh>
      {/* The big button on the console */}
      <mesh position={[0.72, PLINTH_TOP + 0.02, 0.25]} material={ringMat} onPointerDown={(e) => (e.stopPropagation(), tap())}>
        <cylinderGeometry args={[0.09, 0.1, 0.04, 40]} />
      </mesh>
    </group>
  );
}

const MESSAGES: Record<ReactionPhase, string> = {
  idle: 'Start',
  waiting: 'Wait for green…',
  go: 'TAP!',
  result: 'Again',
  early: 'Too soon! Try again',
};

export function ReactionPanel() {
  const phase = useLab((s) => s.reaction.phase);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      tap(e.timeStamp || performance.now());
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      const r = useLab.getState().reaction;
      if (r.phase === 'waiting' || r.phase === 'go') useLab.getState().set('reaction', { phase: 'idle' });
    };
  }, []);
  return (
    <Group title="Test">
      <button
        type="button"
        className={`big-button phase-${phase}`}
        onPointerDown={(e) => {
          e.preventDefault();
          tap(e.timeStamp || performance.now());
        }}
      >
        {MESSAGES[phase]}
      </button>
      <p className="hint">Press Start, wait for the ring to turn green, then tap as fast as you can. Space bar works too.</p>
    </Group>
  );
}

export function ReactionReadouts() {
  const { result, best, tries, phase } = useLab((s) => s.reaction);
  const avg = tries.length ? tries.reduce((a, b) => a + b, 0) / tries.length : null;
  const you = result ?? best;
  const bars = [...REACTION_BENCHMARKS.map((b) => ({ label: b.label, ms: b.ms, you: false })), ...(you !== null ? [{ label: 'You', ms: you, you: true }] : [])].sort(
    (a, b) => a.ms - b.ms,
  );
  const max = Math.max(500, ...bars.map((b) => b.ms));
  return (
    <>
      <Tile label="Your time" value={phase === 'early' ? 'early' : result !== null ? fmt(result) : '–'} unit={result !== null && phase !== 'early' ? 'ms' : undefined} tone="cyan" />
      <Tile label="Best" value={best !== null ? fmt(best) : '–'} unit={best !== null ? 'ms' : undefined} />
      <Tile label="Average" value={avg !== null ? fmt(avg) : '–'} unit={avg !== null ? 'ms' : undefined} />
      <Tile label="Tries" value={tries.length} />
      <div className="tile is-wide bars">
        {bars.map((b) => (
          <div key={b.label} className={`bar${b.you ? ' is-you' : ''}`}>
            <span className="bar-label">{b.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${Math.min(100, (b.ms / max) * 100)}%` }} />
            </span>
            <span className="bar-ms">{fmt(b.ms)} ms</span>
          </div>
        ))}
        {result !== null && phase === 'result' && <div className="verdict">{reactionVerdict(result)}</div>}
      </div>
    </>
  );
}
