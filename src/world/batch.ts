import { BufferGeometry, Float32BufferAttribute } from 'three'

export type V3 = [number, number, number]
export type RGB = [number, number, number]

/** Accumulates flat-shaded quads so a whole city layer can be one draw call. */
export class Batch {
  pos: number[] = []
  nor: number[] = []
  uv: number[] = []
  col: number[] = []
  idx: number[] = []
  private n = 0

  /** Quad given counter-clockwise when seen from outside (normal = (b-a) x (c-a)). */
  quad(a: V3, b: V3, c: V3, d: V3, uvs?: [number, number][], color: RGB = [1, 1, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    const pts = [a, b, c, d]
    const uu = uvs ?? [[0, 0], [1, 0], [1, 1], [0, 1]]
    for (let i = 0; i < 4; i++) {
      this.pos.push(pts[i][0], pts[i][1], pts[i][2])
      this.nor.push(nx, ny, nz)
      this.uv.push(uu[i][0], uu[i][1])
      this.col.push(color[0], color[1], color[2])
    }
    this.idx.push(this.n, this.n + 1, this.n + 2, this.n, this.n + 2, this.n + 3)
    this.n += 4
  }

  tri(a: V3, b: V3, c: V3, uvs?: [number, number][], color: RGB = [1, 1, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    const uu = uvs ?? [[0, 0], [1, 0], [0.5, 1]]
    ;[a, b, c].forEach((p, i) => {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(nx, ny, nz)
      this.uv.push(uu[i][0], uu[i][1])
      this.col.push(color[0], color[1], color[2])
    })
    this.idx.push(this.n, this.n + 1, this.n + 2)
    this.n += 3
  }

  /** Horizontal quad (facing up) covering [x0,x1]x[z0,z1] at height y. UV in metres / tile. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, tile = 8, color?: RGB, up = true) {
    const u0 = x0 / tile, u1 = x1 / tile, v0 = z0 / tile, v1 = z1 / tile
    const uvs: [number, number][] = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]
    if (up) this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], uvs, color)
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], uvs, color)
  }

  /**
   * Axis-aligned box. tileU/tileV = metres of world per texture tile on the side faces
   * (so a facade texture holding one window bay tiles correctly regardless of building size).
   */
  box(
    cx: number, y0: number, cz: number, w: number, h: number, d: number,
    o: { tileU?: number; tileV?: number; color?: RGB; roofColor?: RGB; bottom?: boolean; top?: boolean; sides?: boolean; vOffset?: number } = {},
  ) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h
    const tu = o.tileU ?? 3, tv = o.tileV ?? 3.6, c = o.color ?? [1, 1, 1]
    const vo = o.vOffset ?? 0
    if (o.sides !== false) {
      const uvW = (len: number, off: number): [number, number][] => [
        [off / tu, vo], [(off + len) / tu, vo], [(off + len) / tu, vo + h / tv], [off / tu, vo + h / tv],
      ]
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uvW(w, 0), c) // +z
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uvW(w, 0), c) // -z
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uvW(d, 0), c) // +x
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uvW(d, 0), c) // -x
    }
    if (o.top !== false) this.floor(x0, z0, x1, z1, y1, 6, o.roofColor ?? c, true)
    if (o.bottom) this.floor(x0, z0, x1, z1, y0, 6, c, false)
  }

  toGeometry(withColor = true): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2))
    if (withColor) g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }

  get empty() {
    return this.n === 0
  }
}

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
export const shade = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]
