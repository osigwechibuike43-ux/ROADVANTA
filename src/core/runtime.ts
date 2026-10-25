import type { VehicleBody } from '../vehicles/physics'

/**
 * Mutable, non-React game state. Everything that changes every frame lives here so React
 * never re-renders during driving; the UI reads throttled snapshots through the zustand store.
 */

export interface Pedestrian {
  x: number; z: number; vx: number; vz: number
  active: boolean
  down: number // >0 while knocked over (seconds)
}

export const rt = {
  time: 0, // simulated seconds (advances only while playing)
  paused: true,
  playing: false,
  countdown: 0, // >0 freezes vehicles while the race countdown runs
  timeOfDay: 0.38, // 0..1 (0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
  night: 0, // 0..1 smoothed darkness
  player: null as VehicleBody | null,
  bodies: [] as VehicleBody[], // every dynamic vehicle for collision resolution
  peds: [] as Pedestrian[],
  camera: 0, // 0 chase, 1 far chase, 2 cockpit
  shake: 0,
  lastImpact: 0,
  sirenNear: 0, // 0..1 loudness of the closest police siren
  wanted: 0, // 0 none, 1..3 stars
  trafficNear: 0,
  fps: 60,
  debug: false,
  speedKmh: 0,
}

export type PlayEvent =
  | { type: 'crash'; impact: number; x: number; z: number; kind: string }
  | { type: 'ped-hit' }
  | { type: 'red-light' }
  | { type: 'horn' }

const listeners = new Set<(e: PlayEvent) => void>()
export const onPlayEvent = (fn: (e: PlayEvent) => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export const emit = (e: PlayEvent) => listeners.forEach((l) => l(e))
