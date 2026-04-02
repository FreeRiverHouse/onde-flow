'use client'

// === FILE: src/app/emilio/components/EmilioCharacter.tsx ===
// HoloEmilio — geometric holographic avatar, no GLB

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface EmilioCharacterProps {
  emotion?: 'neutral' | 'excited' | 'thinking' | 'proud' | 'focused' | 'relaxed' | 'happy'
  onSpeaking?: boolean
}

// ─── Orbiting particles ────────────────────────────────────────────────────────
function OrbitParticles({ count = 50, radius = 1.1, color = '#00f5ff' }: { count?: number; radius?: number; color?: string }) {
  const pointsRef = useRef<THREE.Points>(null)

  const { geometry, offsets } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const offs = new Float32Array(count) // phase offset per particle

    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3 + 0] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = radius * Math.cos(phi)
      offs[i] = Math.random() * Math.PI * 2
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: geo, offsets: offs }
  }, [count, radius])

  const material = useMemo(() => new THREE.PointsMaterial({
    color,
    size: 0.035,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [color])

  useFrame((state) => {
    if (!pointsRef.current) return
    const t = state.clock.elapsedTime
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute

    for (let i = 0; i < count; i++) {
      const phase = offsets[i]
      const theta = (i / count) * Math.PI * 2 + t * 0.4
      const phi = Math.acos(2 * Math.sin(t * 0.15 + phase) * 0.5)
      const r = radius + Math.sin(t * 0.8 + phase) * 0.12
      posAttr.setXYZ(
        i,
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      )
    }
    posAttr.needsUpdate = true
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}

// ─── Main holographic avatar ───────────────────────────────────────────────────
export default function EmilioCharacter({
  emotion = 'neutral',
  onSpeaking = false,
}: EmilioCharacterProps) {
  const groupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)
  const innerGlowRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime

    if (!groupRef.current) return

    // --- Group-level motion based on emotion ---
    switch (emotion) {
      case 'excited': {
        // Fast pulsing scale, quick ring spin
        const pulse = 1 + Math.sin(t * 8) * 0.06
        groupRef.current.scale.setScalar(pulse)
        if (ring1Ref.current) ring1Ref.current.rotation.x += 0.04
        if (ring2Ref.current) ring2Ref.current.rotation.y += 0.05
        groupRef.current.position.y = Math.sin(t * 5) * 0.06
        break
      }
      case 'thinking': {
        // Slow rotation, gentle float
        groupRef.current.rotation.y = Math.sin(t * 0.6) * 0.3
        groupRef.current.position.y = Math.sin(t * 1.0) * 0.03
        if (ring1Ref.current) ring1Ref.current.rotation.x += 0.008
        if (ring2Ref.current) ring2Ref.current.rotation.y += 0.006
        break
      }
      case 'happy':
      case 'proud': {
        const bounce = Math.abs(Math.sin(t * 3)) * 0.05
        groupRef.current.position.y = bounce
        groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.25
        if (ring1Ref.current) ring1Ref.current.rotation.x += 0.02
        if (ring2Ref.current) ring2Ref.current.rotation.y += 0.025
        break
      }
      case 'focused': {
        groupRef.current.position.y = Math.sin(t * 1.5) * 0.015
        if (ring1Ref.current) ring1Ref.current.rotation.x += 0.015
        if (ring2Ref.current) ring2Ref.current.rotation.y += 0.02
        break
      }
      default: {
        // Neutral — slow idle breath
        groupRef.current.position.y = Math.sin(t * 1.0) * 0.025
        groupRef.current.rotation.y = Math.sin(t * 0.4) * 0.08
        if (ring1Ref.current) ring1Ref.current.rotation.x += 0.01
        if (ring2Ref.current) ring2Ref.current.rotation.y += 0.008
      }
    }

    // --- Core pulse (speaking or idle breath) ---
    if (coreRef.current) {
      let coreScale: number
      if (onSpeaking) {
        // Rhythmic speaking pulse
        coreScale = 1 + Math.abs(Math.sin(t * 6)) * 0.18
      } else {
        coreScale = 1 + Math.sin(t * 1.5) * 0.04
      }
      coreRef.current.scale.setScalar(coreScale)
    }

    // Inner glow pulse
    if (innerGlowRef.current) {
      const mat = innerGlowRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.6 + Math.sin(t * 2.0) * 0.4
    }
  })

  // Emotion-driven color accents
  const coreColor = emotion === 'excited' ? '#f59e0b' : emotion === 'thinking' ? '#7c3aed' : '#00f5ff'
  const ring1Color = '#00f5ff'
  const ring2Color = '#7c3aed'

  return (
    <group ref={groupRef} position={[0, 0.2, 0]}>
      {/* Inner glow sphere */}
      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={0.8}
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Core: icosahedron wireframe */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.28, 1]} />
        <meshBasicMaterial
          color={coreColor}
          wireframe
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Ring 1 — rotates on X axis, cyan */}
      <mesh ref={ring1Ref} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.62, 0.018, 8, 64]} />
        <meshStandardMaterial
          color={ring1Color}
          emissive={ring1Color}
          emissiveIntensity={1.0}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Ring 2 — rotates on Y axis, purple, larger */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.88, 0.014, 8, 64]} />
        <meshStandardMaterial
          color={ring2Color}
          emissive={ring2Color}
          emissiveIntensity={0.9}
          transparent
          opacity={0.75}
        />
      </mesh>

      {/* Orbiting particle cloud */}
      <OrbitParticles count={50} radius={1.05} color="#00f5ff" />
    </group>
  )
}
