import { Suspense, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

// Lazy import components for Electron renderer
const SceneEnvironment = lazy(() => import('./components/SceneEnvironment'));
const EmilioCharacter = lazy(() => import('./components/EmilioCharacter'));

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
      style={{ width: '100%', height: '100%', background: '#02020c' }}
      gl={{ antialias: true, alpha: false }}
      shadows={false}
    >
      {/* Sky fog (Mediterranean) */}
      <fog attach="fog" args={['#0a0a1a', 15, 35]} />

      {/* Ambient light */}
      <ambientLight intensity={0.3} color={#ff9966} />

      {/* Warm point lights */}
      <pointLight position={[-4, 3, 2]} intensity={1.2} color={#ffcc44} distance={20} decay={2} />
      <pointLight position={[4, 1, -1]} intensity={0.8} color={#ff8844} distance={18} decay={2} />
      <pointLight position={[0, -2, 3]} intensity={0.5} color={#00d4ff} distance={12} decay={2} />

      {/* Perspective camera - user can look around */}
      <PerspectiveCamera makeDefault fov={60} position={[0, 1.5, 6]} near={0.1} far={100} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI * 0.3}
        maxPolarAngle={Math.PI * 0.7}
        minAzimuthAngle={-Math.PI * 0.4}
        maxAzimuthAngle={Math.PI * 0.4}
      />

      <Suspense fallback={null}>
        <SceneEnvironment />
        <EmilioCharacter emotion={safeEmotion} />
      </Suspense>

      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.8} intensity={0.8} />
        <Vignette eskil={false} offset={0.15} darkness={0.6} />
      </EffectComposer>
    </Canvas>
  );
}
