import { WORLD } from '../config/game'
import { mulberry32, pick, rr, type Rng } from '../core/math'

/** Everything in here is pure data: the layout of the city. Rendering lives elsewhere. */

export const B = WORLD.blockSize
export const N = WORLD.gridN
export const MID = (N - 1) / 2
export const SIDEWALK = WORLD.sidewalk
export const CURB = 0.16
export const EXTENT = MID * B + 46 // half-size of the playable area

export const nodeX = (gx: number) => (gx - MID) * B
export const nodeZ = (gz: number) => (gz - MID) * B
export const isArterial = (i: number) => i === MID
/** Half width of the road whose centre line is grid line i. */
export const roadHalf = (i: number) => (isArterial(i) ? 10 : 7)
/** Lane centre offsets from road centreline (right-hand traffic). Arterials have two lanes each way. */
export const laneOffsets = (i: number) => (isArterial(i) ? [2.4, 6.0] : [2.4])
export const bikeOffset = (i: number) => roadHalf(i) - 1.1

export interface Box { x: number; z: number; hx: number; hz: number; rot: number; kind: string }
export type BlockType = 'downtown' | 'commercial' | 'residential' | 'park' | 'plaza' | 'mall' | 'industrial' | 'office'
export type BuildingKind = 'tower' | 'podium' | 'office' | 'apartment' | 'shop' | 'house' | 'mall' | 'warehouse'
export type RoofType = 'flat' | 'gable' | 'hip'

export interface Building {
  kind: BuildingKind
  x: number; z: number; w: number; d: number; h: number
  y0: number
  facing: 0 | 1 | 2 | 3 // 0:+z 1:+x 2:-z 3:-x
  palette: number
  roof: RoofType
  collide: boolean
}
export interface Block {
  bx: number; bz: number; type: BlockType
  x0: number; z0: number; x1: number; z1: number // curb-bounded rect (includes sidewalk)
  lx0: number; lz0: number; lx1: number; lz1: number // lot rect (inside sidewalk)
}
export interface Spot { x: number; z: number; rot: number; s: number; v: number }
export interface Fence { x0: number; z0: number; x1: number; z1: number; h: number; solid: boolean }
export interface ParkedCar { x: number; z: number; rot: number; style: number; color: string }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface CityData {
  blocks: Block[]
  buildings: Building[]
  colliders: Box[]
  trees: Spot[]
  lamps: Spot[]
  busStops: Spot[]
  benches: Spot[]
  bins: Spot[]
  hydrants: Spot[]
  fences: Fence[]
  parked: ParkedCar[]
  lawns: Rect[]
  paving: Rect[]
  parking: Rect[]
  ponds: Rect[]
  fountains: Spot[]
  containers: Spot[]
  pitches: Rect[]
}

const BLOCK_MAP: BlockType[][] = (
  // bz = 0 (south) .. 5 (north); bx = 0 (west) .. 5 (east)
  [
    ['residential', 'residential', 'residential', 'park', 'residential', 'industrial'],
    ['residential', 'commercial', 'commercial', 'commercial', 'mall', 'residential'],
    ['residential', 'commercial', 'downtown', 'downtown', 'commercial', 'residential'],
    ['park', 'commercial', 'plaza', 'downtown', 'commercial', 'park'],
    ['residential', 'commercial', 'commercial', 'office', 'commercial', 'residential'],
    ['residential', 'residential', 'commercial', 'commercial', 'residential', 'residential'],
  ] as BlockType[][]
)

function splitLots(r: Rect, cols: number, rows: number, gap: number): Rect[] {
  const out: Rect[] = []
  const w = (r.x1 - r.x0 - gap * (cols - 1)) / cols
  const d = (r.z1 - r.z0 - gap * (rows - 1)) / rows
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x0 = r.x0 + i * (w + gap), z0 = r.z0 + j * (d + gap)
      out.push({ x0, z0, x1: x0 + w, z1: z0 + d })
    }
  return out
}

const facingOf = (lot: Rect, blk: Block): 0 | 1 | 2 | 3 => {
  const cx = (lot.x0 + lot.x1) / 2 - (blk.lx0 + blk.lx1) / 2
  const cz = (lot.z0 + lot.z1) / 2 - (blk.lz0 + blk.lz1) / 2
  const nx = cx / (blk.lx1 - blk.lx0), nz = cz / (blk.lz1 - blk.lz0)
  if (Math.abs(nx) > Math.abs(nz)) return nx > 0 ? 1 : 3
  return nz > 0 ? 0 : 2
}

function build(): CityData {
  const rng: Rng = mulberry32(20261023)
  const c: CityData = {
    blocks: [], buildings: [], colliders: [], trees: [], lamps: [], busStops: [], benches: [], bins: [],
    hydrants: [], fences: [], parked: [], lawns: [], paving: [], parking: [], ponds: [], fountains: [],
    containers: [], pitches: [],
  }
  const addBox = (x: number, z: number, hx: number, hz: number, kind: string, rot = 0) =>
    c.colliders.push({ x, z, hx, hz, rot, kind })
  const addBuilding = (b: Omit<Building, 'collide' | 'y0'> & { collide?: boolean; y0?: number }) => {
    const bb: Building = { collide: true, y0: 0, ...b }
    c.buildings.push(bb)
    if (bb.collide) addBox(bb.x, bb.z, bb.w / 2, bb.d / 2, 'building')
  }
  const addTree = (x: number, z: number, s = rr(rng, 0.8, 1.3), collide = true) => {
    c.trees.push({ x, z, rot: rng() * 6.28, s, v: Math.floor(rng() * 3) })
    if (collide) addBox(x, z, 0.28 * s, 0.28 * s, 'tree')
  }

  // ---- blocks ----------------------------------------------------------
  for (let bz = 0; bz < N - 1; bz++)
    for (let bx = 0; bx < N - 1; bx++) {
      const x0 = nodeX(bx) + roadHalf(bx), x1 = nodeX(bx + 1) - roadHalf(bx + 1)
      const z0 = nodeZ(bz) + roadHalf(bz), z1 = nodeZ(bz + 1) - roadHalf(bz + 1)
      c.blocks.push({
        bx, bz, type: BLOCK_MAP[bz][bx], x0, z0, x1, z1,
        lx0: x0 + SIDEWALK, lz0: z0 + SIDEWALK, lx1: x1 - SIDEWALK, lz1: z1 - SIDEWALK,
      })
    }

  for (const blk of c.blocks) {
    const inner: Rect = { x0: blk.lx0, z0: blk.lz0, x1: blk.lx1, z1: blk.lz1 }
    const cx = (inner.x0 + inner.x1) / 2, cz = (inner.z0 + inner.z1) / 2
    switch (blk.type) {
      case 'downtown': {
        c.paving.push(inner)
        for (const lot of splitLots({ x0: inner.x0 + 2, z0: inner.z0 + 2, x1: inner.x1 - 2, z1: inner.z1 - 2 }, 2, 2, 5)) {
          const x = (lot.x0 + lot.x1) / 2, z = (lot.z0 + lot.z1) / 2
          const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0
          const facing = facingOf(lot, blk)
          const podH = rr(rng, 10, 16)
          const pal = Math.floor(rng() * 4)
          addBuilding({ kind: 'podium', x, z, w, d, h: podH, facing, palette: pal, roof: 'flat' })
          const tw = w * rr(rng, 0.55, 0.75), td = d * rr(rng, 0.55, 0.75)
          addBuilding({
            kind: 'tower', x: x + rr(rng, -2, 2), z: z + rr(rng, -2, 2), w: tw, d: td,
            h: rr(rng, 40, 120), y0: podH, facing, palette: pal, roof: 'flat', collide: false,
          })
        }
        break
      }
      case 'office':
      case 'commercial': {
        c.paving.push(inner)
        const lots = splitLots({ x0: inner.x0 + 1, z0: inner.z0 + 1, x1: inner.x1 - 1, z1: inner.z1 - 1 }, 2, 2, 4)
        for (const lot of lots) {
          const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0
          const kind: BuildingKind = blk.type === 'office' ? 'office' : pick(rng, ['shop', 'shop', 'office', 'apartment'])
          const h = kind === 'shop' ? rr(rng, 7, 13) : kind === 'office' ? rr(rng, 18, 42) : rr(rng, 16, 30)
          const bw = w * rr(rng, 0.8, 0.97), bd = d * rr(rng, 0.7, 0.9)
          const facing = facingOf(lot, blk)
          const ox = facing === 1 ? (w - bw) / 2 : facing === 3 ? -(w - bw) / 2 : 0
          const oz = facing === 0 ? (d - bd) / 2 : facing === 2 ? -(d - bd) / 2 : 0
          addBuilding({
            kind, x: (lot.x0 + lot.x1) / 2 + ox, z: (lot.z0 + lot.z1) / 2 + oz, w: bw, d: bd, h, facing,
            palette: Math.floor(rng() * 4), roof: 'flat',
          })
        }
        // street trees in front, a bench, bin
        c.benches.push({ x: cx, z: inner.z0 + 0.8, rot: 0, s: 1, v: 0 })
        c.bins.push({ x: inner.x0 + 0.8, z: cz, rot: 0, s: 1, v: 0 })
        break
      }
      case 'mall': {
        c.paving.push(inner)
        const mw = (inner.x1 - inner.x0) * 0.78, md = (inner.z1 - inner.z0) * 0.42
        const mz = inner.z1 - md / 2 - 1
        addBuilding({ kind: 'mall', x: cx, z: mz, w: mw, d: md, h: 13, facing: 2, palette: 1, roof: 'flat' })
        const lot: Rect = { x0: inner.x0 + 2, z0: inner.z0 + 2, x1: inner.x1 - 2, z1: mz - md / 2 - 3 }
        c.parking.push(lot)
        // parked cars in bays (two rows)
        const cols = Math.floor((lot.x1 - lot.x0) / 2.9)
        for (let row = 0; row < 2; row++)
          for (let i = 0; i < cols; i++) {
            if (rng() < 0.45) continue
            const x = lot.x0 + 1.5 + i * 2.9
            const z = row === 0 ? lot.z0 + 3.2 : lot.z1 - 3.2
            const rot = row === 0 ? 0 : Math.PI
            c.parked.push({ x, z, rot, style: Math.floor(rng() * 4), color: pick(rng, CAR_COLORS) })
            addBox(x, z, 0.95, 2.2, 'parked', 0)
          }
        for (let i = 0; i < 3; i++) addTree(lot.x0 + 8 + i * ((lot.x1 - lot.x0 - 16) / 2), (lot.z0 + lot.z1) / 2)
        break
      }
      case 'residential': {
        c.lawns.push(inner)
        const lots = splitLots(inner, 3, 3, 0)
        lots.forEach((lot, idx) => {
          const i = Math.floor(idx / 3), j = idx % 3
          if (i === 1 && j === 1) {
            if (rng() < 0.4) {
              addBuilding({ kind: 'apartment', x: cx, z: cz, w: 22, d: 16, h: rr(rng, 12, 20), facing: 0, palette: 2, roof: 'flat' })
            } else {
              addTree(cx - 5, cz - 3); addTree(cx + 6, cz + 4); addTree(cx + 1, cz - 8, 1.1)
            }
            return
          }
          const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0
          const facing = (i === 0 ? 3 : i === 2 ? 1 : j === 0 ? 2 : 0) as 0 | 1 | 2 | 3
          const hw = rr(rng, 10, 13), hd = rr(rng, 9, 11)
          const bw = facing % 2 === 0 ? hw : hd, bd = facing % 2 === 0 ? hd : hw
          const setback = 6.5
          let x = (lot.x0 + lot.x1) / 2, z = (lot.z0 + lot.z1) / 2
          if (facing === 3) x = lot.x0 + setback + bw / 2
          if (facing === 1) x = lot.x1 - setback - bw / 2
          if (facing === 2) z = lot.z0 + setback + bd / 2
          if (facing === 0) z = lot.z1 - setback - bd / 2
          addBuilding({
            kind: 'house', x, z, w: bw, d: bd, h: rng() < 0.3 ? 7.4 : 3.4, facing,
            palette: Math.floor(rng() * 6), roof: pick(rng, ['gable', 'hip', 'flat'] as RoofType[]),
          })
          // perimeter fence on the street side(s)
          const fx0 = lot.x0 + 0.3, fx1 = lot.x1 - 0.3, fz0 = lot.z0 + 0.3, fz1 = lot.z1 - 0.3
          const solid = rng() < 0.5
          const fence = (xa: number, za: number, xb: number, zb: number) => {
            c.fences.push({ x0: xa, z0: za, x1: xb, z1: zb, h: 1.5, solid })
            addBox((xa + xb) / 2, (za + zb) / 2, Math.max(0.12, Math.abs(xb - xa) / 2), Math.max(0.12, Math.abs(zb - za) / 2), 'fence')
          }
          if (i === 0) fence(fx0, fz0, fx0, fz1)
          if (i === 2) fence(fx1, fz0, fx1, fz1)
          if (j === 0 && i !== 1) fence(fx0, fz0, fx1, fz0)
          if (j === 2 && i !== 1) fence(fx0, fz1, fx1, fz1)
          if (j === 0 && i === 1) fence(fx0, fz0, fx1, fz0)
          if (j === 2 && i === 1) fence(fx0, fz1, fx1, fz1)
          // yard trees
          addTree(lot.x0 + rr(rng, 3, w - 3), lot.z0 + rr(rng, 3, d - 3), rr(rng, 0.8, 1.2))
          if (rng() < 0.5) addTree(lot.x0 + rr(rng, 3, w - 3), lot.z0 + rr(rng, 3, d - 3), rr(rng, 0.7, 1.0))
          // parked family car in driveway
          if (rng() < 0.55) {
            const px = facing === 3 ? lot.x0 + 3 : facing === 1 ? lot.x1 - 3 : x + (bw / 2 + 1.6)
            const pz = facing === 2 ? lot.z0 + 3 : facing === 0 ? lot.z1 - 3 : z + (bd / 2 + 1.6)
            const rot = facing % 2 === 0 ? 0 : Math.PI / 2
            if (px > lot.x0 + 1.5 && px < lot.x1 - 1.5 && pz > lot.z0 + 1.5 && pz < lot.z1 - 1.5) {
              c.parked.push({ x: px, z: pz, rot, style: Math.floor(rng() * 4), color: pick(rng, CAR_COLORS) })
              const along = rot === 0 ? [0.95, 2.2] : [2.2, 0.95]
              addBox(px, pz, along[0], along[1], 'parked')
            }
          }
        })
        break
      }
      case 'park': {
        c.lawns.push(inner)
        c.ponds.push({ x0: cx - 12, z0: cz - 9, x1: cx + 12, z1: cz + 9 })
        addBox(cx, cz, 12, 9, 'pond')
        for (let k = 0; k < 18; k++) {
          const tx = rr(rng, inner.x0 + 3, inner.x1 - 3), tz = rr(rng, inner.z0 + 3, inner.z1 - 3)
          if (Math.abs(tx - cx) < 16 && Math.abs(tz - cz) < 13) continue
          addTree(tx, tz, rr(rng, 1, 1.5))
        }
        c.benches.push({ x: cx - 18, z: cz, rot: Math.PI / 2, s: 1, v: 0 }, { x: cx + 18, z: cz, rot: -Math.PI / 2, s: 1, v: 0 })
        c.paving.push({ x0: cx - 1.5, z0: inner.z0, x1: cx + 1.5, z1: inner.z1 }, { x0: inner.x0, z0: cz - 1.5, x1: inner.x1, z1: cz + 1.5 })
        break
      }
      case 'plaza': {
        c.paving.push(inner)
        c.fountains.push({ x: cx, z: cz, rot: 0, s: 1, v: 0 })
        addBox(cx, cz, 6, 6, 'fountain')
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2
          addTree(cx + Math.cos(ang) * 22, cz + Math.sin(ang) * 22, 1.1)
        }
        for (let a = 0; a < 4; a++) {
          const ang = (a / 4) * Math.PI * 2 + Math.PI / 4
          c.benches.push({ x: cx + Math.cos(ang) * 12, z: cz + Math.sin(ang) * 12, rot: -ang + Math.PI / 2, s: 1, v: 0 })
        }
        break
      }
      case 'industrial': {
        c.paving.push(inner)
        const lots = splitLots({ x0: inner.x0 + 2, z0: inner.z0 + 2, x1: inner.x1 - 2, z1: inner.z1 - 2 }, 1, 2, 4)
        lots.forEach((lot, k) => {
          if (k === 0) {
            const w = lot.x1 - lot.x0, d = lot.z1 - lot.z0
            addBuilding({ kind: 'warehouse', x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2, w: w * 0.9, d: d * 0.8, h: 9, facing: 0, palette: 0, roof: 'flat' })
          } else {
            // container yard
            for (let i = 0; i < 6; i++)
              for (let j = 0; j < 2; j++) {
                const x = lot.x0 + 7 + i * 6.8, z = lot.z0 + 4 + j * 3.2 + (j ? 3 : 0)
                if (x > lot.x1 - 4) continue
                const stack = 1 + Math.floor(rng() * 2)
                c.containers.push({ x, z, rot: 0, s: stack, v: Math.floor(rng() * 5) })
                addBox(x, z, 3, 1.3, 'container')
              }
          }
        })
        break
      }
    }
  }

  // ---- street furniture along roads ---------------------------------------
  const isNearNode = (x: number, z: number, pad: number) => {
    for (let i = 0; i < N; i++) {
      if (Math.abs(x - nodeX(i)) < roadHalf(i) + pad) {
        for (let j = 0; j < N; j++) if (Math.abs(z - nodeZ(j)) < roadHalf(j) + pad) return true
      }
    }
    return false
  }
  const lamp = (x: number, z: number, rot: number) => {
    c.lamps.push({ x, z, rot, s: 1, v: 0 })
    addBox(x, z, 0.22, 0.22, 'lamp')
  }
  const hasBlockAt = (x: number, z: number) => c.blocks.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)
  // Roads running along x (rows gz) and along z (columns gx)
  for (let g = 0; g < N; g++) {
    const rh = roadHalf(g)
    for (let s = 0; s < N - 1; s++) {
      const a = (s - MID) * B, bb = (s + 1 - MID) * B
      const len = bb - a
      for (const side of [-1, 1]) {
        const off = side * (rh + 0.8)
        // lamps every 24 m (alternate sides stagger)
        for (let t = 14; t < len - 12; t += 24) {
          const p = a + t + (side > 0 ? 12 : 0)
          if (p > bb - 14) continue
          // row g (along x)
          if (hasBlockAt(p, nodeZ(g) + off)) lamp(p, nodeZ(g) + off, side > 0 ? Math.PI / 2 : -Math.PI / 2)
          // column g (along z)
          if (hasBlockAt(nodeX(g) + off, p)) lamp(nodeX(g) + off, p, side > 0 ? Math.PI : 0)
        }
        // trees every 12 m
        for (let t = 8; t < len - 8; t += 12) {
          const p = a + t + (side > 0 ? 6 : 0)
          if (p > bb - 12) continue
          const tx = p, tz = nodeZ(g) + side * (rh + 1.1)
          if (hasBlockAt(tx, tz) && !isNearNode(tx, tz, 6)) addTree(tx, tz, rr(rng, 0.7, 0.95))
          const tx2 = nodeX(g) + side * (rh + 1.1), tz2 = p
          if (hasBlockAt(tx2, tz2) && !isNearNode(tx2, tz2, 6)) addTree(tx2, tz2, rr(rng, 0.7, 0.95))
        }
        // bus stops mid-segment on arterials and some streets
        if ((isArterial(g) || (s + g) % 3 === 0) && side > 0) {
          const mid = a + len / 2 + 4
          c.busStops.push({ x: mid, z: nodeZ(g) + side * (rh + 1.7), rot: 0, s: 1, v: 0 })
          c.busStops.push({ x: nodeX(g) + side * (rh + 1.7), z: mid, rot: -Math.PI / 2, s: 1, v: 0 })
          addBox(mid, nodeZ(g) + side * (rh + 1.7), 1.7, 0.6, 'busstop')
          addBox(nodeX(g) + side * (rh + 1.7), mid, 0.6, 1.7, 'busstop')
        }
        if ((s + g) % 2 === 0) {
          c.hydrants.push({ x: a + len * 0.3, z: nodeZ(g) + side * (rh + 0.7), rot: 0, s: 1, v: 0 })
        }
      }
    }
  }

  // ---- boundary barriers --------------------------------------------------
  const E = EXTENT
  addBox(0, E + 1, E + 4, 1.2, 'boundary')
  addBox(0, -E - 1, E + 4, 1.2, 'boundary')
  addBox(E + 1, 0, 1.2, E + 4, 'boundary')
  addBox(-E - 1, 0, 1.2, E + 4, 'boundary')
  return c
}

export const CAR_COLORS = ['#2f6fed', '#e8e9ec', '#2a2d33', '#c9ccd2', '#9b1c1c', '#1d5e3a', '#d9a21b', '#5b6573', '#7a4a2b', '#f2f2f2'] as const

export const city: CityData = build()

// ---- spatial hash for static colliders -----------------------------------
const CELL = 24
const grid = new Map<number, number[]>()
const key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512)
city.colliders.forEach((b, i) => {
  const r = Math.hypot(b.hx, b.hz)
  const x0 = Math.floor((b.x - r) / CELL), x1 = Math.floor((b.x + r) / CELL)
  const z0 = Math.floor((b.z - r) / CELL), z1 = Math.floor((b.z + r) / CELL)
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const k = key(cx, cz)
      const arr = grid.get(k)
      if (arr) arr.push(i)
      else grid.set(k, [i])
    }
})
/** Collider indices whose cells overlap the given radius around (x,z). Results are de-duplicated via `out`. */
export function collidersNear(x: number, z: number, r: number, out: number[] = []): number[] {
  out.length = 0
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL)
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL)
  for (let cx = x0; cx <= x1; cx++)
    for (let cz = z0; cz <= z1; cz++) {
      const arr = grid.get(key(cx, cz))
      if (!arr) continue
      for (let i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i])
    }
  return out
}
