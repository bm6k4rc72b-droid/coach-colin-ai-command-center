// The gallery: a dark room with warm light strips, a glossy floor, a few
// winter trees, and the console plinth every exhibit stands on.
import { useMemo } from 'react';
import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

export const PLINTH_TOP = 0.86;
export const AMBER = new THREE.Color('#FFB35C');
export const CYAN = new THREE.Color('#59D8F0');

/** An emissive colour bright enough to bloom. */
export function glow(color: THREE.ColorRepresentation, intensity = 3) {
  return new THREE.Color(color).multiplyScalar(intensity);
}

function Strip({ x, h = 2.6 }: { x: number; h?: number }) {
  return (
    <mesh position={[x, h / 2 + 0.2, -2.38]}>
      <boxGeometry args={[0.035, h, 0.02]} />
      <meshBasicMaterial color={glow('#FFB35C', 2.4)} toneMapped={false} />
    </mesh>
  );
}

function Tree({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.24, 8]} />
        <meshStandardMaterial color="#3a2a20" roughness={0.9} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.42 + i * 0.26, 0]}>
          <coneGeometry args={[0.36 - i * 0.09, 0.5, 9]} />
          <meshStandardMaterial color={i === 2 ? '#e6eef2' : '#1d3b33'} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Plinth() {
  return (
    <group>
      <RoundedBox args={[2.5, PLINTH_TOP, 1.1]} radius={0.06} smoothness={4} position={[0, PLINTH_TOP / 2, 0]}>
        <meshStandardMaterial color="#20262d" roughness={0.45} metalness={0.25} />
      </RoundedBox>
      {/* Glowing lip and console face */}
      <mesh position={[0, PLINTH_TOP - 0.02, 0.556]}>
        <boxGeometry args={[2.3, 0.012, 0.004]} />
        <meshBasicMaterial color={glow('#FFB35C', 2.2)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.42, 0.553]}>
        <planeGeometry args={[1.9, 0.42]} />
        <meshStandardMaterial color="#141a20" roughness={0.3} metalness={0.4} />
      </mesh>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.42, 0.556]}>
          <ringGeometry args={[0.1, 0.115, 48]} />
          <meshBasicMaterial color={glow('#59D8F0', 1.8)} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0.556]}>
        <planeGeometry args={[0.9, 0.006]} />
        <meshBasicMaterial color={glow('#59D8F0', 1.4)} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Room({ lite = false }: { lite?: boolean }) {
  const strips = useMemo(() => [-3.4, -2.9, 2.9, 3.4], []);
  return (
    <group>
      <color attach="background" args={['#0a0e13']} />
      <fog attach="fog" args={['#0a0e13', 9, 18]} />
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9fb6c8', '#1a1410', 0.35]} />
      <spotLight position={[0, 4.2, 2.2]} angle={0.55} penumbra={0.8} intensity={38} color="#fff1dc" castShadow={false} />
      <pointLight position={[-2.6, 1.6, -1.6]} intensity={6} color="#ffb35c" distance={5} />
      <pointLight position={[2.6, 1.6, -1.6]} intensity={6} color="#ffb35c" distance={5} />
      <pointLight position={[0, 1.4, 2]} intensity={3} color="#59d8f0" distance={4} />

      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        {lite ? (
          <meshStandardMaterial color="#0f1419" roughness={0.4} metalness={0.4} />
        ) : (
        <MeshReflectorMaterial
          resolution={512}
          blur={[300, 80]}
          mixBlur={1}
          mixStrength={1.4}
          roughness={0.85}
          depthScale={0.6}
          minDepthThreshold={0.5}
          maxDepthThreshold={1.2}
          color="#0f1419"
          metalness={0.4}
          mirror={0}
        />
        )}
      </mesh>
      {/* Back wall with light strips */}
      <mesh position={[0, 2, -2.4]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#141b23" roughness={0.9} />
      </mesh>
      {strips.map((x) => (
        <Strip key={x} x={x} />
      ))}
      <mesh position={[0, 3.1, -2.38]}>
        <boxGeometry args={[5.2, 0.02, 0.02]} />
        <meshBasicMaterial color={glow('#FFB35C', 1.6)} toneMapped={false} />
      </mesh>
      <Tree position={[-2.6, 0, -1.2]} s={1.15} />
      <Tree position={[-3.3, 0, -0.4]} s={0.8} />
      <Tree position={[2.9, 0, -1.0]} s={1} />
      <Plinth />
    </group>
  );
}

/** A thin glass case. */
export function Glass({
  args,
  position,
}: {
  args: ConstructorParameters<typeof THREE.CylinderGeometry>;
  position: [number, number, number];
}) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={args} />
      <meshPhysicalMaterial color="#cfe8f2" transparent opacity={0.1} roughness={0.05} metalness={0} clearcoat={1} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
