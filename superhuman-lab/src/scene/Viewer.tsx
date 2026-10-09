import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useLab } from '../state/store';
import type { AtlasManifest } from '../types';
import { Body } from './Body';
import { HOME, rig } from './rig';

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const autoRotate = useLab((s) => s.autoRotate);
  useEffect(() => {
    if (!controls) return;
    rig.attach(camera, controls);
    if (window.innerWidth < 720) {
      HOME.position.multiplyScalar(2.1);
      HOME.target.set(0, 0.2, 0);
    }
    camera.position.copy(HOME.position).multiplyScalar(1.08);
    controls.target.copy(HOME.target);
    controls.update();
    rig.home(1500);
    const stop = () => useLab.getState().autoRotate && useLab.setState({ autoRotate: false });
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
      className="lab-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 30, near: 0.02, far: 60, position: [1.6, 1.3, 5] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
      onPointerMissed={(e) => e.type === 'click' && useLab.getState().selectGene(null)}
    >
      <color attach="background" args={['#F3F3F1']} />
      <hemisphereLight args={['#ffffff', '#cfc8bd', 0.8]} />
      <directionalLight position={[1.6, 3.2, 3]} intensity={1.1} />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={0.35} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
      </Environment>
      <Suspense fallback={null}>{manifest && <Body manifest={manifest} />}</Suspense>
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.5} maxDistance={12} autoRotateSpeed={0.6} rotateSpeed={0.7} zoomSpeed={0.8} />
      <Rig />
    </Canvas>
  );
}
