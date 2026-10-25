import { mulberry32, pick, rr } from '../core/math'
import { Batch, hexToRgb, shade, type RGB } from './batch'
import { city, type Building } from './city'

/** Turns the city's building list into a handful of merged meshes (one per material). */

export type BuildingBatches = Record<
  'glass0' | 'glass1' | 'glass2' | 'glass3' | 'brick' | 'office' | 'shop' | 'houseFront' | 'houseSide' | 'warehouse' | 'roofFlat' | 'roofTile' | 'plain' | 'dark' | 'container',
  Batch
>

const WALL_TINTS: RGB[] = [[1, 1, 1], [0.95, 0.92, 0.88], [0.88, 0.9, 0.95], [0.97, 0.95, 0.9]]
const HOUSE_COLORS = ['#f2e6d2', '#e8d2b0', '#d9e4ea', '#f0d9c4', '#cfe0c8', '#e9c9b8']
const ROOF_COLORS = ['#8f4a33', '#5a5f66', '#6b4b3a', '#3f4a4f']

export function newBatches(): BuildingBatches {
  const o = {} as BuildingBatches
  for (const k of ['glass0', 'glass1', 'glass2', 'glass3', 'brick', 'office', 'shop', 'houseFront', 'houseSide', 'warehouse', 'roofFlat', 'roofTile', 'plain', 'dark', 'container'] as const) o[k] = new Batch()
  return o
}

/** Wall facing along a side, with an explicit texture window. Sides: 0:+z 1:+x 2:-z 3:-x */
function wall(b: Batch, bx: number, bz: number, w: number, d: number, side: number, y0: number, y1: number, tu: number, tv: number, color: RGB, vOff = 0, uMode: 'tile' | 'unit' = 'tile') {
  const x0 = bx - w / 2, x1 = bx + w / 2, z0 = bz - d / 2, z1 = bz + d / 2
  const h = y1 - y0
  const len = side % 2 === 0 ? w : d
  const u1 = uMode === 'unit' ? 1 : len / tu
  const v0 = vOff, v1 = vOff + h / tv
  const uvs: [number, number][] = [[0, v0], [u1, v0], [u1, v1], [0, v1]]
  if (side === 0) b.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uvs, color)
  if (side === 2) b.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uvs, color)
  if (side === 1) b.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uvs, color)
  if (side === 3) b.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uvs, color)
}

function roofBox(b: Batch, x: number, y0: number, z: number, w: number, h: number, d: number, color: RGB) {
  b.box(x, y0, z, w, h, d, { color, tileU: 4, tileV: 4 })
}

function rooftopClutter(B: BuildingBatches, bl: Building, r: () => number) {
  const top = bl.y0 + bl.h
  const n = bl.kind === 'tower' ? 2 : 3
  for (let i = 0; i < n; i++) {
    const w = rr(r, 1.5, 3.5), d = rr(r, 1.5, 3.5), h = rr(r, 0.8, 2.2)
    const x = bl.x + rr(r, -bl.w * 0.3, bl.w * 0.3), z = bl.z + rr(r, -bl.d * 0.3, bl.d * 0.3)
    B.plain.box(x, top, z, w, h, d, { color: [0.62, 0.64, 0.66], tileU: 4, tileV: 4 })
    B.dark.box(x, top + h, z, w * 0.6, 0.08, d * 0.6, { color: [0.25, 0.26, 0.28] })
  }
  if (bl.kind === 'tower') {
    B.dark.box(bl.x, top + 0.2, bl.z, 0.18, 9 + r() * 8, 0.18, { color: [0.7, 0.7, 0.72] })
    B.dark.box(bl.x, top, bl.z, bl.w * 0.5, 0.9, bl.d * 0.5, { color: [0.5, 0.52, 0.55] })
  }
  // parapet
  const p = 0.5, c: RGB = [0.8, 0.8, 0.78]
  const hx = bl.w / 2, hz = bl.d / 2
  B.plain.box(bl.x, top, bl.z - hz + 0.15, bl.w, p, 0.3, { color: c, top: true })
  B.plain.box(bl.x, top, bl.z + hz - 0.15, bl.w, p, 0.3, { color: c, top: true })
  B.plain.box(bl.x - hx + 0.15, top, bl.z, 0.3, p, bl.d - 0.6, { color: c, top: true })
  B.plain.box(bl.x + hx - 0.15, top, bl.z, 0.3, p, bl.d - 0.6, { color: c, top: true })
}

function house(B: BuildingBatches, bl: Building, r: () => number) {
  const wallC = hexToRgb(HOUSE_COLORS[bl.palette % HOUSE_COLORS.length])
  const x0 = bl.x - bl.w / 2, x1 = bl.x + bl.w / 2, z0 = bl.z - bl.d / 2, z1 = bl.z + bl.d / 2
  const floors = bl.h > 5 ? 2 : 1
  const fh = 3.4
  for (let side = 0; side < 4; side++) {
    for (let f = 0; f < floors; f++) {
      const isFront = side === bl.facing && f === 0
      const target = isFront ? B.houseFront : B.houseSide
      const len = side % 2 === 0 ? bl.w : bl.d
      // front texture is non-tiling in u (door + two windows), side tiles per 9 m
      wall(target, bl.x, bl.z, bl.w, bl.d, side, f * fh, (f + 1) * fh, 9, fh, wallC, 0, isFront ? 'unit' : 'tile')
      void len
    }
  }
  const top = floors * fh
  const rc = hexToRgb(ROOF_COLORS[bl.palette % ROOF_COLORS.length])
  // base plinth
  B.plain.box(bl.x, 0, bl.z, bl.w + 0.2, 0.35, bl.d + 0.2, { color: [0.55, 0.53, 0.5], top: false })
  if (bl.roof === 'flat') {
    B.roofFlat.floor(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, top + 0.02, 6, [0.85, 0.85, 0.85])
    B.plain.box(bl.x, top, bl.z - bl.d / 2 - 0.1, bl.w + 0.4, 0.5, 0.25, { color: shade(wallC, 0.95), top: true })
    B.plain.box(bl.x, top, bl.z + bl.d / 2 + 0.1, bl.w + 0.4, 0.5, 0.25, { color: shade(wallC, 0.95), top: true })
    B.plain.box(bl.x - bl.w / 2 - 0.1, top, bl.z, 0.25, 0.5, bl.d, { color: shade(wallC, 0.95), top: true })
    B.plain.box(bl.x + bl.w / 2 + 0.1, top, bl.z, 0.25, 0.5, bl.d, { color: shade(wallC, 0.95), top: true })
    B.dark.box(bl.x + bl.w * 0.2, top, bl.z - bl.d * 0.15, 1.1, 1.1, 1.1, { color: [0.15, 0.18, 0.22] }) // water tank
  } else if (bl.roof === 'gable') {
    const along = bl.w >= bl.d // ridge runs along the long axis
    const ov = 0.5, rh = Math.min(bl.w, bl.d) * 0.32
    const ax0 = x0 - ov, ax1 = x1 + ov, az0 = z0 - ov, az1 = z1 + ov
    const cx = bl.x, cz = bl.z
    const t = top
    if (along) {
      B.roofTile.quad([ax0, t, az1], [ax1, t, az1], [ax1, t + rh, cz], [ax0, t + rh, cz], [[0, 0], [(ax1 - ax0) / 4, 0], [(ax1 - ax0) / 4, rh / 3], [0, rh / 3]], rc)
      B.roofTile.quad([ax1, t, az0], [ax0, t, az0], [ax0, t + rh, cz], [ax1, t + rh, cz], [[0, 0], [(ax1 - ax0) / 4, 0], [(ax1 - ax0) / 4, rh / 3], [0, rh / 3]], rc)
      B.houseSide.tri([x1, top, z0], [x1, top, z1], [x1, top + rh, cz], [[0, 0], [0.5, 0], [0.25, 0.2]], wallC)
      B.houseSide.tri([x0, top, z1], [x0, top, z0], [x0, top + rh, cz], [[0, 0], [0.5, 0], [0.25, 0.2]], wallC)
    } else {
      B.roofTile.quad([ax1, t, az0], [ax1, t, az1], [cx, t + rh, az1], [cx, t + rh, az0], [[0, 0], [(az1 - az0) / 4, 0], [(az1 - az0) / 4, rh / 3], [0, rh / 3]], rc)
      B.roofTile.quad([ax0, t, az1], [ax0, t, az0], [cx, t + rh, az0], [cx, t + rh, az1], [[0, 0], [(az1 - az0) / 4, 0], [(az1 - az0) / 4, rh / 3], [0, rh / 3]], rc)
      B.houseSide.tri([x0, top, z1], [x1, top, z1], [cx, top + rh, z1], [[0, 0], [0.5, 0], [0.25, 0.2]], wallC)
      B.houseSide.tri([x1, top, z0], [x0, top, z0], [cx, top + rh, z0], [[0, 0], [0.5, 0], [0.25, 0.2]], wallC)
    }
    B.roofFlat.floor(x0, z0, x1, z1, top - 0.02, 6, [0.5, 0.5, 0.5], false)
  } else {
    // hip roof: truncated pyramid
    const ov = 0.5, rh = Math.min(bl.w, bl.d) * 0.26, ins = Math.min(bl.w, bl.d) * 0.28
    const a: [number, number, number] = [x0 - ov, top, z0 - ov], b: [number, number, number] = [x1 + ov, top, z0 - ov]
    const c: [number, number, number] = [x1 + ov, top, z1 + ov], d: [number, number, number] = [x0 - ov, top, z1 + ov]
    const a2: [number, number, number] = [x0 + ins, top + rh, z0 + ins], b2: [number, number, number] = [x1 - ins, top + rh, z0 + ins]
    const c2: [number, number, number] = [x1 - ins, top + rh, z1 - ins], d2: [number, number, number] = [x0 + ins, top + rh, z1 - ins]
    const uv: [number, number][] = [[0, 0], [3, 0], [2.5, 1.5], [0.5, 1.5]]
    B.roofTile.quad(d, c, c2, d2, uv, rc) // +z
    B.roofTile.quad(b, a, a2, b2, uv, rc) // -z
    B.roofTile.quad(c, b, b2, c2, uv, rc) // +x
    B.roofTile.quad(a, d, d2, a2, uv, rc) // -x
    B.roofTile.quad(d2, c2, b2, a2, [[0, 0], [1, 0], [1, 1], [0, 1]], rc)
  }
  // porch + step in front
  const fx = bl.facing === 1 ? 1 : bl.facing === 3 ? -1 : 0
  const fz = bl.facing === 0 ? 1 : bl.facing === 2 ? -1 : 0
  B.plain.box(bl.x + fx * (bl.w / 2 + 0.9), 0, bl.z + fz * (bl.d / 2 + 0.9), fx ? 1.8 : 2.4, 0.22, fx ? 2.4 : 1.8, { color: [0.6, 0.58, 0.55] })
  // driveway slab + path
  void r
}

function warehouse(B: BuildingBatches, bl: Building) {
  const c: RGB = [1, 1, 1]
  for (let s = 0; s < 4; s++) wall(B.warehouse, bl.x, bl.z, bl.w, bl.d, s, 0, bl.h, 8, 8, c)
  B.roofFlat.floor(bl.x - bl.w / 2, bl.z - bl.d / 2, bl.x + bl.w / 2, bl.z + bl.d / 2, bl.h, 8, [0.85, 0.87, 0.9])
  // roller doors on the front
  for (let i = 0; i < 4; i++) {
    const x = bl.x - bl.w / 2 + bl.w * (0.14 + i * 0.24)
    B.dark.box(x, 0, bl.z + bl.d / 2 + 0.02, 5, 5, 0.1, { color: [0.2, 0.25, 0.32], top: false })
  }
}

function podiumLike(B: BuildingBatches, bl: Building, r: () => number) {
  const tint = WALL_TINTS[bl.palette % 4]
  const shopH = 4.4
  const sides = [0, 1, 2, 3]
  const upperKind = bl.kind === 'apartment' ? B.brick : bl.kind === 'office' || bl.kind === 'mall' ? B.office : [B.glass0, B.glass1, B.glass2, B.glass3][bl.palette % 4]
  const doShop = bl.kind === 'shop' || bl.kind === 'podium' || bl.kind === 'office' || bl.kind === 'mall'
  for (const s of sides) {
    const len = s % 2 === 0 ? bl.w : bl.d
    if (doShop && bl.y0 === 0) {
      wall(B.shop, bl.x, bl.z, bl.w, bl.d, s, 0, shopH, 12, shopH, [1, 1, 1], 0)
      if (bl.h > shopH + 0.5) wall(upperKind, bl.x, bl.z, bl.w, bl.d, s, shopH, bl.h, 12, 14.4, tint, 0.0 + ((bl.h - shopH) % 14.4) / 14.4 * 0)
    } else {
      wall(upperKind, bl.x, bl.z, bl.w, bl.d, s, bl.y0, bl.y0 + bl.h, 12, 14.4, tint, 0)
    }
    void len
  }
  // roof + cornice
  B.roofFlat.floor(bl.x - bl.w / 2, bl.z - bl.d / 2, bl.x + bl.w / 2, bl.z + bl.d / 2, bl.y0 + bl.h, 8, [0.9, 0.9, 0.9])
  B.plain.box(bl.x, bl.y0 + shopH - 0.35, bl.z, bl.w + 0.3, 0.35, bl.d + 0.3, { color: [0.78, 0.77, 0.75], top: false })
  rooftopClutter(B, bl, r)
}

export function buildBuildings(): BuildingBatches {
  const B = newBatches()
  const r = mulberry32(99)
  for (const bl of city.buildings) {
    if (bl.kind === 'house') house(B, bl, r)
    else if (bl.kind === 'warehouse') warehouse(B, bl)
    else podiumLike(B, bl, r)
  }
  // shipping containers
  const cols: RGB[] = [[0.7, 0.18, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.85, 0.55, 0.1], [0.5, 0.5, 0.55]]
  for (const c of city.containers) {
    const col = cols[c.v % cols.length]
    for (let i = 0; i < c.s; i++) {
      B.container.box(c.x, i * 2.6, c.z, 6.1, 2.6, 2.44, { color: shade(col, 1 - i * 0.08), tileU: 3, tileV: 2.6 })
    }
  }
  void pick
  return B
}
