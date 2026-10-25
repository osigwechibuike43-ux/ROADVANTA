import { AI_SPECS, type VehicleSpec } from '../config/vehicles'
import { POLICE } from '../config/game'
import { rand } from '../core/math'
import { rt } from '../core/runtime'
import { blockedStatic } from '../vehicles/collision'
import { resetBody, type VehicleBody } from '../vehicles/physics'
import { collidersNear, city, B, MID, N, nodeX, nodeZ, roadHalf } from '../world/city'
import { driveDirect, driveRoute, type Agent } from './agents'
import { fleet } from './fleet'
import { buildRoute, DIRS, findPath, inGrid, lanesFor, nearestNode, type Node } from './nav'

/** Police pursuit: cruisers share the traffic road network, then close in directly once they are near. */

let replanCd = new Map<number, number>()
const near: number[] = []

export const policeAgents = () => fleet.agents.filter((a) => a.kind === 'police')

export function clearPolice() {
  fleet.removeWhere((a) => a.kind === 'police')
  replanCd = new Map()
}

export function policeSpec(playerMax: number): VehicleSpec {
  const base = AI_SPECS.police
  const cap = Math.max(31, Math.min(base.maxSpeed, playerMax * POLICE.maxSpeedFactor))
  return { ...base, maxSpeed: cap, engineForce: base.engineForce * Math.min(1, 0.55 + cap / base.maxSpeed * 0.45) }
}

/** Is the straight segment between two points free of buildings/walls? */
export function lineClear(ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az)
  const n = Math.max(2, Math.ceil(d / 4))
  for (let i = 1; i < n; i++) {
    const t = i / n
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t
    collidersNear(x, z, 1, near)
    for (const k of near) {
      const c = city.colliders[k]
      if (c.kind === 'curb') continue
      if (Math.abs(x - c.x) < c.hx + 0.5 && Math.abs(z - c.z) < c.hz + 0.5) return false
    }
  }
  return true
}

function cardinal(heading: number): number {
  const fx = Math.sin(heading), fz = Math.cos(heading)
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 0 : 2
  return fz > 0 ? 1 : 3
}

/** Builds a lane route that starts at the car's current position and heads for `target`. */
function planRoute(a: Agent, target: Node): boolean {
  const b = a.body
  const f = cardinal(b.heading)
  const [dx, dz] = DIRS[f]
  // car must be reasonably aligned with a road of the grid
  const along = dx !== 0 ? b.x : b.z
  const gAhead = Math.ceil(along / B + MID - 0.001) * 1
  const gA = dx + dz > 0 ? gAhead : Math.floor(along / B + MID + 0.001)
  const row = dx !== 0 ? Math.round(b.z / B + MID) : Math.round(b.x / B + MID)
  const lateral = dx !== 0 ? Math.abs(b.z - nodeZ(row)) : Math.abs(b.x - nodeX(row))
  if (row < 0 || row >= N || lateral > roadHalf(row) + 3) return false
  const ahead: Node = dx !== 0 ? [gA, row] : [row, gA]
  if (!inGrid(ahead[0], ahead[1])) return false
  const path = findPath(ahead, f, target)
  if (!path || path.length < 2) return false
  const prev: Node = [ahead[0] - dx, ahead[1] - dz]
  const nodes = inGrid(prev[0], prev[1]) ? [prev, ...path] : path
  const first = nodes[0]
  const hS = dx !== 0 ? roadHalf(first[0]) : roadHalf(first[1])
  const dist = (b.x - nodeX(first[0])) * dx + (b.z - nodeZ(first[1])) * dz - hS
  const lanes = lanesFor(nodes)
  const route = buildRoute(nodes, lanes, { startAt: Math.max(0, dist), aLat: 6.5, speedCap: b.spec.maxSpeed })
  a.route = route
  a.idx = 0
  a.routeEnded = false
  return true
}

export function spawnPoliceUnit(player: VehicleBody, playerMax: number, opts: { min?: number; max?: number; behind?: boolean } = {}): Agent | null {
  const min = opts.min ?? 110, max = opts.max ?? 190
  for (let tries = 0; tries < 40; tries++) {
    const gx = Math.floor(Math.random() * N), gz = Math.floor(Math.random() * N)
    const x = nodeX(gx), z = nodeZ(gz)
    const d = Math.hypot(x - player.x, z - player.z)
    if (d < min || d > max) continue
    if (opts.behind) {
      const dot = ((x - player.x) * Math.sin(player.heading) + (z - player.z) * Math.cos(player.heading)) / d
      if (dot > -0.1) continue
    }
    // face the player along an axis
    const dirs = [0, 1, 2, 3].map((k) => ({ k, s: DIRS[k][0] * (player.x - x) + DIRS[k][1] * (player.z - z) }))
    dirs.sort((p, q) => q.s - p.s)
    const f = dirs[0].k
    const nx = gx + DIRS[f][0], nz = gz + DIRS[f][1]
    if (!inGrid(nx, nz)) continue
    const spec = policeSpec(playerMax)
    const lane = 2.4
    const h = f % 2 === 0 ? roadHalf(gx) : roadHalf(gz)
    const sx = x + DIRS[f][0] * (h + 8) + -DIRS[f][1] * lane, sz = z + DIRS[f][1] * (h + 8) + DIRS[f][0] * lane
    const heading = Math.atan2(DIRS[f][0], DIRS[f][1])
    if (blockedStatic(sx, sz, heading, spec.width / 2, spec.length / 2)) continue
    if (rt.bodies.some((o) => Math.hypot(o.x - sx, o.z - sz) < 10)) continue
    const a = fleet.add('police', spec, '#f4f6fa', sx, sz, heading)
    a.ignoreLights = true
    a.cruise = spec.maxSpeed
    a.aLat = 6.5
    const v = 8
    a.body.vx = Math.sin(heading) * v; a.body.vz = Math.cos(heading) * v; a.body.speed = v
    replanCd.set(a.id, 0)
    return a
  }
  return null
}

const wedge = new Map<number, number>()
function rescue(a: Agent, player: VehicleBody) {
  const b = a.body
  const gx = Math.max(0, Math.min(N - 1, Math.round(b.x / B + MID)))
  const gz = Math.max(0, Math.min(N - 1, Math.round(b.z / B + MID)))
  const dxr = Math.abs(b.x - nodeX(gx)), dzr = Math.abs(b.z - nodeZ(gz))
  const off = 2.4
  let x: number, z: number, h: number
  if (dxr <= dzr) {
    const dir = player.z >= b.z ? 1 : -1
    x = nodeX(gx) - dir * off; z = b.z; h = dir > 0 ? 0 : Math.PI
  } else {
    const dir = player.x >= b.x ? 1 : -1
    z = nodeZ(gz) + dir * off; x = b.x; h = dir > 0 ? Math.PI / 2 : -Math.PI / 2
  }
  resetBody(b, x, z, h)
  b.vx = Math.sin(h) * 5; b.vz = Math.cos(h) * 5; b.speed = 5
  a.route = null; a.reverseT = 0; a.stuckT = 0; a.recoverT = 0; a.direct = null
  replanCd.set(a.id, 0)
}

/** Drives all police cars toward the player. Returns the nearest distance. */
export function updatePolice(dt: number, player: VehicleBody, siren: boolean): number {
  let nearest = Infinity
  const target = nearestNode(player.x + player.vx * 1.4, player.z + player.vz * 1.4)
  for (const a of fleet.agents) {
    if (a.kind !== 'police') continue
    const b = a.body
    const d = Math.hypot(player.x - b.x, player.z - b.z)
    nearest = Math.min(nearest, d)
    a.cruise = b.spec.maxSpeed
    let cd = (replanCd.get(a.id) ?? 0) - dt
    if (cd <= 0 || !a.route) {
      cd = 0.9 + Math.random() * 0.4
      if (!planRoute(a, target)) a.route = null
    }
    replanCd.set(a.id, cd)
    // wedged against something while far from the player: put the unit back on the nearest road
    const w = (wedge.get(a.id) ?? 0)
    if (Math.abs(b.speed) < 0.6 && d > 9) wedge.set(a.id, w + dt)
    else if (Math.abs(b.speed) > 2.5) wedge.set(a.id, 0)
    if (w > 4.5) { rescue(a, player); wedge.set(a.id, 0); continue }
    const clear = d < 26 && lineClear(b.x, b.z, player.x, player.z)
    if (clear || !a.route) {
      // predictive aim: lead the player slightly
      const lead = Math.min(0.8, d / Math.max(b.spec.maxSpeed, 10))
      a.direct = { x: player.x + player.vx * lead, z: player.z + player.vz * lead }
      driveDirect(a, a.direct.x, a.direct.z, b.spec.maxSpeed * (d < 14 ? 0.85 : 1), dt)
    } else {
      a.direct = null
      driveRoute(a, dt)
    }
    // siren lights
    const flash = Math.floor(rt.time * 6) % 2 === 0
    if (a.rig.sirenA && a.rig.sirenB) {
      a.rig.sirenA.emissiveIntensity = siren && flash ? 4 : 0.15
      a.rig.sirenB.emissiveIntensity = siren && !flash ? 4 : 0.15
    }
  }
  rt.sirenNear = nearest < Infinity && siren ? Math.max(0, Math.min(1, 1 - nearest / 170)) : 0
  void rand
  return nearest
}
