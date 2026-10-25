import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { AI_SPECS, VEHICLES } from '../config/vehicles'
import { rt } from '../core/runtime'
import { makeRig, poseRig } from '../vehicles/factory'
import { Sky } from '../world/Sky'
import { World } from '../world/World'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? parseFloat(q.get(k)!) : d)

function Cars() {
  const rigs = useMemo(() => {
    const specs = [...VEHICLES, AI_SPECS.van, AI_SPECS.bus, AI_SPECS.police, AI_SPECS.bicycle]
    return specs.map((s, i) => {
      const rig = makeRig(s, s.defaultColor, '#c53030')
      rig.root.position.set(num('cx', 3) + (i % 5) * 7, 0, num('cz', 3) + Math.floor(i / 5) * 9)
      return rig
    })
  }, [])
  useFrame(() => rigs.forEach((r, i) => poseRig(r, { x: r.root.position.x, z: r.root.position.z, heading: num('ch', 0.6), pitch: 0, roll: 0, wheelSpin: 0, steerAngle: 0, braking: false, reversing: false }, rt.night, rt.night > 0.3)))
  return <>{rigs.map((r, i) => <primitive key={i} object={r.root} />)}</>
}

function Rig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(num('x', 20), num('y', 12), num('z', 40))
    camera.lookAt(num('lx', 0), num('ly', 2), num('lz', 0))
  }, [camera])
  return null
}

export default function Preview() {
  rt.timeOfDay = num('t', 0.42)
  return (
    <Canvas shadows dpr={1} camera={{ fov: num('fov', 55), near: 0.2, far: 2000 }} gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }} style={{ position: 'fixed', inset: 0 }}>
      <Rig />
      <Sky />
      {!q.has('bare') && <World />}
      {q.has('bare') && <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#555a60" roughness={0.9} /></mesh>}
      {q.has('cars') && <Cars />}
    </Canvas>
  )
}
