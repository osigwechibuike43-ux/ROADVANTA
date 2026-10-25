export const TAU = Math.PI * 2
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt))
export const sign = (v: number) => (v < 0 ? -1 : 1)

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}
export const angleDiff = (target: number, current: number) => wrapAngle(target - current)
export function dampAngle(cur: number, target: number, lambda: number, dt: number) {
  return cur + angleDiff(target, cur) * (1 - Math.exp(-lambda * dt))
}

/** Deterministic PRNG so the city is identical on every launch. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rng = () => number
export const rr = (r: Rng, a: number, b: number) => a + (b - a) * r()
export const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length]

/** Unseeded helpers for gameplay randomness. */
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
export const randPick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const formatTime = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`
}
