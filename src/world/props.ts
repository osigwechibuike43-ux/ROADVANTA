import { BoxGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from 'three'
import { Kit } from '../vehicles/kit'
import { Batch } from './batch'
import { city, CURB, N, nodeX, nodeZ, roadHalf } from './city'

/** Geometry builders for instanced street furniture. All geometry is vertex-coloured. */

export const treeGeometry = (variant: number): BufferGeometry => {
  const k = new Kit()
  const trunk: [number, number, number] = [0.32, 0.22, 0.14]
  const leaf: [number, number, number][] = [[0.2, 0.45, 0.16], [0.26, 0.5, 0.18], [0.16, 0.38, 0.14]]
  k.cyl('t', 0, 1.5, 0, 0.16, 3, 'y', trunk, 7, 0.24)
  if (variant === 0) {
    k.add('t', new SphereGeometry(1.9, 9, 7), leaf[0], new Matrix4().compose(new Vector3(0, 4.4, 0), new Quaternion(), new Vector3(1, 1.15, 1)))
    k.add('t', new SphereGeometry(1.4, 8, 6), leaf[1], new Matrix4().makeTranslation(0.9, 5.4, 0.4))
  } else if (variant === 1) {
    k.add('t', new SphereGeometry(2.1, 9, 7), leaf[1], new Matrix4().compose(new Vector3(0, 4.6, 0), new Quaternion(), new Vector3(1.1, 0.95, 1.1)))
    k.add('t', new SphereGeometry(1.2, 8, 6), leaf[0], new Matrix4().makeTranslation(-1.1, 4.0, 0.7))
  } else {
    k.add('t', new CylinderGeometry(0.05, 1.7, 3.6, 8), leaf[2], new Matrix4().makeTranslation(0, 4.1, 0))
    k.add('t', new CylinderGeometry(0.05, 1.2, 2.6, 8), leaf[2], new Matrix4().makeTranslation(0, 6.0, 0))
  }
  const g = k.build('t')!
  k.dispose()
  return g
}

export const lampGeometry = (): BufferGeometry => {
  const k = new Kit()
  const metal: [number, number, number] = [0.22, 0.24, 0.27]
  k.cyl('p', 0, 3.7, 0, 0.09, 7.4, 'y', metal, 8, 0.12)
  k.box('p', 0.9, 7.35, 0, 1.9, 0.1, 0.12, metal)
  k.box('p', 1.75, 7.28, 0, 0.7, 0.14, 0.3, [0.3, 0.32, 0.35])
  return (() => { const g = k.build('p')!; k.dispose(); return g })()
}
/** The emissive lamp head, rendered separately so it can glow at night. */
export const lampHeadGeometry = (): BufferGeometry => new BoxGeometry(0.6, 0.06, 0.24).translate(1.75, 7.18, 0)

export const busStopGeometry = (): BufferGeometry => {
  const k = new Kit()
  const m: [number, number, number] = [0.25, 0.28, 0.32]
  for (const sx of [-1.5, 1.5]) k.box('p', sx, 1.2, -0.2, 0.08, 2.4, 0.08, m)
  k.box('p', 0, 2.45, 0, 3.4, 0.1, 1.3, [0.18, 0.2, 0.24])
  k.box('p', 0, 1.3, -0.62, 3.0, 1.9, 0.04, [0.55, 0.72, 0.8])
  k.box('p', 0, 0.55, -0.35, 2.2, 0.08, 0.4, [0.5, 0.35, 0.22])
  k.box('p', 1.8, 1.5, 0.4, 0.04, 1.6, 0.04, [0.3, 0.3, 0.3])
  k.box('p', 1.8, 2.2, 0.4, 0.5, 0.5, 0.05, [0.1, 0.4, 0.8])
  const g = k.build('p')!
  k.dispose()
  return g
}

export const benchGeometry = (): BufferGeometry => {
  const k = new Kit()
  k.box('p', 0, 0.45, 0, 1.6, 0.08, 0.42, [0.5, 0.34, 0.2])
  k.box('p', 0, 0.8, -0.2, 1.6, 0.36, 0.06, [0.5, 0.34, 0.2])
  for (const sx of [-0.7, 0.7]) k.box('p', sx, 0.22, 0, 0.08, 0.44, 0.4, [0.2, 0.2, 0.22])
  const g = k.build('p')!
  k.dispose()
  return g
}

export const binGeometry = (): BufferGeometry => {
  const k = new Kit()
  k.cyl('p', 0, 0.45, 0, 0.26, 0.9, 'y', [0.2, 0.38, 0.28], 10)
  k.cyl('p', 0, 0.92, 0, 0.28, 0.06, 'y', [0.15, 0.15, 0.16], 10)
  const g = k.build('p')!
  k.dispose()
  return g
}

export const hydrantGeometry = (): BufferGeometry => {
  const k = new Kit()
  k.cyl('p', 0, 0.35, 0, 0.14, 0.7, 'y', [0.8, 0.12, 0.1], 8)
  k.sphere('p', 0, 0.72, 0, 0.15, [0.8, 0.12, 0.1])
  k.cyl('p', 0, 0.45, 0, 0.1, 0.4, 'x', [0.75, 0.1, 0.08], 6)
  const g = k.build('p')!
  k.dispose()
  return g
}

export const fenceGeometry = (): Batch => {
  const b = new Batch()
  for (const f of city.fences) {
    const dx = f.x1 - f.x0, dz = f.z1 - f.z0
    const len = Math.hypot(dx, dz)
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2
    const alongX = Math.abs(dx) > Math.abs(dz)
    const w = alongX ? len : 0.22, d = alongX ? 0.22 : len
    if (f.solid) {
      b.box(cx, 0, cz, w, f.h, d, { color: [0.82, 0.78, 0.72], tileU: 3, tileV: 3 })
      b.box(cx, f.h, cz, w + 0.1, 0.12, d + 0.1, { color: [0.62, 0.6, 0.56] })
    } else {
      const col: [number, number, number] = [0.15, 0.17, 0.2]
      const nPost = Math.max(2, Math.floor(len / 2.2) + 1)
      for (let i = 0; i < nPost; i++) {
        const t = i / (nPost - 1)
        b.box(f.x0 + dx * t, 0, f.z0 + dz * t, 0.1, f.h, 0.1, { color: col })
      }
      b.box(cx, f.h - 0.15, cz, alongX ? len : 0.05, 0.06, alongX ? 0.05 : len, { color: col })
      b.box(cx, 0.35, cz, alongX ? len : 0.05, 0.06, alongX ? 0.05 : len, { color: col })
      const bars = Math.floor(len / 0.18)
      for (let i = 0; i < bars; i++) {
        const t = (i + 0.5) / bars
        b.box(f.x0 + dx * t, 0.3, f.z0 + dz * t, 0.03, f.h - 0.35, 0.03, { color: col })
      }
    }
  }
  return b
}

/** Traffic signal pole + head per approach (pole at the far-right corner of the stop line). */
export interface SignalHead { x: number; z: number; gx: number; gz: number; axis: 'x' | 'z'; dir: number; rot: number }
export const signalHeads: SignalHead[] = []
for (let gz = 0; gz < N; gz++)
  for (let gx = 0; gx < N; gx++) {
    const hx = roadHalf(gx), hz = roadHalf(gz)
    // vehicles arriving from +x travel -x; vehicles arriving from -x travel +x; etc.
    const approach: { dx: number; dz: number }[] = [{ dx: -1, dz: 0 }, { dx: 1, dz: 0 }, { dx: 0, dz: -1 }, { dx: 0, dz: 1 }]
    for (const a of approach) {
      const axis: 'x' | 'z' = a.dx !== 0 ? 'x' : 'z'
      // pole stands at the kerb corner just before the intersection on the driver's right
      const rx = -a.dz, rz = a.dx
      const sx = nodeX(gx) - a.dx * (hx + 5.2) + rx * (hx + 0.7)
      const sz = nodeZ(gz) - a.dz * (hz + 5.2) + rz * (hz + 0.7)
      if (axis === 'x' && ((a.dx > 0 && gx === 0) || (a.dx < 0 && gx === N - 1))) continue
      if (axis === 'z' && ((a.dz > 0 && gz === 0) || (a.dz < 0 && gz === N - 1))) continue
      signalHeads.push({ x: sx, z: sz, gx, gz, axis, dir: a.dx !== 0 ? a.dx : a.dz, rot: Math.atan2(-a.dx, -a.dz) })
    }
  }

export const signalPoleGeometry = (): BufferGeometry => {
  const k = new Kit()
  k.cyl('p', 0, 2.6, 0, 0.07, 5.2, 'y', [0.2, 0.22, 0.25], 8, 0.09)
  k.box('p', 0, 5.0, 0.06, 0.38, 1.1, 0.26, [0.07, 0.07, 0.08])
  k.box('p', 0, 3.0, 0.08, 0.5, 0.35, 0.05, [0.9, 0.9, 0.9]) // pedestrian sign plate
  const g = k.build('p')!
  k.dispose()
  return g
}

export const containerWallGeometry = (): BufferGeometry => new BoxGeometry(1, 1, 1)
void CURB
