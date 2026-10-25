import { Group, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { VehicleSpec } from '../config/vehicles'
import { Kit } from './kit'
import { glassMat, trimMat, wheelMat, type CarRig } from './models'

const rbox = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r)
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z)
const DARK: [number, number, number] = [0.04, 0.04, 0.05]

interface Parts { paint: BufferGeometry | null; glass: BufferGeometry | null; trim: BufferGeometry | null; head: BufferGeometry | null; tail: BufferGeometry | null; wheel: BufferGeometry }
const cache = new Map<string, Parts>()

function simpleWheel(r: number, w: number): BufferGeometry {
  const k = new Kit()
  k.cyl('w', 0, 0, 0, r, w, 'x', [0.07, 0.07, 0.08], 22)
  k.cyl('w', 0, 0, 0, r * 0.62, w * 1.02, 'x', [0.6, 0.62, 0.65], 16)
  const g = k.build('w')!
  k.dispose()
  return g
}

function vanParts(spec: VehicleSpec): Parts {
  const L = spec.length, W = spec.width, H = spec.height
  const p = new Kit(), gl = new Kit(), t = new Kit(), h = new Kit(), tl = new Kit()
  p.add('p', rbox(W, H - 0.45, L * 0.62, 0.12), [1, 1, 1], T(0, 0.45 + (H - 0.45) / 2, -L * 0.19))
  p.add('p', rbox(W * 0.98, 0.95, L * 0.42, 0.1), [1, 1, 1], T(0, 0.35 + 0.475, L * 0.29))
  p.add('p', rbox(W * 0.94, 0.82, L * 0.3, 0.1), [1, 1, 1], T(0, 1.3 + 0.41, L * 0.17))
  gl.add('g', rbox(W * 0.86, 0.6, 0.06, 0.03), [1, 1, 1], T(0, 1.65, L * 0.17 + L * 0.15 + 0.01))
  for (const sx of [-1, 1]) gl.add('g', rbox(0.05, 0.55, L * 0.2, 0.02), [1, 1, 1], T(sx * (W * 0.47 + 0.005), 1.68, L * 0.15))
  t.box('t', 0, 0.38, L / 2 - 0.06, W * 0.92, 0.2, 0.14, DARK)
  t.box('t', 0, 0.38, -L / 2 + 0.05, W * 0.92, 0.2, 0.12, DARK)
  t.box('t', 0, 0.78, L / 2 - 0.01, W * 0.5, 0.14, 0.05, [0.02, 0.02, 0.03])
  for (const sx of [-1, 1]) {
    t.box('t', sx * (W / 2 + 0.06), 1.5, L * 0.3, 0.1, 0.2, 0.1, DARK)
    for (const az of [spec.wheelBase / 2, -spec.wheelBase / 2])
      t.cyl('t', sx * (W / 2 - 0.04), spec.wheelRadius, az, spec.wheelRadius + 0.07, 0.1, 'x', [0.02, 0.02, 0.02], 20)
  }
  t.box('t', 0, H - 0.04, -L * 0.2, W * 0.7, 0.04, L * 0.3, [0.75, 0.77, 0.8])
  for (const sx of [-1, 1]) {
    h.box('h', sx * W * 0.35, 0.92, L / 2 - 0.02, 0.28, 0.12, 0.06, [1, 1, 1])
    tl.box('t', sx * W * 0.42, 0.95, -L / 2 + 0.03, 0.12, 0.3, 0.05, [1, 1, 1])
  }
  const out = { paint: p.build('p'), glass: gl.build('g'), trim: t.build('t'), head: h.build('h'), tail: tl.build('t'), wheel: simpleWheel(spec.wheelRadius, spec.wheelRadius * 0.7) }
  ;[p, gl, t, h, tl].forEach((k) => k.dispose())
  return out
}

function busParts(spec: VehicleSpec): Parts {
  const L = spec.length, W = spec.width, H = spec.height
  const p = new Kit(), gl = new Kit(), t = new Kit(), h = new Kit(), tl = new Kit()
  p.add('p', rbox(W, H - 0.5, L, 0.25), [1, 1, 1], T(0, 0.5 + (H - 0.5) / 2, 0))
  // windows band
  for (const sx of [-1, 1]) {
    gl.add('g', rbox(0.06, 0.95, L * 0.84, 0.02), [1, 1, 1], T(sx * (W / 2 + 0.005), 2.05, -L * 0.04))
    t.box('t', sx * (W / 2 + 0.012), 1.38, 0, 0.02, 0.18, L * 0.96, [1, 1, 1]) // white stripe
    t.box('t', sx * (W / 2 + 0.02), 1.25, L * 0.34, 0.03, 1.5, 1.2, [0.05, 0.07, 0.08]) // doors
  }
  gl.add('g', rbox(W * 0.9, 1.25, 0.06, 0.04), [1, 1, 1], T(0, 1.95, L / 2 + 0.005))
  gl.add('g', rbox(W * 0.8, 0.7, 0.06, 0.04), [1, 1, 1], T(0, 2.1, -L / 2 - 0.005))
  t.box('t', 0, 2.82, L / 2 + 0.015, W * 0.6, 0.18, 0.04, [1, 0.7, 0.1])
  t.box('t', 0, 0.4, L / 2 - 0.1, W * 0.96, 0.25, 0.2, DARK)
  t.box('t', 0, 0.4, -L / 2 + 0.1, W * 0.96, 0.25, 0.2, DARK)
  t.box('t', 0, H + 0.12, -L * 0.2, W * 0.6, 0.25, 2.2, [0.8, 0.82, 0.85])
  for (const sx of [-1, 1]) {
    t.box('t', sx * (W / 2 + 0.2), 2.3, L / 2 - 0.5, 0.18, 0.4, 0.12, DARK)
    for (const az of [spec.wheelBase / 2, -spec.wheelBase / 2])
      t.cyl('t', sx * (W / 2 - 0.05), spec.wheelRadius, az, spec.wheelRadius + 0.08, 0.1, 'x', [0.02, 0.02, 0.02], 20)
    h.box('h', sx * W * 0.38, 0.85, L / 2 + 0.01, 0.35, 0.16, 0.06, [1, 1, 1])
    tl.box('t', sx * W * 0.4, 1.0, -L / 2 - 0.01, 0.14, 0.4, 0.05, [1, 1, 1])
  }
  const out = { paint: p.build('p'), glass: gl.build('g'), trim: t.build('t'), head: h.build('h'), tail: tl.build('t'), wheel: simpleWheel(spec.wheelRadius, spec.wheelRadius * 0.6) }
  ;[p, gl, t, h, tl].forEach((k) => k.dispose())
  return out
}

export function buildBoxVehicle(spec: VehicleSpec, kind: 'van' | 'bus', color: string): CarRig {
  const key = kind
  let parts = cache.get(key)
  if (!parts) { parts = kind === 'van' ? vanParts(spec) : busParts(spec); cache.set(key, parts) }
  const root = new Group(), body = new Group()
  root.add(body)
  const paint = new MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.35, envMapIntensity: 1 })
  const tail = new MeshStandardMaterial({ color: '#7a0c0c', emissive: '#ff1a1a', emissiveIntensity: 0.15 })
  const head = new MeshStandardMaterial({ color: '#dfe9f5', emissive: '#fff2cc', emissiveIntensity: 0.1 })
  if (parts.paint) { const m = new Mesh(parts.paint, paint); m.castShadow = true; body.add(m) }
  if (parts.glass) body.add(new Mesh(parts.glass, glassMat()))
  if (parts.trim) body.add(new Mesh(parts.trim, trimMat()))
  if (parts.head) body.add(new Mesh(parts.head, head))
  if (parts.tail) body.add(new Mesh(parts.tail, tail))
  const wheels: Group[] = [], pivots: Group[] = []
  const zs: [number, number][] = [[-1, spec.wheelBase / 2], [1, spec.wheelBase / 2], [-1, -spec.wheelBase / 2], [1, -spec.wheelBase / 2]]
  for (const [sx, z] of zs) {
    const pivot = new Group()
    pivot.position.set(sx * (spec.width / 2 - 0.2), spec.wheelRadius, z)
    const spin = new Group()
    const wm = new Mesh(parts.wheel, wheelMat())
    if (sx < 0) wm.rotation.y = Math.PI
    spin.add(wm); pivot.add(spin); root.add(pivot)
    wheels.push(spin)
    if (z > 0) pivots.push(pivot)
  }
  return {
    root, body, wheels, steerPivots: pivots, paintMats: [paint], tailMat: tail, headMat: head, kind, spec,
    dispose: () => { paint.dispose(); tail.dispose(); head.dispose() },
  }
}

// ------------------------------------------------------------------ two wheelers
function wheel2(r: number, w: number, bicycle: boolean): BufferGeometry {
  const k = new Kit()
  if (bicycle) {
    k.add('w', new TorusGeometry(r - 0.02, 0.022, 6, 28), [0.06, 0.06, 0.07], new Matrix4().makeRotationY(Math.PI / 2))
    for (let i = 0; i < 4; i++) k.box('w', 0, 0, 0, 0.01, (r - 0.03) * 2, 0.008, [0.7, 0.72, 0.75], (i * Math.PI) / 4, 0, 0)
    k.cyl('w', 0, 0, 0, 0.03, 0.08, 'x', [0.5, 0.5, 0.5], 8)
  } else {
    k.cyl('w', 0, 0, 0, r, w, 'x', [0.06, 0.06, 0.07], 22)
    k.cyl('w', 0, 0, 0, r * 0.6, w * 1.03, 'x', [0.62, 0.64, 0.67], 16)
    k.cyl('w', 0, 0, 0, r * 0.18, w * 1.06, 'x', [0.2, 0.2, 0.22], 8)
  }
  const g = k.build('w')!
  k.dispose()
  return g
}

export function buildTwoWheeler(spec: VehicleSpec, kind: 'moto' | 'bicycle', color: string, riderColor = '#222831'): CarRig {
  const root = new Group(), body = new Group()
  root.add(body)
  const paint = new MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3, envMapIntensity: 1.2 })
  const tail = new MeshStandardMaterial({ color: '#7a0c0c', emissive: '#ff1a1a', emissiveIntensity: 0.15 })
  const head = new MeshStandardMaterial({ color: '#dfe9f5', emissive: '#fff2cc', emissiveIntensity: 0.1 })
  const hz = spec.wheelBase / 2
  const r = spec.wheelRadius
  const frame = new Kit(), pk = new Kit(), fk = new Kit()
  const skin: [number, number, number] = [0.85, 0.65, 0.5]
  const rc = (() => { const n = parseInt(riderColor.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as [number, number, number] })()
  const pant: [number, number, number] = [0.1, 0.12, 0.2]
  let cranks: Group | undefined
  if (kind === 'moto') {
    // frame & engine
    frame.box('d', 0, 0.45, 0.02, 0.3, 0.36, 0.5, [0.12, 0.12, 0.14])
    frame.box('d', 0, 0.8, -0.34, 0.3, 0.1, 0.62, [0.04, 0.04, 0.05]) // seat
    frame.bar('d', [0, 0.42, -0.1], [0, r, -hz], 0.04, [0.15, 0.15, 0.17])
    frame.bar('d', [0.17, 0.33, -0.28], [0.2, 0.52, -0.98], 0.045, [0.7, 0.72, 0.75]) // exhaust
    frame.box('d', 0, 0.62, -0.05, 0.12, 0.34, 0.5, [0.1, 0.1, 0.12])
    pk.add('p', rbox(0.34, 0.24, 0.52, 0.09), [1, 1, 1], T(0, 0.88, 0.14)) // tank
    pk.add('p', rbox(0.28, 0.14, 0.4, 0.06), [1, 1, 1], T(0, 0.9, -0.82)) // tail
    // fork + front wheel group (origin at front axle)
    const hy = 1.05 - r, hzz = -0.3
    fk.bar('d', [0.14, hy, hzz], [0.12, 0, 0], 0.025, [0.7, 0.72, 0.75])
    fk.bar('d', [-0.14, hy, hzz], [-0.12, 0, 0], 0.025, [0.7, 0.72, 0.75])
    fk.bar('d', [-0.38, hy + 0.1, hzz - 0.05], [0.38, hy + 0.1, hzz - 0.05], 0.022, [0.08, 0.08, 0.09])
    fk.sphere('h', 0, hy - 0.1, hzz + 0.14, 0.12, [1, 1, 1], 1, 1, 0.8)
    fk.box('d', 0, 0.28, 0.0, 0.14, 0.04, 0.5, [0.1, 0.1, 0.12])
    // rider
    frame.bar('r', [0, 0.95, -0.4], [0, 1.45, -0.08], 0.17, rc, 10)
    frame.sphere('r', 0, 1.62, -0.0, 0.13, rc, 1, 1.05, 1.1)
    frame.box('r', 0, 1.62, 0.1, 0.18, 0.08, 0.05, [0.05, 0.05, 0.08])
    for (const sx of [-1, 1]) {
      frame.bar('r', [sx * 0.2, 1.4, -0.05], [sx * 0.34, 1.07 + 0, 0.28], 0.055, rc, 8)
      frame.bar('r', [sx * 0.16, 0.95, -0.4], [sx * 0.24, 0.74, 0.08], 0.075, pant, 8)
      frame.bar('r', [sx * 0.24, 0.74, 0.08], [sx * 0.22, 0.34, -0.14], 0.06, pant, 8)
    }
  } else {
    // bicycle frame
    const col: [number, number, number] = [0.08, 0.1, 0.12]
    frame.bar('d', [0, 0.35, 0.0], [0, 0.78, -0.2], 0.018, col) // seat tube
    frame.bar('d', [0, 0.35, 0.0], [0, 0.72, 0.32], 0.02, col) // down tube
    frame.bar('d', [0, 0.78, -0.2], [0, 0.78, 0.3], 0.02, col) // top tube
    frame.bar('d', [0, 0.35, 0.0], [0, r, -hz], 0.014, col)
    frame.bar('d', [0, 0.78, -0.2], [0, r, -hz], 0.014, col)
    frame.box('d', 0, 0.82, -0.22, 0.12, 0.03, 0.2, [0.05, 0.05, 0.06])
    fk.bar('d', [0, 0.84, 0.3], [0, 0, 0], 0.016, col)
    fk.bar('d', [-0.2, 0.9, 0.3], [0.2, 0.9, 0.3], 0.014, [0.08, 0.08, 0.09])
    frame.bar('r', [0, 0.88, -0.22], [0, 1.4, -0.06], 0.14, rc, 10)
    frame.sphere('r', 0, 1.56, 0.0, 0.11, [0.9, 0.2, 0.2], 1, 1, 1.15)
    for (const sx of [-1, 1]) frame.bar('r', [sx * 0.2, 1.35, -0.06], [sx * 0.2, 0.92, 0.3], 0.045, rc, 8)
    // legs animate via cranks group
    cranks = new Group()
    cranks.position.set(0, 0.35, 0)
    const ck = new Kit()
    for (const sx of [-1, 1]) {
      ck.bar('c', [sx * 0.1, 0, 0], [sx * 0.1, sx * 0.17, 0], 0.014, [0.3, 0.3, 0.33])
      ck.bar('c', [sx * 0.1, sx * 0.17, 0], [sx * 0.12, sx * 0.17 + 0.0, 0.0], 0.02, [0.1, 0.1, 0.1])
    }
    const cg = ck.build('c')
    if (cg) cranks.add(new Mesh(cg, trimMat()))
    ck.dispose()
    body.add(cranks)
    // static thigh/shin approximations
    for (const sx of [-1, 1]) {
      frame.bar('r', [sx * 0.12, 0.88, -0.22], [sx * 0.12, 0.6, 0.06], 0.07, pant, 8)
      frame.bar('r', [sx * 0.12, 0.6, 0.06], [sx * 0.12, 0.38 + (sx > 0 ? 0.08 : -0.02), 0.02], 0.055, pant, 8)
    }
  }
  const g1 = frame.build('d'), g2 = frame.build('r'), gp = pk.build('p'), gh = fk.build('h')
  const fkd = fk.build('d')
  if (g1) body.add(new Mesh(g1, trimMat()))
  if (g2) body.add(new Mesh(g2, trimMat()))
  if (gp) { const m = new Mesh(gp, paint); m.castShadow = true; body.add(m) }
  const wg = wheel2(r, spec.wheelRadius * 0.62, kind === 'bicycle')
  // rear wheel
  const rearSpin = new Group()
  const rearPivot = new Group()
  rearPivot.position.set(0, r, -hz)
  rearSpin.add(new Mesh(wg, wheelMat()))
  rearPivot.add(rearSpin)
  body.add(rearPivot)
  // front assembly pivot is at front axle (so fork geometry is relative to it)
  const frontPivot = new Group()
  frontPivot.position.set(0, r, hz)
  const frontSpin = new Group()
  frontSpin.add(new Mesh(wg, wheelMat()))
  frontPivot.add(frontSpin)
  if (fkd) { const m = new Mesh(fkd, trimMat()); frontPivot.add(m) }
  if (gh) frontPivot.add(new Mesh(gh, head))
  body.add(frontPivot)
  if (kind === 'moto') {
    const t = new Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.04, 2, 0.015), tail)
    t.position.set(0, 0.9, -0.97)
    body.add(t)
  }
  frame.dispose(); pk.dispose(); fk.dispose()
  return {
    root, body, wheels: [frontSpin, rearSpin], steerPivots: [frontPivot], paintMats: [paint], tailMat: tail, headMat: head,
    kind, spec, cranks, dispose: () => { paint.dispose(); tail.dispose(); head.dispose() },
  }
}
