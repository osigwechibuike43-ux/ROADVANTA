import { clamp } from '../core/math'
import { rt } from '../core/runtime'
import { newInput, steerAuthority, type ControlInput, type VehicleBody } from '../vehicles/physics'
import type { CarRig } from '../vehicles/models'
import { nodeX, nodeZ, MID } from '../world/city'
import { closestS, pointAhead, signal, type Route } from './nav'

export type AgentKind = 'traffic' | 'police' | 'racer' | 'moto' | 'cyclist'
export type AIState = 'driving' | 'approaching' | 'waiting' | 'turning' | 'slowing' | 'recovering' | 'pursuing' | 'racing'

export interface Agent {
  id: number
  kind: AgentKind
  body: VehicleBody
  rig: CarRig
  route: Route | null
  idx: number
  state: AIState
  cruise: number
  aLat: number
  ignoreLights: boolean
  stuckT: number
  reverseT: number
  recoverT: number
  yieldIgnore: number
  offLane: number
  routeEnded: boolean
  dead: boolean
  spawnT: number
  gap: number
  leadV: number
  scanT: number
  direct: { x: number; z: number } | null
  input: ControlInput
  blockedByPed: boolean
  // race / police extras
  nextCp: number
  finished: number // finish time or 0
  catchT: number
  color: string
}

export function createAgent(id: number, kind: AgentKind, body: VehicleBody, rig: CarRig, color: string): Agent {
  return {
    id, kind, body, rig, route: null, idx: 0, state: 'driving', cruise: 12, aLat: 4.2, ignoreLights: false,
    stuckT: 0, reverseT: 0, recoverT: 0, yieldIgnore: 0, offLane: 0, routeEnded: false, dead: false, spawnT: rt.time,
    gap: Infinity, leadV: 0, scanT: Math.random() * 0.1, direct: null, input: newInput(), blockedByPed: false,
    nextCp: 0, finished: 0, catchT: 0, color,
  }
}

const tmp = { x: 0, z: 0, i: 0 }
const tmp2 = { x: 0, z: 0, i: 0 }

/** Steers the body toward a world point using pure pursuit. Returns steer input in -1..1. */
export function steerToward(b: VehicleBody, tx: number, tz: number): number {
  const sinH = Math.sin(b.heading), cosH = Math.cos(b.heading)
  const dx = tx - b.x, dz = tz - b.z
  const f = dx * sinH + dz * cosH
  const rgt = -dx * cosH + dz * sinH
  const L = Math.max(Math.hypot(dx, dz), 1)
  let alpha = Math.atan2(rgt, f)
  if (b.speed < -0.3) alpha = Math.atan2(rgt, -f) * -1 // reversing: mirror
  const kappa = (2 * Math.sin(alpha)) / L
  const delta = Math.atan(b.spec.wheelBase * kappa)
  const auth = steerAuthority(b.spec, b.speed)
  return clamp(delta / (b.spec.steerLock * auth), -1, 1)
}

function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1), 0, 1)
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

/** Looks along the planned route for vehicles / pedestrians that must be yielded to. */
function scan(a: Agent, horizon: number) {
  const b = a.body, r = a.route!
  const sinH = Math.sin(b.heading), cosH = Math.cos(b.heading)
  const n = Math.ceil(horizon / 2.5)
  let gap = Infinity, leadV = 0
  a.blockedByPed = false
  const sx: number[] = [], sz: number[] = []
  for (let k = 0; k <= n; k++) {
    // first samples follow the heading (route may lag the car), the rest follow the route
    pointAhead(r, a.idx, k * 2.5, tmp)
    sx.push(k < 2 ? b.x + sinH * k * 2.5 : tmp.x)
    sz.push(k < 2 ? b.z + cosH * k * 2.5 : tmp.z)
  }
  const vf = b.speed
  const bodies = rt.bodies
  for (let j = 0; j < bodies.length; j++) {
    const o = bodies[j]
    if (o === b) continue
    const dx = o.x - b.x, dz = o.z - b.z
    const reach = horizon + o.hz + 3
    if (dx * dx + dz * dz > reach * reach) continue
    const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading)
    const e = Math.max(0, o.hz - o.hx)
    const ax = o.x - ofx * e, az = o.z - ofz * e, bx2 = o.x + ofx * e, bz2 = o.z + ofz * e
    const rad = b.hx + o.hx + 0.35
    for (let k = 1; k <= n; k++) {
      const d = distSeg(sx[k], sz[k], ax, az, bx2, bz2)
      if (d > rad) continue
      const ds = k * 2.5
      const rel = ofx * sinH + ofz * cosH
      let yieldTo = true
      if (rel < 0.5) {
        // crossing or oncoming: the vehicle that reaches the conflict later yields
        const otherSpeed = Math.max(Math.abs(o.speed), 2)
        const tm = ds / Math.max(Math.abs(vf), 2)
        const to = Math.hypot(sx[k] - o.x, sz[k] - o.z) / otherSpeed
        const stationary = Math.abs(o.speed) < 0.6
        if (!stationary) yieldTo = tm > to + 0.25 || (Math.abs(tm - to) <= 0.25 && b.id > o.id)
        if (a.yieldIgnore > 0 && ds > 5 && !stationary) yieldTo = false
        if (a.kind === 'racer' && !stationary && ds > 8) yieldTo = false
      }
      if (!yieldTo) continue
      const g = ds - b.hz - 0.4
      if (g < gap) { gap = g; leadV = Math.max(0, o.vx * sinH + o.vz * cosH) }
      break
    }
  }
  // pedestrians
  const peds = rt.peds
  for (let j = 0; j < peds.length; j++) {
    const p = peds[j]
    if (!p.active) continue
    const dx = p.x - b.x, dz = p.z - b.z
    if (dx * dx + dz * dz > (horizon + 2) ** 2) continue
    for (let k = 1; k <= n; k++) {
      if (Math.hypot(sx[k] - p.x, sz[k] - p.z) < b.hx + 0.9) {
        const g = k * 2.5 - b.hz - 0.6
        if (g < gap) { gap = g; leadV = 0; a.blockedByPed = true }
        break
      }
    }
  }
  a.gap = gap
  a.leadV = leadV
}

const onArterial = (x: number, z: number) => Math.abs(x - nodeX(MID)) < 12 || Math.abs(z - nodeZ(MID)) < 12

/** Drives an agent along its route; writes a.input. Handles lights, following, yielding and recovery. */
export function driveRoute(a: Agent, dt: number) {
  const b = a.body, r = a.route
  const inp = a.input
  inp.throttle = 0; inp.brake = 0; inp.handbrake = false
  if (!r) { inp.brake = 1; return }
  const vf = b.speed
  const sinH = Math.sin(b.heading), cosH = Math.cos(b.heading)
  const c = closestS(r, b.x, b.z, a.idx)
  a.idx = c.idx
  a.offLane = c.dist
  const curS = r.s[a.idx]
  if (curS > r.length - 4) a.routeEnded = true
  a.yieldIgnore = Math.max(0, a.yieldIgnore - dt)

  // reverse-out manoeuvre when wedged against something
  if (a.reverseT > 0) {
    a.reverseT -= dt
    inp.brake = 1
    inp.steer = -clamp(steerToward(b, r.x[Math.min(a.idx + 3, r.n - 1)], r.z[Math.min(a.idx + 3, r.n - 1)]), -1, 1)
    a.state = 'recovering'
    return
  }

  // ---- steering -------------------------------------------------------------
  const Ld = clamp(3.5 + Math.abs(vf) * 0.5, 4.5, 20)
  pointAhead(r, a.idx, a.offLane > 4 ? 8 : Ld, tmp)
  let tx = tmp.x, tz = tmp.z
  if (a.direct) { tx = a.direct.x; tz = a.direct.z }
  inp.steer = steerToward(b, tx, tz)

  // ---- target speed ---------------------------------------------------------
  const lookIdx = pointAhead(r, a.idx, clamp(Math.abs(vf) * 1.2, 6, 32), tmp2).i
  let cruise = a.cruise
  if (a.kind === 'traffic' && onArterial(b.x, b.z)) cruise *= 1.28
  let vt = Math.min(cruise, r.vmax[a.idx], r.vmax[lookIdx])
  a.state = a.kind === 'police' ? 'pursuing' : a.kind === 'racer' ? 'racing' : 'driving'
  if (vt < cruise * 0.72) a.state = a.kind === 'traffic' || a.kind === 'moto' || a.kind === 'cyclist' ? 'turning' : a.state

  // traffic light / stop line
  if (!a.ignoreLights) {
    for (let i = 0; i < r.stops.length; i++) {
      const st = r.stops[i]
      if (st.exitS < curS - 1) continue
      const dStop = st.s - (curS + b.hz)
      if (dStop < -3) break
      if (dStop > 70) break
      const L = signal(st.gx, st.gz, st.axis, rt.time)
      const mustStop = L === 'red' || (L === 'yellow' && dStop > (vf * vf) / 8 + 1.5)
      if (mustStop) {
        const d = Math.max(0, dStop - 0.6)
        vt = Math.min(vt, d < 0.25 ? 0 : Math.sqrt(2 * 3.4 * d))
        a.state = Math.abs(vf) < 0.6 && d < 3 ? 'waiting' : 'approaching'
      }
      break
    }
  }

  // other road users
  a.scanT -= dt
  if (a.scanT <= 0) {
    a.scanT = 0.06 + (a.id % 5) * 0.01
    scan(a, clamp(10 + Math.abs(vf) * 1.8, 12, 46))
  }
  let emergency = false
  if (a.gap < Infinity) {
    const allowed = Math.max(0, (a.gap - 3.2) * 0.85 + a.leadV * 0.8)
    if (allowed < vt) { vt = allowed; if (a.state !== 'waiting') a.state = 'slowing' }
    if (a.gap < 2.2 + Math.max(0, vf) * 0.3) emergency = true
  }
  if (a.offLane > 4.5) {
    vt = Math.min(vt, 5.5)
    a.state = 'recovering'
    a.recoverT += dt
    if (a.recoverT > 30) a.dead = true
  } else a.recoverT = Math.max(0, a.recoverT - dt * 2)

  // ---- longitudinal control --------------------------------------------------
  const err = vt - vf
  if (emergency) inp.brake = 1
  else if (err > 0.3) inp.throttle = clamp(err * 0.45, 0.08, 1)
  else if (err < -0.6) inp.brake = clamp(-err * 0.3, 0.12, 1)
  if (vt < 0.3 && vf < 0.8) { inp.brake = 1; inp.throttle = 0 }

  // ---- stuck detection -------------------------------------------------------
  const wantsToMove = vt > 2 && a.gap > 6 && a.state !== 'waiting'
  if (wantsToMove && Math.abs(vf) < 0.35) {
    a.stuckT += dt
    if (a.stuckT > 3.5) { a.reverseT = 1.4; a.stuckT = 0.5 }
    if (a.stuckT > 8) a.yieldIgnore = 6
  } else if (Math.abs(vf) > 1) a.stuckT = 0
  else if (!wantsToMove) a.stuckT = Math.max(0, a.stuckT - dt)
  // a vehicle that waited a long time at a blocked junction stops yielding to crossers
  if (a.gap < 8 && Math.abs(vf) < 0.3) { a.stuckT += dt * 0.5; if (a.stuckT > 6) a.yieldIgnore = 5 }
}

/** Off-route pursuit: steer straight at a point (used when a police car is close, or lost its lane). */
export function driveDirect(a: Agent, tx: number, tz: number, vt: number, dt: number) {
  const b = a.body, inp = a.input
  inp.throttle = 0; inp.brake = 0; inp.handbrake = false
  const vf = b.speed
  if (a.reverseT > 0) {
    a.reverseT -= dt
    inp.brake = 1
    inp.steer = -steerToward(b, tx, tz)
    a.state = 'recovering'
    return
  }
  inp.steer = steerToward(b, tx, tz)
  const dx = tx - b.x, dz = tz - b.z
  const want = Math.atan2(dx, dz)
  let err = want - b.heading
  err = Math.atan2(Math.sin(err), Math.cos(err))
  const ae = Math.abs(err)
  const v = vt * (ae > 1.3 ? 0.3 : ae > 0.7 ? 0.6 : 1)
  const e = v - vf
  if (e > 0.3) inp.throttle = clamp(e * 0.5, 0.1, 1)
  else if (e < -1) inp.brake = clamp(-e * 0.3, 0.1, 1)
  a.state = 'pursuing'
  if (Math.abs(vf) < 0.4 && v > 2) {
    a.stuckT += dt
    if (a.stuckT > 1.4) { a.reverseT = 1.1; a.stuckT = 0 }
  } else a.stuckT = 0
}
