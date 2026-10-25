import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Small helper for assembling merged, vertex-coloured procedural models. */
export class Kit {
  private parts = new Map<string, BufferGeometry[]>()

  add(key: string, geo: BufferGeometry, color: [number, number, number] | string = [1, 1, 1], m?: Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (m) g.applyMatrix4(m)
    if (g.getAttribute('uv')) g.deleteAttribute('uv')
    const c = typeof color === 'string' ? hex(color) : color
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2] }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    const list = this.parts.get(key) ?? []
    list.push(g)
    this.parts.set(key, list)
  }

  box(key: string, x: number, y: number, z: number, w: number, h: number, d: number, color?: [number, number, number] | string, rx = 0, ry = 0, rz = 0) {
    this.add(key, new BoxGeometry(w, h, d), color, mat(x, y, z, rx, ry, rz))
  }
  cyl(key: string, x: number, y: number, z: number, r: number, len: number, axis: 'x' | 'y' | 'z', color?: [number, number, number] | string, seg = 14, r2 = r) {
    const g = new CylinderGeometry(r2, r, len, seg)
    const m = new Matrix4()
    if (axis === 'x') m.makeRotationZ(Math.PI / 2)
    else if (axis === 'z') m.makeRotationX(Math.PI / 2)
    m.setPosition(x, y, z)
    this.add(key, g, color, m)
  }
  sphere(key: string, x: number, y: number, z: number, r: number, color?: [number, number, number] | string, sx = 1, sy = 1, sz = 1) {
    const g = new SphereGeometry(r, 14, 10)
    const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(sx, sy, sz))
    this.add(key, g, color, m)
  }
  /** Cylinder between two points (bike frames, forks, limbs). */
  bar(key: string, a: [number, number, number], b: [number, number, number], r: number, color?: [number, number, number] | string, seg = 8) {
    const va = new Vector3(...a), vb = new Vector3(...b)
    const len = va.distanceTo(vb)
    const g = new CylinderGeometry(r, r, len, seg)
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vb.clone().sub(va).normalize())
    const m = new Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new Vector3(1, 1, 1))
    this.add(key, g, color, m)
  }

  build(key: string): BufferGeometry | null {
    const list = this.parts.get(key)
    if (!list || list.length === 0) return null
    const g = mergeGeometries(list, false)
    g?.computeBoundingSphere()
    return g
  }
  dispose() {
    this.parts.forEach((l) => l.forEach((g) => g.dispose()))
    this.parts.clear()
  }
}

export function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const m = new Matrix4()
  const q = new Quaternion().setFromEuler(new Euler(rx, ry, rz))
  m.compose(new Vector3(x, y, z), q, new Vector3(1, 1, 1))
  return m
}

export function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export interface Station {
  z: number // metres along length (front +)
  y0: number // bottom y
  y1: number // top y
  hw: number // half width
}

/** Builds a smooth lofted body through rounded-rectangle cross-sections. Returns geometry + group index for the roof. */
export function loft(stations: Station[], opts: { n?: number; m?: number; roofFrom?: number } = {}): BufferGeometry {
  const M = opts.m ?? 20
  const n = opts.n ?? 3.4
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const roofFrom = opts.roofFrom ?? 2
  const sp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n)
  stations.forEach((s) => {
    const cy = (s.y0 + s.y1) / 2, hh = (s.y1 - s.y0) / 2
    for (let k = 0; k < M; k++) {
      const t = (k / M) * Math.PI * 2
      const x = s.hw * sp(Math.cos(t)), y = cy + hh * sp(Math.sin(t))
      pos.push(x, y, s.z)
      // vertex colour channel stores "is roof" so a single material can be split later if wanted
      const roof = Math.sin(t) > 0.55 ? 1 : 0
      col.push(roof, roof, roof)
    }
  })
  for (let i = 0; i < stations.length - 1; i++)
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = (i + 1) * M + ((k + 1) % M), d = (i + 1) * M + k
      // ring runs counter-clockwise seen from +z; flip winding so normals face outward
      idx.push(a, b, c, a, c, d)
    }
  // end caps
  const capCenter = (i: number) => {
    const s = stations[i]
    pos.push(0, (s.y0 + s.y1) / 2, s.z)
    col.push(0, 0, 0)
    return pos.length / 3 - 1
  }
  const c0 = capCenter(0), c1 = capCenter(stations.length - 1)
  const last = (stations.length - 1) * M
  for (let k = 0; k < M; k++) {
    idx.push(c0, (k + 1) % M, k)
    idx.push(c1, last + k, last + ((k + 1) % M))
  }
  void roofFrom
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
