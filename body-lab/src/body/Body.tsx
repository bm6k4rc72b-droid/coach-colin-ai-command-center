// The explorable body: hover any structure for its name, click to select it,
// toggle layers, and open an exhibit to see its physiology run on the real
// organs (the heart beats, the lungs breathe, the femur takes the load…).
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { EXHIBITS } from '../exhibits';
import { squeeze } from '../exhibits/Heart';
import { MAX_BW, PROFILE } from '../exhibits/Hip';
import { ATLAS, useManifest } from '../lib/atlas';
import { ACTIVITIES, RACERS, conductionSpeed, playbackSeconds, raceHours, remaining, travelMs } from '../models/physiology';
import { useLab } from '../state/store';
import type { AtlasManifest } from '../types';
import { tooltip } from '../ui/tooltipBus';
import { SYSTEM_COLOR, type Part, body, buildSystem, centreOf, focusPoints } from './registry';

const CORE = ['skeleton', 'heart', 'respiratory', 'viscera', 'nervous', 'sensory', 'arteries', 'veins'];

const SELECT = new THREE.Color('#FFB35C');
const RED = new THREE.Color('#FF4A3D');
const CYAN = new THREE.Color('#59D8F0');
const ORANGE = new THREE.Color('#FF8A3D');
const GREEN = new THREE.Color('#6CF09A');
const NO_RAYCAST = () => undefined;
const BASE_COLORS: Record<string, THREE.Color> = Object.fromEntries(Object.entries(SYSTEM_COLOR).map(([k, v]) => [k, new THREE.Color(v)]));

const RACER_COLORS = RACERS.map((r) => new THREE.Color(r.color));

/** Is this structure the subject of the focused exhibit? */
function isFocus(p: Part, focus: number) {
  switch (focus) {
    case 2:
      return p.system === 'nervous';
    case 3:
      return /^left (femur|hip bone)$|^sacrum$/.test(p.piece.name);
    case 4:
      return /^pancrea/.test(p.piece.name);
    case 5:
      return p.system === 'nervous';
    default:
      return p.exhibit === focus;
  }
}

/** How much of each non-focus layer stays visible as context. */
function contextOpacity(p: Part, focus: number) {
  if (p.layer === 'muscles') return 0.04;
  if (p.layer === 'skeleton') return focus === 2 || focus === 3 ? 0.3 : 0.14;
  if (p.layer === 'vessels') return focus === 0 ? 0.4 : 0.1;
  if (focus === 4 && /^stomach|^duodenum/.test(p.piece.name)) return 0.28;
  if (focus === 5 && p.piece.name === 'eyeball') return 0.5;
  return 0.12;
}

// Parts and their group are built together: StrictMode runs memos twice, and a
// mesh can only live in one group.
function grouped(parts: Part[]) {
  const group = new THREE.Group();
  parts.forEach((p) => group.add(p.mesh));
  return { parts, group };
}

function usePieceEvents() {
  return useMemo(
    () => ({
      onPointerMove(e: ThreeEvent<PointerEvent>) {
        e.stopPropagation();
        const ud = e.object.userData as { id: string; name: string; system: string };
        useLab.getState().hover({ id: ud.id, name: ud.name, system: ud.system });
        if (e.pointerType !== 'touch') tooltip.move(e.nativeEvent.clientX, e.nativeEvent.clientY);
      },
      onPointerOut() {
        useLab.getState().hover(null);
      },
      onClick(e: ThreeEvent<MouseEvent>) {
        e.stopPropagation();
        if (e.delta > 4) return; // a drag, not a click
        const ud = e.object.userData as { id: string; name: string; system: string };
        useLab.getState().select({ id: ud.id, name: ud.name, system: ud.system });
      },
    }),
    [],
  );
}

/** Muscles are 5 MB, so they load only when their layer is first switched on. */
function Muscles({ manifest }: { manifest: AtlasManifest }) {
  const gltf = useGLTF(`${ATLAS}muscles.glb`, false, true);
  const { parts, group } = useMemo(() => grouped(buildSystem(gltf.scene, 'muscles', manifest)), [gltf, manifest]);
  useEffect(() => {
    body.add(parts);
    return () => {
      body.parts = body.parts.filter((p) => !parts.includes(p));
    };
  }, [parts]);
  const events = usePieceEvents();
  return (
    <group {...events}>
      <primitive object={group} />
    </group>
  );
}

/** A nerve impulse racing from the left heel to the brain at the chosen fibre's speed. */
function NerveImpulse({ manifest }: { manifest: AtlasManifest }) {
  const curve = useMemo(() => {
    const at = (name: string) => centreOf(manifest, (p) => p.name === name);
    const pts = [
      at('left calcaneus'),
      at('left tibia').add(new THREE.Vector3(0, 0, 0.03)),
      at('left femur').add(new THREE.Vector3(-0.01, 0, 0.0)),
      at('sacrum').add(new THREE.Vector3(0.01, 0, -0.01)),
      at('first lumbar vertebra').add(new THREE.Vector3(0, 0, -0.01)),
      at('first thoracic vertebra').add(new THREE.Vector3(0, 0, 0)),
      centreOf(manifest, (p) => p.system === 'nervous' && p.region === 'Brain'),
    ];
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  }, [manifest]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.0035, 8, false), [curve]);
  const pulse = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const clock = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const TRAIL = 14;

  useFrame((_, dt) => {
    const { nerve, view, index } = useLab.getState();
    const on = view === 'body' && index === 2;
    if (!pulse.current || !trail.current) return;
    pulse.current.visible = on;
    trail.current.visible = on;
    if (!on) return;
    const dur = playbackSeconds(travelMs(1.7, conductionSpeed(nerve.d, nerve.myelin)));
    clock.current = (clock.current + dt) % (dur + 0.9);
    let u = Math.min(1, clock.current / dur);
    // Myelinated fibres: the impulse leaps node to node.
    if (nerve.myelin) u = Math.floor(u * 28) / 28;
    const travelling = clock.current < dur;
    pulse.current.position.copy(curve.getPointAt(u));
    pulse.current.scale.setScalar(travelling ? 1 : Math.max(0, 1 - (clock.current - dur) * 2));
    for (let i = 0; i < TRAIL; i++) {
      const ui = Math.max(0, u - (i + 1) * 0.012);
      dummy.position.copy(curve.getPointAt(ui));
      dummy.scale.setScalar(travelling && ui > 0 ? 1 - i / TRAIL : 0);
      dummy.updateMatrix();
      trail.current.setMatrixAt(i, dummy.matrix);
    }
    trail.current.instanceMatrix.needsUpdate = true;
    // The brain lights up on arrival.
    arrival = travelling ? 0 : Math.max(0, 1 - (clock.current - dur) / 0.8);
  });

  const index = useLab((s) => s.index);
  const view = useLab((s) => s.view);
  return (
    <group>
      <mesh geometry={tube} visible={view === 'body' && index === 2} renderOrder={30}>
        <meshBasicMaterial color={CYAN} transparent opacity={0.28} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={pulse} renderOrder={31}>
        <sphereGeometry args={[0.016, 16, 12]} />
        <meshBasicMaterial color={new THREE.Color('#59D8F0').multiplyScalar(4)} depthTest={false} toneMapped={false} />
      </mesh>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL]} renderOrder={31}>
        <sphereGeometry args={[0.009, 10, 8]} />
        <meshBasicMaterial color={new THREE.Color('#59D8F0').multiplyScalar(2.2)} depthTest={false} transparent opacity={0.7} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
let arrival = 0;

function Hotspots({ manifest }: { manifest: AtlasManifest }) {
  const points = useMemo(() => focusPoints(manifest), [manifest]);
  const show = useLab((s) => s.view === 'body' && s.index === null && s.ready);
  const go = useLab((s) => s.go);
  if (!show) return null;
  return (
    <>
      {points.map((f, i) => (
        <Html key={i} position={f.anchor} center zIndexRange={[10, 0]}>
          <button type="button" className="hotspot" onClick={() => go(i)} style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="hotspot-dot">{String(i + 1).padStart(2, '0')}</span>
            <span className="hotspot-label">{EXHIBITS[i].title.replace(/^The /, '')}</span>
          </button>
        </Html>
      ))}
    </>
  );
}

export function Body() {
  const manifest = useManifest();
  const gltfs = useGLTF(CORE.map((s) => `${ATLAS}${s}.glb`), false, true);
  const { parts, group } = useMemo(
    () => grouped(gltfs.flatMap((g, i) => buildSystem(g.scene, CORE[i], manifest))),
    [gltfs, manifest],
  );
  const centres = useMemo(
    () => ({
      heart: centreOf(manifest, (p) => p.system === 'heart'),
      lungs: centreOf(manifest, (p) => p.system === 'respiratory'),
    }),
    [manifest],
  );

  useEffect(() => {
    body.add(parts);
    useLab.setState({ ready: true });
    return () => {
      body.parts = body.parts.filter((p) => !parts.includes(p));
    };
  }, [parts]);

  const musclesOn = useLab((s) => s.layers.muscles);
  const [musclesWanted, setMusclesWanted] = useState(false);
  useEffect(() => {
    if (musclesOn) setMusclesWanted(true);
  }, [musclesOn]);

  const hipClock = useRef(0);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const st = useLab.getState();
    const inBody = st.view === 'body';
    const focus = inBody ? st.index : null;
    const k = 1 - Math.exp(-8 * dt);
    const now = performance.now();

    // Live physiology driving the body.
    const beat = squeeze(((now / 1000) * st.heart.hr) / 60 % 1);
    const s = 1 - 0.07 * beat;
    const breathRate = st.air.flow > 1 ? 30 : 12;
    const breath = Math.sin(((now / 1000) * breathRate * Math.PI * 2) / 60);
    const prof = PROFILE[st.hip.activity];
    hipClock.current += dt * prof.hz;
    const hipLoad = (prof.f(hipClock.current % 1) * ACTIVITIES.find((a) => a.id === st.hip.activity)!.bw) / MAX_BW;
    const hours = raceHours(st.race.u);
    const left = RACERS.map((r) => remaining(r.halfLifeH, hours));
    const sumLeft = left.reduce((a, b) => a + b, 0);
    const raceColor = new THREE.Color(0, 0, 0);
    if (sumLeft > 0) RACER_COLORS.forEach((c, i) => raceColor.add(c.clone().multiplyScalar(left[i] / sumLeft)));
    const r = st.reaction;
    const sinceGo = r.phase === 'go' || r.phase === 'result' ? now - r.goAt : -1;

    for (const p of body.parts) {
      // Opacity: layers, X-ray, and ghosting around a focused exhibit.
      let target = inBody && st.layers[p.layer] ? 1 : 0;
      if (target && st.xray && (p.layer === 'skeleton' || p.layer === 'muscles')) target = p.layer === 'muscles' ? 0.12 : 0.22;
      if (focus !== null) target = isFocus(p, focus) ? 1 : Math.min(target, contextOpacity(p, focus));
      // Fast and slow: see through the cortex to the amygdala deep inside.
      if (focus === 5 && p.system === 'nervous' && !/amygdala/.test(p.piece.name)) target = 0.42;
      p.opacity += (target - p.opacity) * k;
      const mat = p.mat;
      mat.opacity = p.opacity;
      const opaque = p.opacity > 0.97;
      if (mat.transparent === opaque) {
        mat.transparent = !opaque;
        mat.needsUpdate = true;
      }
      mat.depthWrite = p.opacity > 0.6;
      p.mesh.visible = p.opacity > 0.015;
      // Only clearly visible structures can be hovered or picked.
      const pickable = p.opacity > 0.3;
      if (p.mesh.userData.pickable !== pickable) {
        p.mesh.userData.pickable = pickable;
        p.mesh.raycast = pickable ? THREE.Mesh.prototype.raycast : NO_RAYCAST;
      }

      // Motion: the heart beats and the lungs breathe all the time.
      p.mesh.position.copy(p.home);
      p.mesh.scale.setScalar(1);
      let glow = 0;
      let glowColor = RED;
      if (p.system === 'heart') {
        p.mesh.position.sub(centres.heart).multiplyScalar(s).add(centres.heart);
        p.mesh.scale.setScalar(s);
        if (focus === 0) glow = 0.55 * beat;
      } else if (p.system === 'respiratory') {
        const sx = 1 + 0.022 * breath;
        p.mesh.position.sub(centres.lungs).multiply(new THREE.Vector3(sx, 1 + 0.01 * breath, sx)).add(centres.lungs);
        p.mesh.scale.set(sx, 1 + 0.01 * breath, sx);
        if (focus === 1) {
          glowColor = CYAN;
          glow = /trachea|bronchus/.test(p.piece.name) ? 0.6 + 0.3 * breath : 0.12 + 0.08 * breath;
        }
      } else if (focus === 0 && p.system === 'arteries') {
        glow = 0.35 * beat;
      } else if (focus === 3 && isFocus(p, 3)) {
        glowColor = ORANGE;
        glow = Math.min(1.4, hipLoad * 1.6);
      } else if (focus === 4 && isFocus(p, 4)) {
        glowColor = raceColor;
        glow = Math.max(...left) * 0.9;
      } else if (focus === 5 && (isFocus(p, 5) || p.piece.name === 'eyeball')) {
        glowColor = GREEN;
        if (r.phase === 'waiting') {
          glowColor = RED;
          glow = 0.08 + 0.06 * Math.sin(now / 160);
        } else if (sinceGo >= 0) {
          // Light reaches the eyes first, the amygdala by ~74 ms, meaning by ~400 ms.
          const fade = (t0: number) => (sinceGo < t0 ? 0 : Math.max(0, 1 - (sinceGo - t0) / 1600));
          if (p.piece.name === 'eyeball') glow = fade(0);
          else if (/amygdala/.test(p.piece.name)) glow = 1.3 * fade(74);
          else glow = 0.45 * fade(400);
        }
      } else if (focus === 2 && p.system === 'nervous') {
        glowColor = CYAN;
        glow = 0.5 * arrival;
      }
      p.glow += (glow - p.glow) * Math.min(1, dt * 18);
      p.glowColor.copy(glowColor);

      mat.color.copy(BASE_COLORS[p.system]).lerp(p.glowColor, Math.min(0.65, p.glow * 0.6));
      mat.emissive.copy(p.glowColor).multiplyScalar(p.glow * 0.7);
      if (st.selected?.id === p.piece.id) mat.emissive.add(tmp.copy(SELECT).multiplyScalar(0.45));
      else if (st.hovered?.id === p.piece.id) mat.emissive.addScalar(0.1);
    }
  });

  const events = usePieceEvents();
  return (
    <group>
      <group {...events}>
        <primitive object={group} />
      </group>
      {musclesWanted && (
        <Suspense
          fallback={
            <Html position={[0, 1.1, 0]} center className="scene-note">
              Loading muscles…
            </Html>
          }
        >
          <Muscles manifest={manifest} />
        </Suspense>
      )}
      <NerveImpulse manifest={manifest} />
      <Hotspots manifest={manifest} />
    </group>
  );
}

