import { Batch, type RGB } from './batch'
import { B, city, CURB, EXTENT, isArterial, N, nodeX, nodeZ, roadHalf } from './city'

export type GroundBatches = Record<'asphalt' | 'marks' | 'slab' | 'curb' | 'lawn' | 'paver' | 'parking' | 'water' | 'barrier' | 'stone', Batch>

const WHITE: RGB = [0.92, 0.92, 0.9]
const YELLOW: RGB = [0.95, 0.72, 0.12]
const Y_ROAD = 0.02
const Y_MARK = 0.032

/** Distance from intersection centre to the stop line along an approach. */
export const stopDist = (idx: number) => roadHalf(idx) + 4.9

function mark(b: Batch, x0: number, z0: number, x1: number, z1: number, color: RGB) {
  // thin horizontal quad, y above asphalt
  b.floor(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), Y_MARK, 4, color)
}

function dashedAlong(b: Batch, axis: 'x' | 'z', a: number, bnd: number, perp: number, width: number, dash: number, gap: number, color: RGB) {
  for (let p = a; p + dash <= bnd; p += dash + gap) {
    if (axis === 'x') mark(b, p, perp - width / 2, p + dash, perp + width / 2, color)
    else mark(b, perp - width / 2, p, perp + width / 2, p + dash, color)
  }
}

function solidAlong(b: Batch, axis: 'x' | 'z', a: number, bnd: number, perp: number, width: number, color: RGB) {
  if (axis === 'x') mark(b, a, perp - width / 2, bnd, perp + width / 2, color)
  else mark(b, perp - width / 2, a, perp + width / 2, bnd, color)
}

export function buildGround(): GroundBatches {
  const G = {
    asphalt: new Batch(), marks: new Batch(), slab: new Batch(), curb: new Batch(), lawn: new Batch(), paver: new Batch(),
    parking: new Batch(), water: new Batch(), barrier: new Batch(), stone: new Batch(),
  } as GroundBatches

  // ---- asphalt: intersections + segments (no overlaps) ----------------------
  for (let gz = 0; gz < N; gz++)
    for (let gx = 0; gx < N; gx++) {
      const hx = roadHalf(gx), hz = roadHalf(gz)
      G.asphalt.floor(nodeX(gx) - hx, nodeZ(gz) - hz, nodeX(gx) + hx, nodeZ(gz) + hz, Y_ROAD, 10)
    }
  for (let gz = 0; gz < N; gz++) {
    const rh = roadHalf(gz), zc = nodeZ(gz)
    const xs: [number, number][] = [[-EXTENT, nodeX(0) - roadHalf(0)]]
    for (let i = 0; i < N - 1; i++) xs.push([nodeX(i) + roadHalf(i), nodeX(i + 1) - roadHalf(i + 1)])
    xs.push([nodeX(N - 1) + roadHalf(N - 1), EXTENT])
    for (const [a, b] of xs) G.asphalt.floor(a, zc - rh, b, zc + rh, Y_ROAD, 10)
  }
  for (let gx = 0; gx < N; gx++) {
    const rh = roadHalf(gx), xc = nodeX(gx)
    const zs: [number, number][] = [[-EXTENT, nodeZ(0) - roadHalf(0)]]
    for (let i = 0; i < N - 1; i++) zs.push([nodeZ(i) + roadHalf(i), nodeZ(i + 1) - roadHalf(i + 1)])
    zs.push([nodeZ(N - 1) + roadHalf(N - 1), EXTENT])
    for (const [a, b] of zs) G.asphalt.floor(xc - rh, a, xc + rh, b, Y_ROAD, 10)
  }

  // ---- markings ------------------------------------------------------------
  const bikeGreen: RGB = [0.22, 0.46, 0.34]
  const lineSet = (axis: 'x' | 'z', idx: number, a: number, b: number, stub: boolean) => {
    const rh = roadHalf(idx)
    const c = axis === 'x' ? nodeZ(idx) : nodeX(idx)
    if (b - a < 4) return
    if (isArterial(idx)) {
      solidAlong(G.marks, axis, a, b, c - 0.3, 0.14, YELLOW)
      solidAlong(G.marks, axis, a, b, c + 0.3, 0.14, YELLOW)
      for (const s of [-1, 1]) {
        dashedAlong(G.marks, axis, a, b, c + s * 4.2, 0.13, 3, 6, WHITE)
        solidAlong(G.marks, axis, a, b, c + s * (rh - 2.3), 0.15, WHITE)
        if (!stub) {
          if (axis === 'x') G.marks.floor(a, c + s * (rh - 2.3) - (s > 0 ? 0 : 2.3 - 0.15), b, c + s * (rh - 2.3) + (s > 0 ? 2.3 - 0.15 : 0), Y_MARK - 0.004, 4, bikeGreen)
          else G.marks.floor(c + s * (rh - 2.3) - (s > 0 ? 0 : 2.3 - 0.15), a, c + s * (rh - 2.3) + (s > 0 ? 2.3 - 0.15 : 0), b, Y_MARK - 0.004, 4, bikeGreen)
        }
      }
    } else {
      dashedAlong(G.marks, axis, a + 1, b, c, 0.14, 3, 5, YELLOW)
      for (const s of [-1, 1]) solidAlong(G.marks, axis, a, b, c + s * (rh - 2.3), 0.13, WHITE)
    }
  }
  for (let gz = 0; gz < N; gz++) {
    lineSet('x', gz, -EXTENT + 2, nodeX(0) - roadHalf(0) - 1, true)
    for (let i = 0; i < N - 1; i++) lineSet('x', gz, nodeX(i) + roadHalf(i) + 5.6, nodeX(i + 1) - roadHalf(i + 1) - 5.6, false)
    lineSet('x', gz, nodeX(N - 1) + roadHalf(N - 1) + 1, EXTENT - 2, true)
  }
  for (let gx = 0; gx < N; gx++) {
    lineSet('z', gx, -EXTENT + 2, nodeZ(0) - roadHalf(0) - 1, true)
    for (let i = 0; i < N - 1; i++) lineSet('z', gx, nodeZ(i) + roadHalf(i) + 5.6, nodeZ(i + 1) - roadHalf(i + 1) - 5.6, false)
    lineSet('z', gx, nodeZ(N - 1) + roadHalf(N - 1) + 1, EXTENT - 2, true)
  }

  // crosswalks + stop lines at every approach that has a neighbour
  for (let gz = 0; gz < N; gz++)
    for (let gx = 0; gx < N; gx++) {
      const cx = nodeX(gx), cz = nodeZ(gz)
      const arms: { dx: number; dz: number; ok: boolean }[] = [
        { dx: 1, dz: 0, ok: gx < N - 1 }, { dx: -1, dz: 0, ok: gx > 0 },
        { dx: 0, dz: 1, ok: gz < N - 1 }, { dx: 0, dz: -1, ok: gz > 0 },
      ]
      for (const a of arms) {
        if (!a.ok) continue
        const alongX = a.dx !== 0
        const h = alongX ? roadHalf(gx) : roadHalf(gz) // intersection half-extent along the arm direction
        const w = alongX ? roadHalf(gz) : roadHalf(gx) // half road width of the arm
        const d0 = h + 0.8, d1 = h + 3.8
        // zebra stripes (perpendicular to travel): stripes 0.5 wide, every 1.0 across the road
        for (let s = -w + 0.9; s < w - 0.5; s += 1.0) {
          if (alongX) mark(G.marks, cx + a.dx * d0, cz + s, cx + a.dx * d1, cz + s + 0.5, WHITE)
          else mark(G.marks, cx + s, cz + a.dz * d0, cx + s + 0.5, cz + a.dz * d1, WHITE)
        }
        // stop line for traffic *arriving* from this arm (right-hand traffic: lane lies on the arrival side's right)
        const sd = stopDist(alongX ? gx : gz)
        if (alongX) {
          // vehicles arriving along -dx; their right is (-dz', dx') with d=(-a.dx,0) => (0,-a.dx)
          const side = -a.dx
          const z0 = side > 0 ? cz + 0.5 : cz - w + 0.3, z1 = side > 0 ? cz + w - 0.3 : cz - 0.5
          mark(G.marks, cx + a.dx * (sd - 0.3), z0, cx + a.dx * (sd + 0.3), z1, WHITE)
        } else {
          const side = a.dz // right of heading (0,-dz) is (dz*... ) => x = +dz
          const x0 = side > 0 ? cx + 0.5 : cx - w + 0.3, x1 = side > 0 ? cx + w - 0.3 : cx - 0.5
          mark(G.marks, x0, cz + a.dz * (sd - 0.3), x1, cz + a.dz * (sd + 0.3), WHITE)
        }
      }
    }

  // ---- blocks: sidewalk slab + curbs ------------------------------------
  for (const blk of city.blocks) {
    G.slab.floor(blk.x0, blk.z0, blk.x1, blk.z1, CURB, 4)
    const c: RGB = [0.68, 0.67, 0.64]
    G.curb.quad([blk.x0, Y_ROAD, blk.z0], [blk.x1, Y_ROAD, blk.z0], [blk.x1, CURB, blk.z0], [blk.x0, CURB, blk.z0], undefined, c)
    G.curb.quad([blk.x1, Y_ROAD, blk.z1], [blk.x0, Y_ROAD, blk.z1], [blk.x0, CURB, blk.z1], [blk.x1, CURB, blk.z1], undefined, c)
    G.curb.quad([blk.x0, Y_ROAD, blk.z1], [blk.x0, Y_ROAD, blk.z0], [blk.x0, CURB, blk.z0], [blk.x0, CURB, blk.z1], undefined, c)
    G.curb.quad([blk.x1, Y_ROAD, blk.z0], [blk.x1, Y_ROAD, blk.z1], [blk.x1, CURB, blk.z1], [blk.x1, CURB, blk.z0], undefined, c)
  }
  for (const r of city.lawns) G.lawn.floor(r.x0, r.z0, r.x1, r.z1, CURB + 0.012, 6)
  for (const r of city.paving) G.paver.floor(r.x0, r.z0, r.x1, r.z1, CURB + 0.02, 4)
  for (const r of city.parking) {
    G.parking.floor(r.x0, r.z0, r.x1, r.z1, CURB + 0.03, 10)
    // bay lines
    const cols = Math.floor((r.x1 - r.x0) / 2.9)
    for (let i = 0; i <= cols; i++) {
      const x = r.x0 + 0.05 + i * 2.9
      G.marks.floor(x - 0.05, r.z0, x + 0.05, r.z0 + 5.4, CURB + 0.045, 4, WHITE)
      G.marks.floor(x - 0.05, r.z1 - 5.4, x + 0.05, r.z1, CURB + 0.045, 4, WHITE)
    }
  }
  for (const p of city.ponds) {
    G.water.floor(p.x0, p.z0, p.x1, p.z1, CURB + 0.05, 6)
    const t = 0.7, h = 0.35
    G.stone.box((p.x0 + p.x1) / 2, CURB, p.z0 - t / 2, p.x1 - p.x0 + 2 * t, h, t, { color: [0.62, 0.6, 0.57] })
    G.stone.box((p.x0 + p.x1) / 2, CURB, p.z1 + t / 2, p.x1 - p.x0 + 2 * t, h, t, { color: [0.62, 0.6, 0.57] })
    G.stone.box(p.x0 - t / 2, CURB, (p.z0 + p.z1) / 2, t, h, p.z1 - p.z0, { color: [0.62, 0.6, 0.57] })
    G.stone.box(p.x1 + t / 2, CURB, (p.z0 + p.z1) / 2, t, h, p.z1 - p.z0, { color: [0.62, 0.6, 0.57] })
  }
  for (const f of city.fountains) {
    G.stone.box(f.x, CURB, f.z, 12, 0.7, 12, { color: [0.7, 0.68, 0.64], top: false })
    G.water.floor(f.x - 5.4, f.z - 5.4, f.x + 5.4, f.z + 5.4, CURB + 0.62, 6)
    G.stone.box(f.x, CURB, f.z, 1.6, 2.6, 1.6, { color: [0.75, 0.73, 0.7] })
  }
  // ---- boundary barriers (striped jersey barriers) ---------------------------
  const E = EXTENT
  const bar = (x: number, z: number, w: number, d: number, i: number) =>
    G.barrier.box(x, 0, z, w, 1.0, d, { color: i % 2 ? [0.9, 0.9, 0.9] : [0.95, 0.45, 0.1], tileU: 2, tileV: 2 })
  for (let i = 0, p = -E; p < E; p += 3, i++) {
    bar(p + 1.5, E + 1, 3, 1.2, i); bar(p + 1.5, -E - 1, 3, 1.2, i)
    bar(E + 1, p + 1.5, 1.2, 3, i); bar(-E - 1, p + 1.5, 1.2, 3, i)
  }
  void B
  return G
}
