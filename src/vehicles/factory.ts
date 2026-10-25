import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import type { VehicleSpec } from '../config/vehicles'
import { buildCar, type CarRig } from './models'
import { buildBoxVehicle, buildTwoWheeler } from './models-extra'

const bandMat = new MeshStandardMaterial({ color: '#12254d', metalness: 0.3, roughness: 0.5 })
const bandGeo = new BoxGeometry(0.02, 0.22, 2.2)

/** Builds the right procedural model for a spec's body type. */
export function makeRig(spec: VehicleSpec, color: string, riderColor?: string): CarRig {
  switch (spec.body) {
    case 'van':
    case 'bus':
      return buildBoxVehicle(spec, spec.body, color)
    case 'moto':
    case 'bicycle':
      return buildTwoWheeler(spec, spec.body, color, riderColor)
    case 'police': {
      const rig = buildCar(spec, 'sedan', '#f4f6fa', { policeLights: true })
      for (const sx of [-1, 1]) {
        const m = new Mesh(bandGeo, bandMat)
        m.position.set(sx * (spec.width / 2 + 0.005), spec.height * 0.36, 0.1)
        rig.body.add(m)
      }
      return rig
    }
    default:
      return buildCar(spec, spec.body as 'hatch' | 'sedan' | 'coupe' | 'suv', color)
  }
}

/** Applies the animation state of a physics body to its rig. */
export function poseRig(rig: CarRig, b: { x: number; z: number; heading: number; pitch: number; roll: number; wheelSpin: number; steerAngle: number; braking: boolean; reversing: boolean }, night: number, lightsOn: boolean) {
  rig.root.position.set(b.x, 0, b.z)
  rig.root.rotation.y = b.heading
  const two = rig.kind === 'moto' || rig.kind === 'bicycle'
  rig.body.rotation.x = b.pitch
  rig.body.rotation.z = two ? -b.roll * 3.2 : -b.roll
  for (let i = 0; i < rig.wheels.length; i++) rig.wheels[i].rotation.x = b.wheelSpin
  for (let i = 0; i < rig.steerPivots.length; i++) rig.steerPivots[i].rotation.y = -b.steerAngle
  if (rig.cranks) rig.cranks.rotation.x = b.wheelSpin * 0.9
  if (rig.tailMat) rig.tailMat.emissiveIntensity = b.braking ? 2.4 : lightsOn ? 0.8 + night * 0.4 : b.reversing ? 0.4 : 0.12
  if (rig.headMat) rig.headMat.emissiveIntensity = lightsOn ? 1.8 + night : 0.08
}
