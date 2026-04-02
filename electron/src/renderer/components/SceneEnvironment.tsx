'use client';

// === FILE: src/app/emilio/components/SceneEnvironment.tsx ===
// HoloEnvironment — holographic dark void scene elements

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Neon grid floor ──────────────────────────────────────────────────────────
function NeonGrid() {
  const gridRef = useRef<THREE.GridHelper>(null);

  useFrame((state) => {
    if (!gridRef.current) return;
    // Slow pulse on grid opacity via color
    const t = state.clock.elapsedTime;
    const pulse = 0.3 + Math.sin(t * 0.5) * 0.1;
    (gridRef.current.material as THREE.LineBasicMaterial).opacity = pulse;
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[80, 80, '#00f5ff', '#00f5ff']}
      position={[0, -2.5, 0]}
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore material is LineBasicMaterial
      material-transparent={true}
      material-opacity={0.3}
    />
  );
}

// ─── Floating particle field ──────────────────────────────────────────────────
function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, alphas } = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const alphasArr = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;
      alphasArr[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, alphas: alphasArr };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    // Drift upward slowly, reset when too high
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, posAttr.getY(i) + 0.003 * (0.5 + alphas[i] * 0.5));
      if (posAttr.getY(i) > 8) {
        posAttr.setY(i, -8);
      }
      // Subtle horizontal drift
      posAttr.setX(i, posAttr.getX(i) + Math.sin(t * 0.2 + i) * 0.001);
    }
    posAttr.needsUpdate = true;
  });

  const material = useMemo(() => new THREE.PointsMaterial({
    color: '#00f5ff',
    size: 0.04,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// ─── Data columns (pulsing vertical cylinders) ────────────────────────────────
function DataColumn({ position, color, phase }: { position: [number, number, number]; color: string; phase: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const pulse = 0.5 + Math.abs(Math.sin(t * 1.2 + phase)) * 0.5;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = pulse;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <cylinderGeometry args={[0.04, 0.04, 8, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

// ─── Scan ring (descending loop) ──────────────────────────────────────────────
function ScanRing() {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ringRef.current) return;
    // Loop from y=6 down to y=-4, then reset
    ringRef.current.position.y -= 0.012;
    if (ringRef.current.position.y < -4) {
      ringRef.current.position.y = 6;
    }
    // Rotate slowly
    ringRef.current.rotation.z = state.clock.elapsedTime * 0.3;
  });

  return (
    <mesh ref={ringRef} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[4, 0.02, 8, 64]} />
      <meshStandardMaterial
        color="#00f5ff"
        emissive="#00f5ff"
        emissiveIntensity={1.2}
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

// ─── Ambient floating lights ──────────────────────────────────────────────────
function AmbientGlows() {
  const light1Ref = useRef<THREE.PointLight>(null);
  const light2Ref = useRef<THREE.PointLight>(null);
  const light3Ref = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (light1Ref.current) {
      light1Ref.current.position.x = Math.sin(t * 0.3) * 6;
      light1Ref.current.position.z = Math.cos(t * 0.25) * 6 - 4;
    }
    if (light2Ref.current) {
      light2Ref.current.position.x = Math.cos(t * 0.2) * 5;
      light2Ref.current.position.z = Math.sin(t * 0.35) * 5 - 4;
    }
    if (light3Ref.current) {
      light3Ref.current.position.y = 1 + Math.sin(t * 0.4) * 2;
    }
  });

  return (
    <>
      <pointLight ref={light1Ref} position={[6, 0, -4]} color="#00f5ff" intensity={1.5} distance={15} decay={2} />
      <pointLight ref={light2Ref} position={[-5, 0, -4]} color="#7c3aed" intensity={1.2} distance={14} decay={2} />
      <pointLight ref={light3Ref} position={[0, 1, 0]} color="#f59e0b" intensity={0.6} distance={10} decay={2} />
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function SceneEnvironment() {
  const columnConfigs: Array<{ position: [number, number, number]; color: string; phase: number }> = [
    { position: [-6, -1, -8],  color: '#00f5ff', phase: 0 },
    { position: [-3, -1, -10], color: '#7c3aed', phase: 1.2 },
    { position: [3,  -1, -10], color: '#00f5ff', phase: 2.4 },
    { position: [6,  -1, -8],  color: '#7c3aed', phase: 0.6 },
    { position: [-8, -1, -6],  color: '#f59e0b', phase: 1.8 },
    { position: [8,  -1, -6],  color: '#f59e0b', phase: 3.0 },
  ];

  return (
    <>
      <NeonGrid />
      <ParticleField />
      {columnConfigs.map((cfg, i) => (
        <DataColumn key={i} position={cfg.position} color={cfg.color} phase={cfg.phase} />
      ))}
      <ScanRing />
      <AmbientGlows />
    </>
  );
}
