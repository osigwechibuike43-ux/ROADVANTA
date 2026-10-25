import { stopDist } from '../world/roads'
import { isArterial, laneOffsets, N, nodeX, nodeZ, roadHalf } from '../world/city'

/** Road network: grid graph, signal timing and lane-accurate route polylines shared by traffic, police and racers. */

export type Node = [number, number]
export const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]] // 0:+x 1:+z 2:-x 3:-z
export const inGrid = (gx: number, gz: number) => gx >= 0 && gz >= 0 && gx < N && gz < N

// ---------------------------------------------------------------------- signals
export type Light = 'green' | 'yellow' | 'red'
const CYCLE = 24
export function signal(gx: number, gz: number, axis: 'x' | 'z', t: number): Light {
  const tt = (t + ((gx * 7 + gz * 3) % 12)) % CYCLE
  if (axis === 'x') return tt < 8 ? 'green' : tt < 10 ? 'yellow' : 'red'
  return tt < 12 ? 'red' : tt < 20 ? 'green' : tt < 22 ? 'yellow' : 'red'
}

// ---------------------------------------------------------------------- routes
export interface StopInfo { s: number; exitS: number; gx: number; gz: number; axis: 'x' | 'z' }
export interface Route {
  x: Float32Array
  z: Float32Array
  s: Float32Array // cumulative arc length
  vmax: Float32Array // curvature-limited speed per point
  n: number
  length: number
  stops: StopInfo[]
  nodes: Node[]
  /** arc length at which each leg's node centre is passed (index i => node i) */
  nodeS: number[]
  lanes: number[]
}

export interface RouteOpts {
  startAt?: number // metres along the first leg
  aLat?: number // comfortable lateral accel for the curvature speed limit
  speedCap?: number
  laneForLeg?: (leg: number, nodes: Node[]) => number
  centre?: boolean // drive on the road centre line (racing)
  offsetFor?: (road: number) => number // explicit lateral offset per road (bike lanes)
}

const half = (gx: number, gz: number, axis: 'x' | 'z') => (axis === 'x' ? roadHalf(gx) : roadHalf(gz))

export function buildRoute(nodes: Node[], lanes: number[], o: RouteOpts = {}): Route {
  const px: number[] = [], pz: number[] = []
  const stops: StopInfo[] = []
  const nodeS: number[] = []
  const push = (x: number, z: number) => { px.push(x); pz.push(z) }
  const arc = () => {
    let s = 0
    for (let i = 1; i < px.length; i++) s += Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1])
    return s
  }
  const legGeo = (i: number) => {
    const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1]
    const dx = Math.sign(bx - ax), dz = Math.sign(bz - az)
    const axis: 'x' | 'z' = dx !== 0 ? 'x' : 'z'
    const road = axis === 'x' ? az : ax
    const offs = laneOffsets(road)
    const off = o.centre ? 0 : o.offsetFor ? o.offsetFor(road) : offs[Math.min(lanes[i] ?? 0, offs.length - 1)]
    const rx = -dz, rz = dx
    const hA = half(ax, az, axis), hB = half(bx, bz, axis)
    return {
      dx, dz, axis, rx, rz, off,
      sx: nodeX(ax) + dx * hA + rx * off, sz: nodeZ(az) + dz * hA + rz * off,
      ex: nodeX(bx) - dx * hB + rx * off, ez: nodeZ(bz) - dz * hB + rz * off,
    }
  }
  const legs = nodes.length - 1
  if (legs < 1) throw new Error('route needs at least two nodes')
  for (let i = 0; i < legs; i++) {
    const g = legGeo(i)
    if (i === 0) {
      const a = o.startAt ?? 0
      push(g.sx + g.dx * a, g.sz + g.dz * a)
      nodeS.push(0)
    }
    push(g.ex, g.ez)
    const sEnd = arc()
    const [bx, bz] = nodes[i + 1]
    if (i < legs - 1) {
      const n = legGeo(i + 1)
      const turnS = sEnd
      if (n.dx === g.dx && n.dz === g.dz) {
        if (Math.abs(n.off - g.off) < 0.01) push(n.sx, n.sz)
        else {
          const L = (n.sx - g.ex) * g.dx + (n.sz - g.ez) * g.dz
          for (let k = 1; k <= 7; k++) {
            const t = k / 7, e = t * t * (3 - 2 * t)
            push(g.ex + g.dx * L * t + g.rx * (n.off - g.off) * e, g.ez + g.dz * L * t + g.rz * (n.off - g.off) * e)
          }
        }
      } else {
        const d = (n.sx - g.ex) * g.dx + (n.sz - g.ez) * g.dz
        const cx = g.ex + g.dx * d, cz = g.ez + g.dz * d
        for (let k = 1; k <= 9; k++) {
          const t = k / 9, u = 1 - t
          push(u * u * g.ex + 2 * u * t * cx + t * t * n.sx, u * u * g.ez + 2 * u * t * cz + t * t * n.sz)
        }
      }
      const exitS = arc()
      stops.push({ s: turnS - (stopDist(g.axis === 'x' ? bx : bz) - half(bx, bz, g.axis)), exitS, gx: bx, gz: bz, axis: g.axis })
      nodeS.push((turnS + exitS) / 2)
    } else {
      stops.push({ s: sEnd - (stopDist(g.axis === 'x' ? bx : bz) - half(bx, bz, g.axis)), exitS: sEnd + 8, gx: bx, gz: bz, axis: g.axis })
      nodeS.push(sEnd)
    }
  }
  // curvature speed limit on the coarse polyline (circumscribed circle through 3 points)
  const aLat = o.aLat ?? 4.2
  const cap = o.speedCap ?? 60
  const n0 = px.length
  const v0 = new Float32Array(n0).fill(cap)
  for (let i = 1; i < n0 - 1; i++) {
    const ax = px[i - 1], az = pz[i - 1], bx = px[i], bz = pz[i], cx = px[i + 1], cz = pz[i + 1]
    const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz)
    const area2 = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax))
    if (area2 < 1e-4) continue
    const R = (ab * bc * ca) / (2 * area2)
    v0[i] = Math.min(cap, Math.sqrt(aLat * Math.max(R, 1)))
  }
  // resample so no segment is longer than STEP: closestS/steering/scan all work on vertices
  const STEP = 3.5
  const rx: number[] = [], rz: number[] = [], rv: number[] = []
  for (let i = 0; i < n0; i++) {
    rx.push(px[i]); rz.push(pz[i]); rv.push(v0[i])
    if (i === n0 - 1) break
    const len = Math.hypot(px[i + 1] - px[i], pz[i + 1] - pz[i])
    const k = Math.ceil(len / STEP)
    for (let j = 1; j < k; j++) {
      const t = j / k
      rx.push(px[i] + (px[i + 1] - px[i]) * t); rz.push(pz[i] + (pz[i + 1] - pz[i]) * t)
      rv.push(Math.min(v0[i], v0[i + 1]))
    }
  }
  const n = rx.length
  const x = Float32Array.from(rx), z = Float32Array.from(rz)
  const s = new Float32Array(n)
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1])
  const vmax = Float32Array.from(rv)
  // propagate slow-downs backwards (look-ahead braking at ~ 5 m/s^2)
  for (let i = n - 2; i >= 0; i--) {
    const ds = s[i + 1] - s[i]
    vmax[i] = Math.min(vmax[i], Math.sqrt(vmax[i + 1] * vmax[i + 1] + 2 * 5 * ds))
  }
  return { x, z, s, vmax, n, length: s[n - 1], stops, nodes, nodeS, lanes: lanes.slice() }
}

/** Closest arc length on the route to (x,z), searching from `hint` forwards. */
export function closestS(r: Route, x: number, z: number, hintIdx: number): { idx: number; dist: number } {
  let best = Infinity, bi = hintIdx
  const lo = Math.max(0, hintIdx - 2), hi = Math.min(r.n - 1, hintIdx + 24)
  for (let i = lo; i <= hi; i++) {
    const d = (r.x[i] - x) ** 2 + (r.z[i] - z) ** 2
    if (d < best) { best = d; bi = i }
  }
  return { idx: bi, dist: Math.sqrt(best) }
}

/** Point `ahead` metres past index idx. */
export function pointAhead(r: Route, idx: number, ahead: number, out: { x: number; z: number; i: number }) {
  const target = r.s[idx] + ahead
  let i = idx
  while (i < r.n - 1 && r.s[i + 1] < target) i++
  if (i >= r.n - 1) { out.x = r.x[r.n - 1]; out.z = r.z[r.n - 1]; out.i = r.n - 1; return out }
  const seg = r.s[i + 1] - r.s[i] || 1
  const t = (target - r.s[i]) / seg
  out.x = r.x[i] + (r.x[i + 1] - r.x[i]) * t
  out.z = r.z[i] + (r.z[i + 1] - r.z[i]) * t
  out.i = i
  return out
}

// ---------------------------------------------------------------------- planning
export function nearestNode(x: number, z: number): Node {
  const gx = Math.max(0, Math.min(N - 1, Math.round(x / 96 + (N - 1) / 2)))
  const gz = Math.max(0, Math.min(N - 1, Math.round(z / 96 + (N - 1) / 2)))
  return [gx, gz]
}

/** Dijkstra over (node, heading) with a turn penalty; U-turns forbidden. dir0 < 0 means any initial heading. */
export function findPath(from: Node, dir0: number, to: Node, turnPenalty = 25): Node[] | null {
  const key = (gx: number, gz: number, d: number) => (gz * N + gx) * 4 + d
  const dist = new Map<number, number>()
  const prev = new Map<number, number>()
  const open: [number, number][] = []
  const startDirs = dir0 >= 0 ? [dir0] : [0, 1, 2, 3]
  for (const d of startDirs) { dist.set(key(from[0], from[1], d), 0); open.push([0, key(from[0], from[1], d)]) }
  let goal = -1
  while (open.length) {
    open.sort((a, b) => a[0] - b[0])
    const [c, k] = open.shift()!
    if (c > (dist.get(k) ?? Infinity)) continue
    const d = k % 4, id = (k - d) / 4, gx = id % N, gz = Math.floor(id / N)
    if (gx === to[0] && gz === to[1]) { goal = k; break }
    for (let nd = 0; nd < 4; nd++) {
      if ((nd + 2) % 4 === d) continue
      const nx = gx + DIRS[nd][0], nz = gz + DIRS[nd][1]
      if (!inGrid(nx, nz)) continue
      const cost = c + 96 + (nd !== d ? turnPenalty : 0)
      const nk = key(nx, nz, nd)
      if (cost < (dist.get(nk) ?? Infinity)) { dist.set(nk, cost); prev.set(nk, k); open.push([cost, nk]) }
    }
  }
  if (goal < 0) return null
  const out: Node[] = []
  let k: number | undefined = goal
  while (k !== undefined) {
    const d = k % 4, id = (k - d) / 4
    out.push([id % N, Math.floor(id / N)])
    k = prev.get(k)
  }
  return out.reverse()
}

export const dirIndex = (dx: number, dz: number) => (dx > 0 ? 0 : dz > 0 ? 1 : dx < 0 ? 2 : 3)

/** Lane choice for a leg given the previous/next heading: turn right -> outer lane, left -> inner (arterials only). */
export function lanesFor(nodes: Node[], rnd: () => number = Math.random): number[] {
  const lanes: number[] = []
  let cur = rnd() < 0.55 ? 1 : 0
  for (let i = 0; i < nodes.length - 1; i++) {
    const road = nodes[i][0] === nodes[i + 1][0] ? nodes[i][0] : nodes[i][1]
    if (!isArterial(road)) { lanes.push(0); continue }
    if (i + 2 < nodes.length) {
      const d0 = dirIndex(nodes[i + 1][0] - nodes[i][0], nodes[i + 1][1] - nodes[i][1])
      const d1 = dirIndex(nodes[i + 2][0] - nodes[i + 1][0], nodes[i + 2][1] - nodes[i + 1][1])
      const turn = (d1 - d0 + 4) % 4 // 1 = right turn, 3 = left turn (right vector is (-dz, dx))
      if (turn === 1) cur = 1
      else if (turn === 3) cur = 0
    }
    lanes.push(cur)
  }
  return lanes
}

/** Random walk of `len` legs starting at `start` moving in direction `dir`. */
export function randomWalk(start: Node, dir: number, len: number): Node[] {
  const nodes: Node[] = [start]
  let [gx, gz] = start
  let d = dir
  for (let i = 0; i < len; i++) {
    const options: number[] = []
    for (const nd of [d, d, d, (d + 1) % 4, (d + 3) % 4]) {
      const nx = gx + DIRS[nd][0], nz = gz + DIRS[nd][1]
      if (inGrid(nx, nz)) options.push(nd)
    }
    if (!options.length) options.push((d + 2) % 4)
    d = options[Math.floor(Math.random() * options.length)]
    gx += DIRS[d][0]; gz += DIRS[d][1]
    if (!inGrid(gx, gz)) { gx -= DIRS[d][0]; gz -= DIRS[d][1]; break }
    nodes.push([gx, gz])
  }
  return nodes
}
