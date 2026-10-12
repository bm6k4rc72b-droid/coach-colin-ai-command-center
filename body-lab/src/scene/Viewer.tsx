import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Body } from '../body/Body';
import { focusPoints } from '../body/registry';
import { EXHIBITS } from '../exhibits';
import { RacePlayer } from '../exhibits/HalfLife';
import { ATLAS, loadManifest, useManifest } from '../lib/atlas';
import { useLab } from '../state/store';
import { HOME, rig } from './rig';
import { Room } from './Room';

const LITE = new URLSearchParams(location.search).has('lite');

// Start fetching the models up front, so opening an exhibit never waits.
loadManifest();
for (const s of ['skeleton', 'heart', 'respiratory', 'viscera', 'nervous', 'sensory', 'arteries', 'veins'])
  useGLTF.preload(`${ATLAS}${s}.glb`, false, true);

const BENCH_TARGET = new THREE.Vector3(0, 1.32, 0);
const narrow = (camera: THREE.PerspectiveCamera) => camera.aspect < 0.8;

/** Front view of the plinth; on narrow screens, pulled back until the apparatus fits across. */
function benchPosition(camera: THREE.PerspectiveCamera, width: number) {
  let dist = 4.3;
  if (narrow(camera)) {
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    dist = Math.max(4.6, (width / 2 / Math.tan(halfFov)) * 1.08);
  }
  return new THREE.Vector3(0, BENCH_TARGET.y + 0.11 * dist, dist);
}

/** Flies the camera whenever the view or the focused exhibit changes. */
function Director() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const aspect = useThree((s) => s.size.width / s.size.height);
  const manifest = useManifest();
  const points = useMemo(() => focusPoints(manifest), [manifest]);
  const view = useLab((s) => s.view);
  const index = useLab((s) => s.index);
  const first = useRef(true);

  useEffect(() => {
    if (!controls) return;
    rig.attach(camera, controls);
  }, [camera, controls]);

  useEffect(() => {
    if (!controls) return;
    const dur = first.current ? 1600 : 1100;
    first.current = false;
    const stretch = narrow(camera) ? 1.75 : 1;
    if (view === 'bench') {
      rig.flyTo(benchPosition(camera, EXHIBITS[index ?? 0].width), BENCH_TARGET.clone(), dur);
    } else if (index === null) {
      const t = HOME.target.clone();
      rig.flyTo(HOME.position.clone().sub(t).multiplyScalar(stretch).add(t), t, dur);
    } else {
      const f = points[index];
      rig.flyTo(f.target.clone().addScaledVector(f.dir, f.dist * stretch), f.target.clone(), dur);
    }
  }, [view, index, controls, camera, points, aspect]);

  useFrame(() => rig.update());
  return null;
}

/** On phones the panel covers the lower screen, so lift the scene into the gap above it. */
function PhoneOffset() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  useEffect(() => {
    if (width / height < 0.8) camera.setViewOffset(width, height, 0, height * 0.1, width, height);
    else camera.clearViewOffset();
  }, [camera, width, height]);
  return null;
}

/** New apparatus rise out of the plinth. */
function Bench() {
  const index = useLab((s) => s.index) ?? 0;
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useEffect(() => {
    t.current = 0;
  }, [index]);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / 0.7);
    const e = 1 - (1 - t.current) ** 3;
    if (ref.current) {
      ref.current.position.y = -0.35 * (1 - e);
      ref.current.scale.setScalar(0.9 + 0.1 * e);
    }
  });
  const { Scene } = EXHIBITS[index];
  return (
    <group ref={ref}>
      <Suspense fallback={null}>
        <Scene key={index} />
      </Suspense>
    </group>
  );
}

function Controls() {
  const bench = useLab((s) => s.view === 'bench');
  return bench ? (
    <OrbitControls
      key="bench"
      makeDefault
      target={BENCH_TARGET}
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      minDistance={1.6}
      maxDistance={11}
      minPolarAngle={0.9}
      maxPolarAngle={1.62}
      minAzimuthAngle={-1.1}
      maxAzimuthAngle={1.1}
      rotateSpeed={0.6}
    />
  ) : (
    <OrbitControls
      key="body"
      makeDefault
      target={HOME.target}
      enableDamping
      dampingFactor={0.06}
      minDistance={0.25}
      maxDistance={8}
      maxPolarAngle={1.68}
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      screenSpacePanning
    />
  );
}

export function Viewer() {
  const bench = useLab((s) => s.view === 'bench');
  return (
    <Canvas
      className="lab-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 34, near: 0.02, far: 40, position: [1.6, 1.8, 5.2] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      onPointerMissed={(e) => e.type === 'click' && useLab.getState().select(null)}
    >
      <Room lite={LITE} bench={bench} />
      {!bench && <directionalLight position={[1.5, 3, 3]} intensity={1.4} color="#fff3e6" />}
      {!bench && <directionalLight position={[-2, 2, -2.5]} intensity={0.5} color="#9fc4d8" />}
      <Suspense fallback={null}>
        <Body />
        <Director />
      </Suspense>
      {bench && <Bench />}
      <RacePlayer />
      <Controls />
      <PhoneOffset />
      {!LITE && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
