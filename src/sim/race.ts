import { VEHICLES } from '../config/vehicles'
import type { MissionDef } from '../config/missions'
import { clamp, randPick } from '../core/math'
import { rt } from '../core/runtime'
import { nodeX, nodeZ, N } from '../world/city'
import { driveRoute, type Agent } from './agents'
import { fleet } from './fleet'
import { buildRoute, DIRS, findPath, inGrid, lanesFor, pointAhead, type Node } from './nav'
import { resetBody } from '../vehicles/physics'

/** Street-race opponents: they follow the real road network through the same checkpoints as the player. */

export const CP_RADIUS = 15
const COLORS = ['#e03a2f', '#f2b400', '#6a3df0', '#13a89e', '#ff6a2b', '#e8e9ec']

export function clearRacers() {
  fleet.removeWhere((a) => a.kind === 'racer')
}

export function raceNodes(m: MissionDef): Node[] {
  const start: Node = [m.start.gx, m.start.gz]
  let dir = m.start.dir
  let nx = start[0] + DIRS[dir][0], nz = start[1] + DIRS[dir][1]
  if (!inGrid(nx, nz)) { dir = (dir + 2) % 4; nx = start[0] + DIRS[dir][0]; nz = start[1] + DIRS[dir][1] }
  const nodes: Node[] = [start, [nx, nz]]
  let curDir = dir
  for (const cp of m.points) {
    const last = nodes[nodes.length - 1]
    if (last[0] === cp[0] && last[1] === cp[1]) continue
    const path = findPath(last, curDir, cp, 15)
    if (!path) continue
    for (let i = 1; i < path.length; i++) nodes.push(path[i])
    const a = nodes[nodes.length - 2], b = nodes[nodes.length - 1]
    curDir = DIRS.findIndex((d) => d[0] === Math.sign(b[0] - a[0]) && d[1] === Math.sign(b[1] - a[1]))
  }
  return nodes
}

export function spawnRacers(m: MissionDef, slots: number[]): Agent[] {
  const out: Agent[] = []
  const nodes = raceNodes(m)
  const pool = m.difficulty <= 2 ? [VEHICLES[1], VEHICLES[0]] : m.difficulty === 3 ? [VEHICLES[3], VEHICLES[1], VEHICLES[2]] : [VEHICLES[4], VEHICLES[3], VEHICLES[3]]
  const n = m.opponents ?? 0
  for (let i = 0; i < n; i++) {
    const lanes = lanesFor(nodes)
    const route = buildRoute(nodes, lanes, { startAt: slots[i], aLat: 7.4 + m.difficulty * 0.3, speedCap: 70 })
    const spec = pool[i % pool.length]
    const heading = Math.atan2(route.x[1] - route.x[0], route.z[1] - route.z[0])
    const a = fleet.add('racer', spec, randPick(COLORS), route.x[0], route.z[0], heading)
    a.route = route
    a.ignoreLights = true
    a.aLat = 7.4
    a.cruise = 26 + m.difficulty * 4.2 - i * 0.8
    out.push(a)
  }
  return out
}

/** Progress through the race in "checkpoints" (fractional). */
export function progressScore(nextCp: number, x: number, z: number, m: MissionDef): number {
  const cps = m.points
  if (nextCp >= cps.length) return cps.length
  const prev = nextCp === 0 ? [nodeX(m.start.gx), nodeZ(m.start.gz)] : [nodeX(cps[nextCp - 1][0]), nodeZ(cps[nextCp - 1][1])]
  const nxt = [nodeX(cps[nextCp][0]), nodeZ(cps[nextCp][1])]
  const seg = Math.max(30, Math.hypot(nxt[0] - prev[0], nxt[1] - prev[1]))
  const d = Math.hypot(nxt[0] - x, nxt[1] - z)
  return nextCp + clamp(1 - d / seg, 0, 0.99)
}

export function updateRacers(dt: number, m: MissionDef, racers: Agent[], raceTime: number, playerScore: number, frozen: boolean): number {
  let finished = 0
  for (const a of racers) {
    if (a.finished > 0) { finished++; a.cruise = 0 }
    if (frozen) { a.input.throttle = 0; a.input.brake = 0; a.input.steer = 0; a.input.handbrake = true; continue }
    // checkpoint tracking
    if (a.nextCp < m.points.length) {
      const cp = m.points[a.nextCp]
      if (Math.hypot(a.body.x - nodeX(cp[0]), a.body.z - nodeZ(cp[1])) < CP_RADIUS + 4) {
        a.nextCp++
        if (a.nextCp >= m.points.length) { a.finished = raceTime; a.cruise = 0 }
      }
    }
    if (a.finished === 0) {
      const myScore = progressScore(a.nextCp, a.body.x, a.body.z, m)
      const base = 26 + m.difficulty * 4.2
      const band = clamp(1 + (playerScore - myScore) * 0.3, 0.9, 1.12)
      a.cruise = base * band * (1 - (a.id % 3) * 0.02)
    }
    if (a.finished > 0) { a.input.throttle = 0; a.input.brake = 0; a.input.steer = 0; a.input.handbrake = true; continue }
    driveRoute(a, dt)
    if (a.route && (a.recoverT > 3 || a.offLane > 14)) {
      // wedged or flung off the road: put the rival back on the racing line
      const r = a.route
      const p0 = { x: 0, z: 0, i: 0 }, p1 = { x: 0, z: 0, i: 0 }
      pointAhead(r, a.idx, 8, p0); pointAhead(r, a.idx, 16, p1)
      const h = Math.atan2(p1.x - p0.x, p1.z - p0.z)
      resetBody(a.body, p0.x, p0.z, h)
      a.body.vx = Math.sin(h) * 6; a.body.vz = Math.cos(h) * 6; a.body.speed = 6
      a.recoverT = 0; a.stuckT = 0; a.reverseT = 0; a.idx = p0.i
    }
    if (a.routeEnded && a.finished === 0) { a.finished = raceTime; a.cruise = 0 }
  }
  void N; void rt
  return finished
}
