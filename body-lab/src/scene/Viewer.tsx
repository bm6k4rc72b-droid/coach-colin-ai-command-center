import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { EXHIBITS } from '../exhibits';
import { ATLAS, loadManifest } from '../lib/atlas';
import { useLab } from '../state/store';
import { Room } from './Room';

const LITE = new URLSearchParams(location.search).has('lite');

// Start fetching every model up front, so switching exhibits never waits.
loadManifest();
for (const s of ['heart', 'respiratory', 'skeleton', 'nervous']) useGLTF.preload(`${ATLAS}${s}.glb`, false, true);

const TARGET = new THREE.Vector3(0, 1.32, 0);

/** Front view of the plinth; on narrow screens, pulled back until the exhibit fits across. */
function homePosition(camera: THREE.PerspectiveCamera, width: number) {
  let dist = 4.3;
  if (camera.aspect < 0.8) {
    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    dist = Math.max(4.6, (width / 2 / Math.tan(halfFov)) * 1.08);
  }
  return new THREE.Vector3(0, TARGET.y + 0.11 * dist, dist);
}

/** Glides the camera back to the front of the plinth whenever the exhibit changes. */
function CameraHome() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const aspect = useThree((s) => s.size.width / s.size.height);
  const index = useLab((s) => s.index);
  const homing = useRef(1);
  useEffect(() => {
    homing.current = 1;
  }, [aspect]);
  useEffect(() => {
    homing.current = 1;
  }, [index]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => (homing.current = 0);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  useFrame((_, dt) => {
    if (!controls || homing.current <= 0) return;
    const k = 1 - Math.exp(-dt * 4);
    camera.position.lerp(homePosition(camera, EXHIBITS[useLab.getState().index].width), k);
    controls.target.lerp(TARGET, k);
    controls.update();
    homing.current -= dt / 1.5;
  });
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

/** New exhibits rise out of the plinth. */
function Stage() {
  const index = useLab((s) => s.index);
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

export function Viewer() {
  return (
    <Canvas
      className="lab-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 34, near: 0.05, far: 40, position: [0, 1.9, 5.6] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
    >
      <Room lite={LITE} />
      <Stage />
      <OrbitControls
        makeDefault
        target={TARGET}
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
      <CameraHome />
      <PhoneOffset />
      {!LITE && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.9} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
