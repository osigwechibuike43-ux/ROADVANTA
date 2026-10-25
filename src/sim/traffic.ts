import { AI_SPECS, VEHICLES } from '../config/vehicles'
import { clamp, rand, randPick } from '../core/math'
import { rt } from '../core/runtime'
import { blockedStatic } from '../vehicles/collision'
import type { VehicleBody } from '../vehicles/physics'
import { bikeOffset, CAR_COLORS, B, N, nodeX, nodeZ, roadHalf } from '../world/city'
import { driveRoute, type Agent } from './agents'
import { fleet } from './fleet'
import { buildRoute, DIRS, lanesFor, randomWalk, type Node } from './nav'

const RIDER_COLORS = ['#2b6cb0', '#c53030', '#2f855a', '#d69e2e', '#6b46c1', '#222831']
const MOTO_COLORS = ['#ff6a2b', '#e03a2f', '#1d4ed8', '#111827', '#f2b400', '#10b981']
const BUS_COLORS = ['#ffb703', '#2a9d8f', '#e76f51']
const TRAFFIC_KINDS = new Set(['traffic', 'moto', 'cyclist'])

let spawnCd = 0

function initialRoute(nodes: Node[], kind: Agent['kind']) {
  const lanes = lanesFor(nodes)
  const hStart = (nodes[0][0] !== nodes[1][0] ? roadHalf(nodes[0][0]) : roadHalf(nodes[0][1]))
  const hEnd = (nodes[0][0] !== nodes[1][0] ? roadHalf(nodes[1][0]) : roadHalf(nodes[1][1]))
  const startAt = rand(6, Math.max(8, B - hStart - hEnd - 16))
  return buildRoute(nodes, lanes, {
    startAt,
    aLat: kind === 'cyclist' ? 2.5 : kind === 'moto' ? 5 : 4.2,
    offsetFor: kind === 'cyclist' ? bikeOffset : undefined,
  })
}

function visibleToPlayer(x: number, z: number, p: VehicleBody) {
  const dx = x - p.x, dz = z - p.z
  const d = Math.hypot(dx, dz)
  if (d > 150) return false
  const dot = (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / (d || 1)
  return dot > 0.15 || d < 40
}

function trySpawn(player: VehicleBody, buses: number): boolean {
  const gx = Math.floor(Math.random() * N), gz = Math.floor(Math.random() * N)
  const dir = Math.floor(Math.random() * 4)
  const nx = gx + DIRS[dir][0], nz = gz + DIRS[dir][1]
  if (nx < 0 || nz < 0 || nx >= N || nz >= N) return false
  const nodes = randomWalk([gx, gz], dir, 9)
  if (nodes.length < 4) return false

  const roll = Math.random()
  let kind: Agent['kind'] = 'traffic'
  let spec = VEHICLES[0]
  let color: string = randPick(CAR_COLORS)
  let cruise = rand(11, 16)
  let rider: string | undefined
  if (roll < 0.3) spec = VEHICLES[0]
  else if (roll < 0.52) spec = VEHICLES[1]
  else if (roll < 0.66) spec = VEHICLES[2]
  else if (roll < 0.7) { spec = VEHICLES[3]; cruise = rand(14, 19) }
  else if (roll < 0.78) { spec = AI_SPECS.van; color = randPick(['#f5f5f5', '#d7d7d9', '#2a4d8f', '#b91c1c']); cruise = rand(10, 14) }
  else if (roll < 0.83 && buses < 2) { spec = AI_SPECS.bus; color = randPick(BUS_COLORS); cruise = rand(8, 11) }
  else if (roll < 0.92) { kind = 'moto'; spec = VEHICLES[5]; color = randPick(MOTO_COLORS); rider = randPick(RIDER_COLORS); cruise = rand(13, 18) }
  else { kind = 'cyclist'; spec = AI_SPECS.bicycle; color = randPick(MOTO_COLORS); rider = randPick(RIDER_COLORS); cruise = rand(4.2, 6) }

  const route = initialRoute(nodes, kind)
  const x = route.x[0], z = route.z[0]
  const dx = route.x[1] - route.x[0], dz = route.z[1] - route.z[0]
  const heading = Math.atan2(dx, dz)
  const dp = Math.hypot(x - player.x, z - player.z)
  if (dp < 70 || dp > 270 || visibleToPlayer(x, z, player)) return false
  for (const o of rt.bodies) if (Math.hypot(o.x - x, o.z - z) < 14) return false
  if (blockedStatic(x, z, heading, spec.width / 2, spec.length / 2)) return false

  const a = fleet.add(kind, spec, color, x, z, heading, rider)
  a.route = route
  a.cruise = cruise
  a.aLat = kind === 'cyclist' ? 2.5 : 4.2
  const f = cruise * 0.6
  a.body.vx = Math.sin(heading) * f
  a.body.vz = Math.cos(heading) * f
  a.body.speed = f
  return true
}

function extendRoute(a: Agent) {
  const r = a.route
  if (!r) return
  const curS = r.s[a.idx]
  let li = 0
  for (let i = 0; i < r.nodeS.length - 1; i++) if (r.nodeS[i] <= curS) li = i
  if (li < r.nodes.length - 3 && !a.routeEnded) return
  const nodes = r.nodes.slice(li)
  if (nodes.length < 2) return
  const last = nodes[nodes.length - 1], prev = nodes[nodes.length - 2]
  const d = DIRS.findIndex((v) => v[0] === Math.sign(last[0] - prev[0]) && v[1] === Math.sign(last[1] - prev[1]))
  const ext = randomWalk(last, d < 0 ? 0 : d, 7)
  const all = nodes.concat(ext.slice(1))
  const lanes = lanesFor(all)
  lanes[0] = r.lanes[li] ?? 0
  const route = buildRoute(all, lanes, { aLat: a.aLat, offsetFor: a.kind === 'cyclist' ? bikeOffset : undefined })
  a.route = route
  a.idx = 0
  a.routeEnded = false
}

export function resetTraffic() {
  fleet.removeWhere((a) => TRAFFIC_KINDS.has(a.kind))
  spawnCd = 0
}

/** Per-frame traffic management: spawn, despawn, steering/speed decisions. */
export function updateTraffic(dt: number, target: number, player: VehicleBody) {
  let count = 0, buses = 0
  for (const a of fleet.agents) {
    if (!TRAFFIC_KINDS.has(a.kind)) continue
    count++
    if (a.body.spec.body === 'bus') buses++
  }
  spawnCd -= dt
  if (count < target && spawnCd <= 0) {
    spawnCd = 0.12
    for (let i = 0; i < 6; i++) if (trySpawn(player, buses)) break
  }
  for (let i = fleet.agents.length - 1; i >= 0; i--) {
    const a = fleet.agents[i]
    if (!TRAFFIC_KINDS.has(a.kind)) continue
    const d = Math.hypot(a.body.x - player.x, a.body.z - player.z)
    if (a.dead || d > 330 || (count > target + 3 && d > 170)) {
      fleet.remove(a)
      count--
      continue
    }
    driveRoute(a, dt)
    if (a.routeEnded || a.idx > 4) extendRoute(a)
  }
  rt.trafficNear = clamp(count / Math.max(target, 1), 0, 1)
  void nodeX; void nodeZ
}
