import { city, collidersNear } from '../world/city'
import type { VehicleBody } from './physics'

/** 2D oriented-box collision (SAT) with impulse resolution for cars vs cars and cars vs world. */

export interface CollisionEvent {
  a: VehicleBody
  b: VehicleBody | null // null => world
  impact: number // closing speed change in m/s
  x: number
  z: number
  kind: string
}

interface Obb { x: number; z: number; ux: number; uz: number; vx: number; vz: number; hx: number; hz: number }
const hit = { nx: 0, nz: 0, depth: 0, px: 0, pz: 0 }

const tmpA: Obb = { x: 0, z: 0, ux: 1, uz: 0, vx: 0, vz: 1, hx: 1, hz: 1 }
const tmpB: Obb = { x: 0, z: 0, ux: 1, uz: 0, vx: 0, vz: 1, hx: 1, hz: 1 }

function setObb(o: Obb, x: number, z: number, rot: number, hx: number, hz: number) {
  const s = Math.sin(rot), c = Math.cos(rot)
  o.x = x; o.z = z; o.ux = c; o.uz = -s; o.vx = s; o.vz = c; o.hx = hx; o.hz = hz
}

function sat(a: Obb, b: Obb): boolean {
  const dx = b.x - a.x, dz = b.z - a.z
  const axes = [a.ux, a.uz, a.vx, a.vz, b.ux, b.uz, b.vx, b.vz]
  let minOv = Infinity, mnx = 0, mnz = 0, minAxis = 0
  for (let i = 0; i < 4; i++) {
    const ax = axes[i * 2], az = axes[i * 2 + 1]
    const ra = a.hx * Math.abs(a.ux * ax + a.uz * az) + a.hz * Math.abs(a.vx * ax + a.vz * az)
    const rb = b.hx * Math.abs(b.ux * ax + b.uz * az) + b.hz * Math.abs(b.vx * ax + b.vz * az)
    const d = dx * ax + dz * az
    const ov = ra + rb - Math.abs(d)
    if (ov <= 0) return false
    if (ov < minOv) {
      minOv = ov
      const sgn = d >= 0 ? 1 : -1
      mnx = ax * sgn; mnz = az * sgn; minAxis = i
    }
  }
  hit.nx = mnx; hit.nz = mnz; hit.depth = minOv
  // contact point: deepest vertex of the box that is *not* the reference face owner
  const owner = minAxis < 2 ? a : b
  const other = minAxis < 2 ? b : a
  const sgnN = minAxis < 2 ? 1 : -1 // direction from owner towards other
  let best = Infinity, bx = other.x, bz = other.z
  for (let sx = -1; sx <= 1; sx += 2)
    for (let sz = -1; sz <= 1; sz += 2) {
      const vx = other.x + other.ux * other.hx * sx + other.vx * other.hz * sz
      const vz = other.z + other.uz * other.hx * sx + other.vz * other.hz * sz
      const proj = ((vx - owner.x) * mnx + (vz - owner.z) * mnz) * sgnN
      if (proj < best) { best = proj; bx = vx; bz = vz }
    }
  hit.px = bx; hit.pz = bz
  return true
}

const events: CollisionEvent[] = []
const near: number[] = []

function applyImpulse(
  A: VehicleBody, B: VehicleBody | null, nx: number, nz: number, px: number, pz: number, e0: number,
): number {
  const rAx = px - A.x, rAz = pz - A.z
  const vAx = A.vx + A.yawRate * rAz, vAz = A.vz - A.yawRate * rAx
  let vBx = 0, vBz = 0, rBx = 0, rBz = 0
  const invMA = 1 / A.mass, invIA = 1 / A.inertia
  let invMB = 0, invIB = 0
  if (B) {
    rBx = px - B.x; rBz = pz - B.z
    vBx = B.vx + B.yawRate * rBz; vBz = B.vz - B.yawRate * rBx
    invMB = 1 / B.mass; invIB = 1 / B.inertia
  }
  const rvx = vBx - vAx, rvz = vBz - vAz // velocity of B relative to A; n points A -> B
  const vn = rvx * nx + rvz * nz
  if (vn > 0) return 0 // separating
  const e = vn > -1.2 ? 0 : e0
  const rAxn = rAz * nx - rAx * nz, rBxn = rBz * nx - rBx * nz
  const denom = invMA + invMB + rAxn * rAxn * invIA + rBxn * rBxn * invIB
  const j = (-(1 + e) * vn) / denom
  A.vx -= j * nx * invMA; A.vz -= j * nz * invMA
  A.yawRate -= (rAz * nx - rAx * nz) * j * invIA
  if (B) {
    B.vx += j * nx * invMB; B.vz += j * nz * invMB
    B.yawRate += (rBz * nx - rBx * nz) * j * invIB
  }
  // friction along the contact tangent
  const tx = -nz, tz = nx
  const rv2x = (B ? B.vx + B.yawRate * rBz : 0) - (A.vx + A.yawRate * rAz)
  const rv2z = (B ? B.vz - B.yawRate * rBx : 0) - (A.vz - A.yawRate * rAx)
  const vt = rv2x * tx + rv2z * tz
  const rAxt = rAz * tx - rAx * tz, rBxt = rBz * tx - rBx * tz
  const denT = invMA + invMB + rAxt * rAxt * invIA + rBxt * rBxt * invIB
  let jt = -vt / denT
  const maxF = 0.35 * j
  jt = Math.max(-maxF, Math.min(maxF, jt))
  A.vx -= jt * tx * invMA; A.vz -= jt * tz * invMA
  A.yawRate -= (rAz * tx - rAx * tz) * jt * invIA
  if (B) {
    B.vx += jt * tx * invMB; B.vz += jt * tz * invMB
    B.yawRate += (rBz * tx - rBx * tz) * jt * invIB
  }
  return j * Math.max(invMA, invMB)
}

function syncSpeeds(b: VehicleBody) {
  const s = Math.sin(b.heading), c = Math.cos(b.heading)
  b.speed = b.vx * s + b.vz * c
  b.latSpeed = b.vx * -c + b.vz * s
}

export function resolveCollisions(bodies: VehicleBody[], now: number): CollisionEvent[] {
  events.length = 0
  const n = bodies.length
  // vehicle vs vehicle
  for (let i = 0; i < n; i++) {
    const A = bodies[i]
    for (let j = i + 1; j < n; j++) {
      const B = bodies[j]
      const dx = B.x - A.x, dz = B.z - A.z
      const rr = A.hz + B.hz + 0.6
      if (dx * dx + dz * dz > rr * rr) continue
      setObb(tmpA, A.x, A.z, A.heading, A.hx, A.hz)
      setObb(tmpB, B.x, B.z, B.heading, B.hx, B.hz)
      if (!sat(tmpA, tmpB)) continue
      const { nx, nz, depth, px, pz } = hit
      const iA = 1 / A.mass, iB = 1 / B.mass
      const tot = iA + iB
      const push = Math.max(0, depth - 0.01) * 0.9
      A.x -= nx * push * (iA / tot); A.z -= nz * push * (iA / tot)
      B.x += nx * push * (iB / tot); B.z += nz * push * (iB / tot)
      const imp = applyImpulse(A, B, nx, nz, px, pz, 0.25)
      syncSpeeds(A); syncSpeeds(B)
      if (imp > 0.4) {
        A.lastImpact = B.lastImpact = imp
        A.lastImpactAt = B.lastImpactAt = now
        events.push({ a: A, b: B, impact: imp, x: px, z: pz, kind: 'vehicle' })
      }
    }
  }
  // vehicle vs world
  for (let i = 0; i < n; i++) {
    const A = bodies[i]
    collidersNear(A.x, A.z, A.hz + 1.5, near)
    for (let k = 0; k < near.length; k++) {
      const col = city.colliders[near[k]]
      const dx = col.x - A.x, dz = col.z - A.z
      const rr = A.hz + Math.hypot(col.hx, col.hz) + 0.2
      if (dx * dx + dz * dz > rr * rr) continue
      setObb(tmpA, A.x, A.z, A.heading, A.hx, A.hz)
      setObb(tmpB, col.x, col.z, col.rot, col.hx, col.hz)
      if (!sat(tmpA, tmpB)) continue
      const { nx, nz, depth, px, pz } = hit
      // static body: push the car out along -n (n points car -> world)
      A.x -= nx * Math.max(0, depth - 0.005)
      A.z -= nz * Math.max(0, depth - 0.005)
      const imp = applyImpulse(A, null, nx, nz, px, pz, 0.18)
      syncSpeeds(A)
      if (imp > 0.4) {
        A.lastImpact = imp
        A.lastImpactAt = now
        events.push({ a: A, b: null, impact: imp, x: px, z: pz, kind: col.kind })
      }
    }
  }
  return events
}

/** Point-in-world test for spawning: true when a car-sized box at (x,z) overlaps static geometry. */
export function blockedStatic(x: number, z: number, rot: number, hx: number, hz: number): boolean {
  collidersNear(x, z, hz + 2, near)
  setObb(tmpA, x, z, rot, hx, hz)
  for (let k = 0; k < near.length; k++) {
    const col = city.colliders[near[k]]
    setObb(tmpB, col.x, col.z, col.rot, col.hx, col.hz)
    if (sat(tmpA, tmpB)) return true
  }
  return false
}
