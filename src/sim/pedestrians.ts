import { rand, randPick } from '../core/math'
import { emit, rt, type Pedestrian } from '../core/runtime'
import type { VehicleBody } from '../vehicles/physics'
import { inGrid, signal } from './nav'
import { N, nodeX, nodeZ, roadHalf } from '../world/city'

/** Sidewalk graph: four corner nodes per intersection, linked along sidewalks and across crosswalks. */

const PED_OFF = 2.5
interface PNode { gx: number; gz: number; sx: number; sz: number; x: number; z: number }
const nodes: PNode[] = []
const idxOf = (gx: number, gz: number, sx: number, sz: number) => ((gz * N + gx) * 2 + (sx > 0 ? 1 : 0)) * 2 + (sz > 0 ? 1 : 0)
for (let gz = 0; gz < N; gz++)
  for (let gx = 0; gx < N; gx++)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        nodes[idxOf(gx, gz, sx, sz)] = { gx, gz, sx, sz, x: nodeX(gx) + sx * (roadHalf(gx) + PED_OFF), z: nodeZ(gz) + sz * (roadHalf(gz) + PED_OFF) }

interface Edge { to: number; cross: 'x' | 'z' | null } // cross: road axis the pedestrian crosses ('z' = a road carrying z-traffic)
function neighbours(n: PNode): Edge[] {
  const out: Edge[] = []
  out.push({ to: idxOf(n.gx, n.gz, -n.sx, n.sz), cross: 'z' }) // crossing the column road (cars travel along z)
  out.push({ to: idxOf(n.gx, n.gz, n.sx, -n.sz), cross: 'x' })
  const ax = n.gx + n.sx, az = n.gz + n.sz
  if (inGrid(ax, n.gz)) out.push({ to: idxOf(ax, n.gz, -n.sx, n.sz), cross: null })
  if (inGrid(n.gx, az)) out.push({ to: idxOf(n.gx, az, n.sx, -n.sz), cross: null })
  return out
}
const adj = nodes.map(neighbours)

export interface Ped extends Pedestrian {
  id: number
  from: number
  to: number
  t: number // 0..1 along the edge
  len: number
  speed: number
  phase: number
  crossing: 'x' | 'z' | null
  waitT: number
  lat: number // lateral offset so people don't share a line
  shirt: string
  pants: string
  skin: string
  hair: string
  scale: number
  fade: number
  wasHit: boolean
}

const SHIRTS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1', '#16a085', '#d35400', '#34495e', '#e84393', '#f1c40f']
const PANTS = ['#2c3e50', '#34495e', '#1b1b1b', '#5d4037', '#3c4a5a', '#6d6f73']
const SKINS = ['#f1c9a5', '#e0ac82', '#c68642', '#8d5524', '#5c3a21', '#3b2417']
const HAIR = ['#111111', '#2b1a10', '#3a2a1a', '#6b4423', '#1b1b1b']

export const peds: Ped[] = []
rt.peds = peds
let nextId = 1

function spawnAt(i: number): Ped {
  const n = nodes[i]
  const e = randPick(adj[i])
  const to = e.to
  const p: Ped = {
    id: nextId++, x: n.x, z: n.z, vx: 0, vz: 0, active: true, down: 0,
    from: i, to, t: 0, len: Math.hypot(nodes[to].x - n.x, nodes[to].z - n.z), speed: rand(1.1, 1.65), phase: rand(0, 6.28),
    crossing: e.cross, waitT: 0, lat: rand(-0.7, 0.7), shirt: randPick(SHIRTS), pants: randPick(PANTS), skin: randPick(SKINS), hair: randPick(HAIR),
    scale: rand(0.93, 1.07), fade: 0, wasHit: false,
  }
  return p
}

function chooseNext(p: Ped) {
  const cur = nodes[p.to]
  let opts = adj[p.to].filter((e) => e.to !== p.from)
  if (!opts.length) opts = adj[p.to]
  // prefer continuing along the sidewalk, sometimes cross
  const walk = opts.filter((e) => !e.cross), cross = opts.filter((e) => e.cross)
  const e = cross.length && (Math.random() < 0.28 || !walk.length) ? randPick(cross) : walk.length ? randPick(walk) : randPick(opts)
  p.from = p.to
  p.to = e.to
  p.crossing = e.cross
  p.t = 0
  p.len = Math.hypot(nodes[p.to].x - cur.x, nodes[p.to].z - cur.z)
}

const near = { x: 0, z: 0 }
function pedPos(p: Ped, out: { x: number; z: number }) {
  const a = nodes[p.from], b = nodes[p.to]
  const dx = (b.x - a.x) / (p.len || 1), dz = (b.z - a.z) / (p.len || 1)
  // lateral offset perpendicular to the walking direction (not while crossing, to stay inside the crosswalk)
  const lat = p.crossing ? p.lat * 0.5 : p.lat
  out.x = a.x + (b.x - a.x) * p.t - dz * lat
  out.z = a.z + (b.z - a.z) * p.t + dx * lat
  p.vx = dx * p.speed; p.vz = dz * p.speed
}

let spawnCd = 0
export function resetPeds() {
  peds.length = 0
  spawnCd = 0
}

function spawnNearPlayer(player: VehicleBody): boolean {
  const i = Math.floor(Math.random() * nodes.length)
  const n = nodes[i]
  const d = Math.hypot(n.x - player.x, n.z - player.z)
  if (d < 25 || d > 150) return false
  if (d < 80) {
    const dot = ((n.x - player.x) * Math.sin(player.heading) + (n.z - player.z) * Math.cos(player.heading)) / d
    if (dot > 0.2) return false
  }
  const p = spawnAt(i)
  p.t = Math.random() * 0.8
  pedPos(p, near)
  p.x = near.x; p.z = near.z
  peds.push(p)
  return true
}

export function updatePeds(dt: number, target: number, player: VehicleBody, bodies: VehicleBody[]) {
  spawnCd -= dt
  if (peds.length < target && spawnCd <= 0) {
    spawnCd = 0.08
    for (let k = 0; k < 8; k++) if (spawnNearPlayer(player)) break
  }
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i]
    const dp = Math.hypot(p.x - player.x, p.z - player.z)
    if (dp > 210 || (p.down > 0 && p.fade > 1)) { peds.splice(i, 1); continue }
    if (p.down > 0) {
      p.down -= dt
      p.x += p.vx * dt; p.z += p.vz * dt
      p.vx *= 0.9; p.vz *= 0.9
      if (p.down <= 0) p.fade = 2 // recovered: despawn after leaving (respawned elsewhere)
      continue
    }
    if (p.fade > 0) { p.fade += dt; continue }
    // wait at kerb for the crossing to be safe
    if (p.crossing && p.t === 0) {
      const a = nodes[p.from]
      const sig = signal(a.gx, a.gz, p.crossing, rt.time)
      if (sig !== 'red') { p.waitT += dt; p.speed = 0.0001; p.phase += 0; continue }
      p.speed = rand(1.2, 1.6)
    }
    // yield to another pedestrian directly ahead
    let blocked = false
    if (dp < 90) {
      const a = nodes[p.from], b = nodes[p.to]
      const dx = (b.x - a.x) / (p.len || 1), dz = (b.z - a.z) / (p.len || 1)
      for (let j = 0; j < peds.length; j++) {
        if (j === i) continue
        const o = peds[j]
        const rx = o.x - p.x, rz = o.z - p.z
        const f = rx * dx + rz * dz
        if (f > 0 && f < 0.9 && Math.abs(-rx * dz + rz * dx) < 0.5) { blocked = true; break }
      }
    }
    if (!blocked) {
      p.t += (p.speed * dt) / (p.len || 1)
      p.phase += dt * p.speed * 4.2
      if (p.t >= 1) {
        p.t = 0
        chooseNext(p)
        if (p.speed < 0.01) p.speed = rand(1.2, 1.6)
      }
    }
    pedPos(p, near)
    p.x = near.x; p.z = near.z
    if (!p.crossing) p.waitT = 0
  }
  // vehicle strikes (only near moving vehicles)
  for (const b of bodies) {
    if (Math.abs(b.speed) < 2.5) continue
    const sinH = Math.sin(b.heading), cosH = Math.cos(b.heading)
    for (const p of peds) {
      if (p.down > 0 || p.fade > 0) continue
      const dx = p.x - b.x, dz = p.z - b.z
      if (dx * dx + dz * dz > (b.hz + 1) ** 2) continue
      const f = dx * sinH + dz * cosH
      const l = -dx * cosH + dz * sinH
      if (Math.abs(f) < b.hz + 0.25 && Math.abs(l) < b.hx + 0.3) {
        p.down = 3.2
        p.vx = b.vx * 0.55 + (Math.random() - 0.5) * 2
        p.vz = b.vz * 0.55 + (Math.random() - 0.5) * 2
        p.wasHit = true
        if (b === rt.player) emit({ type: 'ped-hit' })
      }
    }
  }
}
