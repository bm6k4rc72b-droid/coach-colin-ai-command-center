import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useBrain } from '../state/store';
import type { AtlasManifest } from '../types';
import { Brain } from './Brain';
import { HOME, rig } from './rig';

const BG = '#F3F3F1';

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const autoRotate = useBrain((s) => s.autoRotate);
  useEffect(() => {
    if (!controls) return;
    rig.attach(camera, controls);
    // On narrow screens the brain sits higher, above the bottom sheet.
    if (window.innerWidth < 720) {
      HOME.position.multiplyScalar(1.9);
      HOME.target.set(0, -0.045, 0);
    }
    camera.position.copy(HOME.position).multiplyScalar(1.12);
    controls.target.copy(HOME.target);
    controls.update();
    rig.home(1500);
    const stop = () => useBrain.getState().autoRotate && useBrain.setState({ autoRotate: false });
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [camera, controls]);
  useEffect(() => {
    if (controls) controls.autoRotate = autoRotate;
  }, [controls, autoRotate]);
  useFrame(() => rig.update());
  return null;
}

export function Viewer({ manifest }: { manifest: AtlasManifest | null }) {
  return (
    <Canvas
      className="brain-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 0.005, far: 20, position: [0.3, 0.1, 0.5] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      onPointerMissed={(e) => e.type === 'click' && useBrain.getState().selectRegion(null)}
    >
      <color attach="background" args={[BG]} />
      <hemisphereLight args={['#ffffff', '#d8d0c4', 0.85]} />
      <directionalLight position={[1.5, 2.5, 2]} intensity={1.0} />
      <directionalLight position={[-2, 0.5, -1.5]} intensity={0.35} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.5} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[-4, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
      </Environment>
      <Suspense fallback={null}>{manifest && <Brain manifest={manifest} />}</Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={0.12}
        maxDistance={1.6}
        autoRotateSpeed={0.5}
        zoomSpeed={0.8}
        rotateSpeed={0.7}
      />
      <Rig />
    </Canvas>
  );
}
