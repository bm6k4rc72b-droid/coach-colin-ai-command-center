import { Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useJourney } from '../state/store';
import type { AtlasManifest } from '../types';
import { Journey } from './Journey';
import { HOME, rig } from './rig';

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const autoRotate = useJourney((s) => s.autoRotate);
  useEffect(() => {
    if (!controls) return;
    rig.attach(camera, controls);
    if (window.innerWidth < 720) {
      HOME.position.sub(HOME.target).multiplyScalar(1.9).add(new THREE.Vector3(0, 0.98, 0));
      HOME.target.set(0, 0.98, 0);
    }
    camera.position.copy(HOME.position).sub(HOME.target).multiplyScalar(1.1).add(HOME.target);
    controls.target.copy(HOME.target);
    controls.update();
    rig.home(1500);
    const stop = () => useJourney.getState().autoRotate && useJourney.setState({ autoRotate: false });
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
      camera={{ fov: 30, near: 0.01, far: 40, position: [0.8, 1.4, 2.6] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
    >
      <color attach="background" args={['#F3F3F1']} />
      <hemisphereLight args={['#ffffff', '#cfc8bd', 0.85]} />
      <directionalLight position={[1.6, 3.2, 3]} intensity={1.05} />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={0.35} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
      </Environment>
      <Suspense fallback={null}>{manifest && <Journey manifest={manifest} />}</Suspense>
      <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.25} maxDistance={8} autoRotateSpeed={0.6} rotateSpeed={0.7} zoomSpeed={0.8} />
      <Rig />
    </Canvas>
  );
}
