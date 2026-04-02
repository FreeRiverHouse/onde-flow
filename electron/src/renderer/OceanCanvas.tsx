'use client';

// === FILE: src/app/emilio/OceanCanvas.tsx ===
// HoloCanvas — holographic dark void, VR-ready PerspectiveCamera

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import dynamic from 'next/dynamic';

const HoloEnvironment = dynamic(() => import('./components/SceneEnvironment'), { ssr: false });
const HoloEmilio = dynamic(() => import('./components/EmilioCharacter'), { ssr: false });

interface OceanCanvasProps {
  emotion: string;
}

export default function OceanCanvas({ emotion }: OceanCanvasProps) {
  const safeEmotion = (
    ['neutral', 'excited', 'thinking', 'proud', 'focused', 'relaxed', 'happy'].includes(emotion)
      ? emotion
      : 'neutral'
  ) as 'neutral' | 'excited' | 'thinking' | 'proud' | 'focused' | 'relaxed' | 'happy';

  return (
    <Canvas
      style={{ width: '100%', height: '100%', background: '#000008' }}
      gl={{ antialias: true, alpha: false }}
      shadows={false}
    >
      {/* Deep space fog */}
      <fog attach="fog" args={['#000008', 12, 40]} />

      {/* Minimal ambient — neon lights do the work */}
      <ambientLight intensity={0.08} color="#000020" />

      {/* Neon point lights */}
      <pointLight position={[-4, 3, 2]} intensity={2.0} color="#00f5ff" distance={20} decay={2} />
      <pointLight position={[4, 1, -1]} intensity={1.5} color="#7c3aed" distance={18} decay={2} />
      <pointLight position={[0, -2, 3]} intensity={1.0} color="#f59e0b" distance={12} decay={2} />

      {/* VR-ready perspective camera */}
      <PerspectiveCamera makeDefault fov={75} position={[0, 1.5, 5]} near={0.1} far={100} />

      <Suspense fallback={null}>
        <HoloEnvironment />
        <HoloEmilio emotion={safeEmotion} />
      </Suspense>

      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.6} intensity={1.5} />
        <Vignette eskil={false} offset={0.2} darkness={0.8} />
      </EffectComposer>
    </Canvas>
  );
}
