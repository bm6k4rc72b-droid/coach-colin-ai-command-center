import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BACKGROUND } from '../data/systems';
import { useAtlas } from '../state/store';
import { Anatomy } from './Anatomy';
import { rig } from './cameraRig';
import { homePose, LAYER_PASSIVE } from './engine';

const isSmall = () => window.innerWidth < 720;
// Ambient occlusion is on for desktop-sized screens; `?ao=0` turns it off.
const aoEnabled = () => !isSmall() && new URLSearchParams(window.location.search).get('ao') !== '0';

/** Keeps the camera rig wired to the live camera + controls and the active tool. */
function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const tool = useAtlas((s) => s.tool);
  const ready = useAtlas((s) => !!s.manifest);
  const framed = useRef(false);

  useEffect(() => {
    camera.layers.enable(LAYER_PASSIVE);
  }, [camera]);

  useEffect(() => {
    if (!controls) return;
    rig.attach(camera, controls);
    rig.focusInsets = () =>
      isSmall()
        ? { left: 0, right: 48, top: 130, bottom: Math.min(window.innerHeight * 0.56, 480) }
        : { left: 236, right: 396, top: 40, bottom: 150 };
    const onResize = () => {
      rig.insetX = isSmall() ? 0 : 2 * 236;
      rig.insetTop = isSmall() ? 140 : 40;
      rig.insetBottom = isSmall() ? 150 : 170;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      rig.detach();
    };
  }, [camera, controls]);

  // First framing: start a touch further out and settle in. Nothing dramatic.
  useEffect(() => {
    if (!controls || !ready || framed.current) return;
    framed.current = true;
    const home = homePose();
    const start = home.position.clone().sub(home.target).multiplyScalar(1.08).add(home.target);
    camera.position.copy(start);
    controls.target.copy(home.target);
    controls.update();
    rig.flyTo(home, 1400);
  }, [camera, controls, ready]);

  useEffect(() => {
    if (!controls) return;
    const left = tool === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons = { LEFT: left, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: tool === 'pan' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    controls.touches = { ONE: tool === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }, [controls, tool]);

  return null;
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc8bd', 0.75]} />
      <directionalLight position={[1.6, 3.2, 3]} intensity={1.15} />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={0.35} />
      {/* Soft studio reflections from a few large area lights; rendered once. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 3, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[4, 1, -1]} rotation-y={-Math.PI / 2} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={0.4} position={[0, -2, 0]} rotation-x={-Math.PI / 2} scale={[6, 6, 1]} color="#efe8dc" />
      </Environment>
    </>
  );
}

export function Viewer() {
  const small = isSmall();
  return (
    <Canvas
      className="atlas-canvas"
      dpr={[1, small ? 1.5 : 1.75]}
      camera={{ fov: 30, near: 0.01, far: 200, position: [0, 0.9, 5] }}
      gl={{ antialias: true, toneMapping: THREE.NoToneMapping, powerPreference: 'high-performance' }}
      onPointerMissed={(e) => {
        // A click on empty space clears the selection (unless isolating).
        const st = useAtlas.getState();
        if (e.type === 'click' && !st.isolated && !rig.busy) st.select(null);
      }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <Lights />
      <Anatomy />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={0.06}
        maxDistance={22}
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        panSpeed={0.8}
        screenSpacePanning
      />
      <Rig />
      {aoEnabled() && (
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <N8AO halfRes quality="performance" aoRadius={0.05} distanceFalloff={0.6} intensity={1.6} color="#2b2620" />
        </EffectComposer>
      )}
    </Canvas>
  );
}
