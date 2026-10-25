import {
  BoxGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, type BufferGeometry, type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { VehicleSpec } from '../config/vehicles'
import { Kit, loft, type Station } from './kit'

export type ModelKind = 'hatch' | 'sedan' | 'coupe' | 'suv' | 'van' | 'bus' | 'police' | 'moto' | 'bicycle'

export interface CarRig {
  root: Group // positioned/rotated by sim
  body: Group // pitched/rolled
  wheels: Object3D[] // spin about x
  steerPivots: Object3D[] // front wheels' steering pivots (rotation.y)
  paintMats: MeshStandardMaterial[]
  tailMat: MeshStandardMaterial | null
  headMat: MeshStandardMaterial | null
  sirenA?: MeshStandardMaterial
  sirenB?: MeshStandardMaterial
  fork?: Object3D // motorbike/bicycle front assembly
  cranks?: Object3D
  rider?: Object3D
  kind: ModelKind
  spec: VehicleSpec
  dispose: () => void
}

type Prof = { body: [number, number, number, number][]; cabin: [number, number, number][]; cabinBase: number }
// body: [t, top(frac of H), widthFrac, bottomY(m)]   cabin: [t, roof(frac of H), widthFrac]
const PROFILES: Record<'hatch' | 'sedan' | 'coupe' | 'suv', Prof> = {
  sedan: {
    body: [[0, 0.58, 0.86, 0.32], [0.02, 0.66, 0.94, 0.26], [0.12, 0.7, 0.99, 0.22], [0.5, 0.68, 1, 0.2], [0.72, 0.67, 1, 0.2], [0.9, 0.6, 0.98, 0.24], [0.975, 0.52, 0.93, 0.28], [1, 0.42, 0.83, 0.34]],
    cabin: [[0.24, 0.72, 0.8], [0.32, 0.95, 0.87], [0.4, 1, 0.89], [0.56, 1, 0.89], [0.62, 0.95, 0.87], [0.7, 0.72, 0.83]],
    cabinBase: 0.66,
  },
  hatch: {
    body: [[0, 0.6, 0.88, 0.32], [0.02, 0.68, 0.95, 0.26], [0.12, 0.7, 0.99, 0.22], [0.5, 0.68, 1, 0.2], [0.7, 0.67, 1, 0.2], [0.9, 0.6, 0.98, 0.24], [0.975, 0.53, 0.94, 0.28], [1, 0.44, 0.85, 0.34]],
    cabin: [[0.06, 0.76, 0.84], [0.12, 0.96, 0.88], [0.22, 1, 0.9], [0.55, 1, 0.9], [0.62, 0.95, 0.88], [0.69, 0.72, 0.84]],
    cabinBase: 0.66,
  },
  coupe: {
    body: [[0, 0.6, 0.88, 0.28], [0.02, 0.68, 0.96, 0.22], [0.1, 0.74, 1, 0.18], [0.5, 0.7, 1, 0.16], [0.75, 0.64, 1, 0.16], [0.92, 0.52, 0.98, 0.18], [0.98, 0.42, 0.93, 0.22], [1, 0.34, 0.85, 0.26]],
    cabin: [[0.3, 0.78, 0.8], [0.4, 0.97, 0.84], [0.47, 1, 0.86], [0.55, 1, 0.86], [0.64, 0.93, 0.84], [0.76, 0.7, 0.82]],
    cabinBase: 0.68,
  },
  suv: {
    body: [[0, 0.62, 0.9, 0.36], [0.02, 0.68, 0.96, 0.3], [0.1, 0.7, 1, 0.28], [0.5, 0.69, 1, 0.28], [0.75, 0.69, 1, 0.28], [0.92, 0.64, 0.99, 0.32], [0.98, 0.57, 0.95, 0.36], [1, 0.5, 0.89, 0.4]],
    cabin: [[0.05, 0.78, 0.89], [0.09, 0.96, 0.92], [0.17, 1, 0.93], [0.62, 1, 0.93], [0.68, 0.96, 0.91], [0.75, 0.72, 0.88]],
    cabinBase: 0.68,
  },
}

const geoCache = new Map<string, { body: BufferGeometry; cabin: BufferGeometry; trim: BufferGeometry | null; hl: BufferGeometry | null; tl: BufferGeometry | null; wheel: BufferGeometry; extra?: BufferGeometry | null }>()

function wheelGeometry(r: number, w: number): BufferGeometry {
  const k = new Kit()
  k.cyl('w', 0, 0, 0, r, w, 'x', [0.07, 0.07, 0.08], 22)
  k.cyl('w', 0, 0, 0, r * 0.66, w * 1.02, 'x', [0.55, 0.57, 0.6], 18)
  k.cyl('w', 0, 0, 0, r * 0.2, w * 1.06, 'x', [0.2, 0.2, 0.22], 10)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    k.box('w', w * 0.51, Math.sin(a) * r * 0.38, Math.cos(a) * r * 0.38, 0.03, r * 0.12, r * 0.5, [0.18, 0.18, 0.2], a, 0, 0)
  }
  const g = k.build('w')!
  k.dispose()
  return g
}

function carGeometry(spec: VehicleSpec, style: 'hatch' | 'sedan' | 'coupe' | 'suv') {
  const key = `${spec.id}:${style}`
  const hit = geoCache.get(key)
  if (hit) return hit
  const P = PROFILES[style]
  const L = spec.length, W = spec.width, H = spec.height
  const stBody: Station[] = P.body.map(([t, top, w, y0]) => ({ z: (t - 0.5) * L, y0, y1: top * H, hw: (W / 2) * w }))
  const baseY = P.cabinBase * H
  const stCabin: Station[] = P.cabin.map(([t, roof, w]) => ({ z: (t - 0.5) * L, y0: baseY - 0.08, y1: Math.max(baseY + 0.02, roof * H), hw: (W / 2) * w }))
  const body = loft(stBody, { n: 3.4, m: 22 })
  const cabin = loft(stCabin, { n: 3.0, m: 22 })
  const k = new Kit()
  const frontZ = L / 2, rearZ = -L / 2
  const dark: [number, number, number] = [0.04, 0.04, 0.05]
  const fT = P.body[P.body.length - 2][1] * H
  // bumpers, grille, skirts
  k.box('t', 0, 0.4, frontZ - 0.07, W * 0.88, 0.2, 0.2, dark)
  k.box('t', 0, 0.4, rearZ + 0.07, W * 0.88, 0.2, 0.2, dark)
  k.box('t', 0, fT * 0.62, frontZ - 0.03, W * 0.44, 0.13, 0.06, [0.02, 0.02, 0.03])
  k.box('t', 0, 0.3, frontZ - 0.03, W * 0.5, 0.06, 0.12, [0.01, 0.01, 0.01])
  for (const sx of [-1, 1]) {
    k.box('t', sx * (W / 2 - 0.01), 0.3, 0, 0.06, 0.12, L * 0.5, dark)
    // mirrors
    k.box('t', sx * (W / 2 + 0.07), baseY + 0.02, L * (P.cabin[P.cabin.length - 1][0] - 0.5) - L * 0.05, 0.14, 0.09, 0.1, dark)
    // wheel arches (dark discs that make the wheels read as recessed)
    for (const az of [spec.wheelBase / 2, -spec.wheelBase / 2])
      k.cyl('t', sx * (W / 2 - 0.05), spec.wheelRadius, az, spec.wheelRadius + 0.07, 0.1, 'x', [0.02, 0.02, 0.02], 20)
    // door lines
    k.box('t', sx * (W / 2 - 0.005), baseY - 0.15, L * 0.04, 0.01, 0.55 * H * 0.6, 0.012, [0.02, 0.02, 0.02])
    k.box('t', sx * (W / 2 - 0.005), baseY - 0.15, -L * 0.14, 0.01, 0.55 * H * 0.6, 0.012, [0.02, 0.02, 0.02])
    k.box('t', sx * (W / 2 - 0.003), baseY - 0.02, L * 0.0, 0.012, 0.025, 0.14, [0.7, 0.7, 0.72])
  }
  // licence plates
  k.box('t', 0, 0.52, frontZ - 0.02, 0.5, 0.12, 0.02, [0.92, 0.92, 0.9])
  k.box('t', 0, 0.62, rearZ + 0.02, 0.5, 0.12, 0.02, [0.92, 0.92, 0.9])
  if (style === 'suv') {
    k.box('t', 0, H + 0.03, 0, W * 0.8, 0.04, L * 0.34, [0.1, 0.1, 0.1])
    for (const sx of [-1, 1]) k.box('t', sx * W * 0.4, H * 0.985, 0, 0.04, 0.06, L * 0.36, [0.1, 0.1, 0.1])
  }
  if (style === 'coupe') {
    k.box('t', 0, H * 0.72, rearZ + 0.28, W * 0.82, 0.04, 0.3, dark)
    for (const sx of [-1, 1]) k.box('t', sx * W * 0.32, H * 0.67, rearZ + 0.3, 0.04, 0.1, 0.12, dark)
    k.box('t', 0, 0.26, frontZ - 0.25, W * 0.9, 0.06, 0.4, dark) // splitter
  }
  const hl = new Kit(), tl = new Kit()
  const hy = fT * 0.78
  for (const sx of [-1, 1]) {
    hl.box('h', sx * W * 0.34, hy, frontZ - 0.05, W * 0.2, 0.08, 0.09, [1, 1, 1], 0, sx * 0.25, 0)
    tl.box('t', sx * W * 0.35, H * 0.52, rearZ + 0.04, W * 0.22, 0.09, 0.06, [1, 1, 1], 0, -sx * 0.1, 0)
  }
  if (style === 'coupe') tl.box('t', 0, H * 0.52, rearZ + 0.045, W * 0.4, 0.035, 0.05, [1, 1, 1])
  const out = { body, cabin, trim: k.build('t'), hl: hl.build('h'), tl: tl.build('t'), wheel: wheelGeometry(spec.wheelRadius, spec.wheelRadius * 0.72) }
  k.dispose(); hl.dispose(); tl.dispose()
  geoCache.set(key, out)
  return out
}

const matCache = new Map<string, Material>()
function shared<T extends Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined
  if (!m) { m = make(); matCache.set(key, m) }
  return m as T
}
export const glassMat = () => shared('glass', () => new MeshStandardMaterial({ color: '#2a3c50', metalness: 0.65, roughness: 0.05, envMapIntensity: 1.8 }))
export const trimMat = () => shared('trim', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.2, roughness: 0.65 }))
export const wheelMat = () => shared('wheel', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.55, roughness: 0.5 }))
const paintCache = new Map<string, MeshStandardMaterial>()
export function paintMat(color: string): MeshStandardMaterial {
  let m = paintCache.get(color)
  if (!m) {
    m = new MeshStandardMaterial({ color, metalness: 0.62, roughness: 0.28, envMapIntensity: 1.25 })
    paintCache.set(color, m)
  }
  return m
}

export function buildCar(spec: VehicleSpec, style: 'hatch' | 'sedan' | 'coupe' | 'suv', color: string, opts: { policeLights?: boolean } = {}): CarRig {
  const g = carGeometry(spec, style)
  const root = new Group()
  const body = new Group()
  root.add(body)
  const paint = new MeshStandardMaterial({ color, metalness: 0.62, roughness: 0.28, envMapIntensity: 1.25 })
  const tail = new MeshStandardMaterial({ color: '#7a0c0c', emissive: '#ff1a1a', emissiveIntensity: 0.15, roughness: 0.3 })
  const head = new MeshStandardMaterial({ color: '#dfe9f5', emissive: '#fff2cc', emissiveIntensity: 0.1, roughness: 0.15 })
  const bodyMesh = new Mesh(g.body, paint)
  const cabinMesh = new Mesh(g.cabin, [glassMat(), paint])
  // loft stores "roof" in vertex colours; split cabin faces into glass + roof groups
  splitCabinGroups(g.cabin)
  bodyMesh.castShadow = cabinMesh.castShadow = true
  body.add(bodyMesh, cabinMesh)
  if (g.trim) { const m = new Mesh(g.trim, trimMat()); m.castShadow = false; body.add(m) }
  if (g.hl) body.add(new Mesh(g.hl, head))
  if (g.tl) body.add(new Mesh(g.tl, tail))
  const wheels: Object3D[] = []
  const pivots: Object3D[] = []
  const wr = spec.wheelRadius
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const pivot = new Group()
    pivot.position.set(sx * (spec.width / 2 - spec.wheelRadius * 0.36 + 0.02), wr, sz * (spec.wheelBase / 2))
    const spin = new Group()
    const wm = new Mesh(g.wheel, wheelMat())
    if (sx < 0) wm.rotation.y = Math.PI
    wm.castShadow = false
    spin.add(wm)
    pivot.add(spin)
    root.add(pivot)
    wheels.push(spin)
    if (sz > 0) pivots.push(pivot)
  }
  const rig: CarRig = {
    root, body, wheels, steerPivots: pivots, paintMats: [paint], tailMat: tail, headMat: head, kind: style, spec,
    dispose: () => { paint.dispose(); tail.dispose(); head.dispose() },
  }
  if (opts.policeLights) addPoliceBar(rig, spec, style)
  return rig
}

function splitCabinGroups(geo: BufferGeometry) {
  if (geo.groups.length) return
  const col = geo.getAttribute('color')
  const idx = geo.index!
  // groups: 0 = glass, 1 = roof paint. Triangles whose vertices are all roof-coloured go to the roof.
  const glass: number[] = [], roof: number[] = []
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)
    const r = col.getX(a) + col.getX(b) + col.getX(c)
    ;(r >= 2.5 ? roof : glass).push(a, b, c)
  }
  geo.setIndex([...glass, ...roof])
  geo.addGroup(0, glass.length, 0)
  geo.addGroup(glass.length, roof.length, 1)
}

function addPoliceBar(rig: CarRig, spec: VehicleSpec, _style: string) {
  const k = new Kit()
  k.box('b', 0, 0, 0, spec.width * 0.55, 0.07, 0.3, [0.05, 0.05, 0.06])
  const bar = k.build('b')!
  const barMesh = new Mesh(bar, trimMat())
  const y = spec.height + 0.05
  barMesh.position.set(0, y, -0.1)
  const redM = new MeshStandardMaterial({ color: '#4a0000', emissive: '#ff0000', emissiveIntensity: 0.2 })
  const blueM = new MeshStandardMaterial({ color: '#00104a', emissive: '#1744ff', emissiveIntensity: 0.2 })
  const red = new Mesh(new BoxGeometry(0.28, 0.08, 0.26), redM)
  const blue = new Mesh(new BoxGeometry(0.28, 0.08, 0.26), blueM)
  red.position.set(-spec.width * 0.14, y + 0.07, -0.1)
  blue.position.set(spec.width * 0.14, y + 0.07, -0.1)
  rig.body.add(barMesh, red, blue)
  rig.sirenA = redM
  rig.sirenB = blueM
  const old = rig.dispose
  rig.dispose = () => { old(); redM.dispose(); blueM.dispose(); bar.dispose() }
}

/** One merged, vertex-coloured geometry for static parked cars (paint = white so instance colour tints it). */
const parkedCache = new Map<string, BufferGeometry>()
export function parkedCarGeometry(spec: VehicleSpec, style: 'hatch' | 'sedan' | 'coupe' | 'suv'): BufferGeometry {
  const key = `${spec.id}:${style}`
  const hit = parkedCache.get(key)
  if (hit) return hit
  const g = carGeometry(spec, style)
  const parts: BufferGeometry[] = []
  const prep = (src: BufferGeometry, colorFn: (i: number, col: BufferGeometry) => [number, number, number], m?: Matrix4) => {
    const c = src.index ? src.toNonIndexed() : src.clone()
    if (m) c.applyMatrix4(m)
    const n = c.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { const col = colorFn(i, c); arr[i * 3] = col[0]; arr[i * 3 + 1] = col[1]; arr[i * 3 + 2] = col[2] }
    if (c.getAttribute('uv')) c.deleteAttribute('uv')
    c.setAttribute('color', new Float32BufferAttribute(arr, 3))
    parts.push(c)
  }
  prep(g.body, () => [1, 1, 1])
  // cabin: loft colours flag roof triangles (r=1) -> paint, otherwise tinted glass
  const cab = g.cabin.index ? g.cabin.toNonIndexed() : g.cabin.clone()
  const flag = cab.getAttribute('color')
  prep(cab, (i) => (flag.getX(i) > 0.5 ? [1, 1, 1] : [0.03, 0.04, 0.06]))
  if (g.trim) prep(g.trim, (i, c) => { const a = c.getAttribute('color') ?? null; return a ? [a.getX(i), a.getY(i), a.getZ(i)] : [0.05, 0.05, 0.05] })
  if (g.hl) prep(g.hl, () => [0.9, 0.9, 0.8])
  if (g.tl) prep(g.tl, () => [0.55, 0.05, 0.05])
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const m = new Matrix4().makeTranslation(sx * (spec.width / 2 - spec.wheelRadius * 0.36 + 0.02), spec.wheelRadius, sz * (spec.wheelBase / 2))
    if (sx < 0) m.multiply(new Matrix4().makeRotationY(Math.PI))
    prep(g.wheel, (i, c) => { const a = c.getAttribute('color'); return a ? [a.getX(i), a.getY(i), a.getZ(i)] : [0.1, 0.1, 0.1] }, m)
  }
  const merged = mergeGeometries(parts, false)!
  merged.computeBoundingSphere()
  parts.forEach((p) => p.dispose())
  parkedCache.set(key, merged)
  return merged
}
