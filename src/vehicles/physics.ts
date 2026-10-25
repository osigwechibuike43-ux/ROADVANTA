import type { VehicleSpec } from '../config/vehicles'
import { clamp } from '../core/math'

export interface ControlInput {
  throttle: number // 0..1
  brake: number // 0..1 (also reverse when stopped)
  steer: number // -1 (left) .. 1 (right)
  handbrake: boolean
}
export const newInput = (): ControlInput => ({ throttle: 0, brake: 0, steer: 0, handbrake: false })

export interface VehicleBody {
  id: number
  spec: VehicleSpec
  x: number; z: number
  heading: number // yaw, forward = (sin h, cos h)
  vx: number; vz: number
  yawRate: number
  steerIn: number // smoothed steer input -1..1
  steerAngle: number // front wheel angle in rad (for visuals)
  speed: number // signed forward speed m/s
  latSpeed: number
  gear: number // -1 reverse, 0 neutral, 1..6
  rpm: number // 0..1
  pitch: number; roll: number; pitchVel: number; rollVel: number
  aLong: number; aLat: number
  wheelSpin: number
  braking: boolean
  reversing: boolean
  handbrake: boolean
  slip: number // 0..1 tyre slip, for audio/skid marks
  mass: number; inertia: number
  hx: number; hz: number // half extents (width/2, length/2)
  lastImpact: number // impulse magnitude of latest collision
  lastImpactAt: number // sim time
  distance: number // metres travelled
  /** latest applied input, kept for lights/audio */
  input: ControlInput
}

let nextId = 1
export function createBody(spec: VehicleSpec, x = 0, z = 0, heading = 0): VehicleBody {
  return {
    id: nextId++, spec, x, z, heading, vx: 0, vz: 0, yawRate: 0, steerIn: 0, steerAngle: 0, speed: 0, latSpeed: 0,
    gear: 0, rpm: 0.15, pitch: 0, roll: 0, pitchVel: 0, rollVel: 0, aLong: 0, aLat: 0, wheelSpin: 0,
    braking: false, reversing: false, handbrake: false, slip: 0, mass: spec.mass,
    inertia: (spec.mass * (spec.length ** 2 + spec.width ** 2)) / 12,
    hx: spec.width / 2, hz: spec.length / 2, lastImpact: 0, lastImpactAt: -10, distance: 0, input: newInput(),
  }
}

export function resetBody(b: VehicleBody, x: number, z: number, heading: number) {
  b.x = x; b.z = z; b.heading = heading
  b.vx = b.vz = b.yawRate = b.steerIn = b.steerAngle = b.speed = b.latSpeed = 0
  b.pitch = b.roll = b.pitchVel = b.rollVel = b.aLong = b.aLat = b.slip = 0
  b.gear = 0; b.rpm = 0.15; b.braking = b.reversing = b.handbrake = false
}

export function setSpec(b: VehicleBody, spec: VehicleSpec) {
  b.spec = spec
  b.mass = spec.mass
  b.inertia = (spec.mass * (spec.length ** 2 + spec.width ** 2)) / 12
  b.hx = spec.width / 2
  b.hz = spec.length / 2
}

const G = 9.81
const SHIFT = [0.1, 0.22, 0.38, 0.56, 0.77]

/** Fraction of full steering lock that is usable at a given speed (keeps full input at the grip limit). */
export function steerAuthority(s: VehicleSpec, speed: number) {
  const mu = 0.6 + 0.05 * s.grip
  return clamp((1.25 * mu * G * s.wheelBase) / (Math.max(Math.abs(speed), 1) ** 2 * s.steerLock), 0.07, 1)
}

/** Simplified-but-stable bicycle model: kinematic yaw target + grip-limited lateral force. */
export function stepVehicle(b: VehicleBody, inp: ControlInput, dt: number) {
  const s = b.spec
  b.input = inp
  const sinH = Math.sin(b.heading), cosH = Math.cos(b.heading)
  let vf = b.vx * sinH + b.vz * cosH
  let vl = b.vx * -cosH + b.vz * sinH // rightward velocity (right vector = (-cos, sin))

  const mu = 0.6 + 0.05 * s.grip
  const aMax = mu * G
  const av = Math.abs(vf)

  // ---- steering ---------------------------------------------------------
  const target = clamp(inp.steer, -1, 1)
  const rate = Math.abs(target) < Math.abs(b.steerIn) || target * b.steerIn < 0 ? 11 : 6.5
  b.steerIn += (target - b.steerIn) * Math.min(1, rate * dt)
  const authority = clamp((1.25 * aMax * s.wheelBase) / (Math.max(av, 1) ** 2 * s.steerLock), 0.07, 1)
  const delta = b.steerIn * s.steerLock * authority
  b.steerAngle += (b.steerIn * s.steerLock * Math.max(authority, 0.25) - b.steerAngle) * Math.min(1, 14 * dt)

  // ---- longitudinal -------------------------------------------------------
  let aDrive = 0
  const ratio = Math.min(1.2, av / s.maxSpeed)
  const holdingBrakeAsReverse = inp.brake > 0.05 && vf < 0.6 && inp.throttle < 0.05
  b.reversing = holdingBrakeAsReverse || vf < -0.5
  b.braking = (inp.brake > 0.05 && vf > 0.6) || (inp.throttle > 0.05 && vf < -0.6) || inp.handbrake
  if (inp.throttle > 0.02 && vf > -0.6) {
    const power = Math.max(0, 1 - Math.pow(Math.max(0, vf) / s.maxSpeed, 2.4))
    aDrive = Math.min((s.engineForce * inp.throttle * power) / s.mass, mu * G * 0.9)
  } else if (holdingBrakeAsReverse) {
    const power = Math.max(0, 1 - Math.pow(Math.max(0, -vf) / s.maxReverse, 2))
    aDrive = -Math.min((s.engineForce * 0.5 * inp.brake * power) / s.mass, mu * G * 0.5)
  }
  let aBrake = 0
  if (inp.brake > 0.05 && vf >= 0.6) aBrake = Math.min((s.brakeForce * inp.brake) / s.mass, aMax * 0.97)
  else if (inp.throttle > 0.05 && vf <= -0.6) aBrake = Math.min((s.brakeForce * 0.6) / s.mass, aMax * 0.8)
  if (inp.handbrake) aBrake += 6 + Math.min(av, 8) * 0.3

  const noPower = Math.abs(aDrive) < 0.01
  const drag = (s.drag * vf * av) / s.mass
  const rolling = av > 0.05 ? 0.2 * Math.sign(vf) : 0
  const engBrake = noPower && av > 0.05 ? (0.7 + av * 0.015) * Math.sign(vf) : 0
  const brakeDir = Math.sign(vf)
  let aLongTotal = aDrive - drag - rolling - engBrake - brakeDir * aBrake
  const vfNext = vf + aLongTotal * dt
  // braking / resistance must never reverse the direction of motion
  if (vf !== 0 && Math.sign(vfNext) !== Math.sign(vf) && Math.abs(aDrive) < 0.05) {
    vf = 0
    aLongTotal = -b.speed / dt
  } else vf = vfNext
  if (noPower && inp.brake < 0.05 && Math.abs(vf) < 0.12) vf = 0

  // ---- yaw ----------------------------------------------------------------
  const hb = inp.handbrake && av > 3
  // positive steer = right turn = heading decreases (right vector is (-cos h, sin h))
  let yawTarget = -(vf * Math.tan(delta)) / s.wheelBase
  const wMax = ((hb ? 2.1 : 1.05) * aMax) / Math.max(av, 2.5)
  yawTarget = clamp(yawTarget, -wMax, wMax)
  if (hb) yawTarget *= 1.35
  yawTarget /= 1 + Math.abs(vl) * 0.05
  b.yawRate += (yawTarget - b.yawRate) * Math.min(1, (hb ? 4 : 9) * dt)
  b.heading += b.yawRate * dt
  // rotate velocity into new frame so a turning car carries slip angle
  const sinN = Math.sin(b.heading), cosN = Math.cos(b.heading)
  const vwx = vf * sinH + vl * -cosH, vwz = vf * cosH + vl * sinH
  vf = vwx * sinN + vwz * cosN
  vl = vwx * -cosN + vwz * sinN

  // ---- lateral grip ---------------------------------------------------------
  const longUse = Math.abs(aDrive) + aBrake * 0.7
  let latCap = Math.sqrt(Math.max(0.04, aMax * aMax - longUse * longUse * 0.55))
  if (hb) latCap *= 0.28
  const gripRate = s.grip * (hb ? 0.4 : 1)
  const wantDv = -vl * (1 - Math.exp(-gripRate * dt))
  const dv = clamp(wantDv, -latCap * dt, latCap * dt)
  const saturated = Math.abs(wantDv) > latCap * dt * 1.02
  vl += dv
  b.aLat += (dv / dt - b.aLat) * Math.min(1, 10 * dt)
  b.aLong += (aLongTotal - b.aLong) * Math.min(1, 10 * dt)

  b.vx = vf * sinN + vl * -cosN
  b.vz = vf * cosN + vl * sinN
  b.x += b.vx * dt
  b.z += b.vz * dt
  b.speed = vf
  b.latSpeed = vl
  b.distance += Math.hypot(b.vx, b.vz) * dt
  b.handbrake = inp.handbrake

  // ---- slip for audio / skid marks ---------------------------------------
  const launch = aDrive > mu * G * 0.8 && av < 8 ? 0.6 : 0
  const slipT = clamp(Math.abs(vl) / 5 + (saturated ? 0.35 : 0) + (hb ? 0.4 : 0) + launch + (b.braking && aBrake > aMax * 0.9 ? 0.5 : 0), 0, 1)
  b.slip += (slipT - b.slip) * Math.min(1, 12 * dt)

  // ---- wheel + engine state --------------------------------------------------
  b.wheelSpin += (vf / s.wheelRadius) * dt
  const sr = Math.abs(vf) / s.maxSpeed
  if (vf < -0.5) b.gear = -1
  else if (sr < 0.01 && inp.throttle < 0.05) b.gear = 0
  else {
    let g = 1
    while (g <= 5 && sr > SHIFT[g - 1]) g++
    b.gear = g
  }
  if (b.gear >= 1) {
    const lo = b.gear === 1 ? 0 : SHIFT[b.gear - 2], hi = b.gear === 6 ? 1 : SHIFT[b.gear - 1]
    b.rpm = 0.3 + 0.7 * clamp((sr - lo) / (hi - lo), 0, 1) + inp.throttle * 0.03
  } else if (b.gear === -1) b.rpm = 0.25 + clamp(Math.abs(vf) / s.maxReverse, 0, 1) * 0.5
  else b.rpm = 0.15 + inp.throttle * 0.55
  b.rpm = clamp(b.rpm, 0.1, 1)
  void ratio

  // ---- suspension (body pitch / roll spring-damper) ----------------------
  const pT = clamp(-b.aLong * 0.0075, -0.07, 0.07)
  const rT = clamp(b.aLat * 0.0085 * (s.height > 1.6 ? 1.3 : 1), -0.09, 0.09)
  b.pitchVel += (180 * (pT - b.pitch) - 17 * b.pitchVel) * dt
  b.rollVel += (190 * (rT - b.roll) - 18 * b.rollVel) * dt
  b.pitch += b.pitchVel * dt
  b.roll += b.rollVel * dt
}
