import { describe, expect, it } from 'vitest'
import { PROGRESSION } from '../src/config/game'
import { MISSIONS } from '../src/config/missions'
import { VEHICLES, effectiveSpec, vehicleStats } from '../src/config/vehicles'
import { defaultSave, sanitize } from '../src/core/save'
import { buildRoute, findPath, signal } from '../src/sim/nav'
import { createBody, newInput, stepVehicle } from '../src/vehicles/physics'

describe('save validation', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitize(null)).toEqual(defaultSave())
    expect(sanitize({ version: 1, coins: 'abc', owned: [1] }).coins).toBe(defaultSave().coins)
  })
  it('clamps absurd numbers and keeps the starter car', () => {
    const s = sanitize({ ...defaultSave(), coins: -50, level: 9999 })
    expect(s.coins).toBeGreaterThanOrEqual(0)
    expect(s.level).toBeLessThanOrEqual(PROGRESSION.maxLevel)
    expect(s.owned.length).toBeGreaterThan(0)
  })
  it('round-trips a valid save', () => {
    const s = defaultSave()
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})

describe('progression & config', () => {
  it('xp requirement grows monotonically', () => {
    for (let l = 1; l < PROGRESSION.maxLevel; l++) expect(PROGRESSION.xpForLevel(l + 1)).toBeGreaterThan(PROGRESSION.xpForLevel(l))
  })
  it('missions are well formed', () => {
    const ids = new Set(MISSIONS.map((m) => m.id))
    expect(ids.size).toBe(MISSIONS.length)
    for (const m of MISSIONS) {
      expect(m.reward.coins).toBeGreaterThan(0)
      expect(m.start.gx).toBeGreaterThanOrEqual(0)
      if (m.type === 'race') expect(m.points.length).toBeGreaterThan(1)
    }
  })
  it('upgrades improve garage stats', () => {
    const v = VEHICLES[0]
    expect(vehicleStats(effectiveSpec(v, { engine: 3, tires: 3, brakes: 3 })).topSpeed).toBeGreaterThan(vehicleStats(v).topSpeed)
  })
})

describe('vehicle physics', () => {
  it('accelerates, stays finite and brakes to a stop', () => {
    const b = createBody(VEHICLES[0], 0, 0, 0)
    const inp = newInput()
    inp.throttle = 1
    for (let i = 0; i < 600; i++) stepVehicle(b, inp, 1 / 60)
    expect(b.speed).toBeGreaterThan(20)
    expect(b.speed).toBeLessThanOrEqual(VEHICLES[0].maxSpeed * 1.05)
    inp.throttle = 0; inp.brake = 1
    for (let i = 0; i < 600; i++) stepVehicle(b, inp, 1 / 60)
    expect(Number.isFinite(b.x) && Number.isFinite(b.z)).toBe(true)
  })
  it('right steer turns right (heading decreases)', () => {
    const b = createBody(VEHICLES[0], 0, 0, 0)
    const inp = newInput(); inp.throttle = 0.6; inp.steer = 1
    for (let i = 0; i < 180; i++) stepVehicle(b, inp, 1 / 60)
    expect(b.heading).toBeLessThan(-0.1)
  })
})

describe('navigation', () => {
  it('finds paths on the grid and resamples routes finely', () => {
    const path = findPath([0, 0], 1, [6, 6])
    expect(path && path.length).toBeGreaterThan(2)
    const r = buildRoute(path!, path!.map(() => 0))
    let maxGap = 0
    for (let i = 1; i < r.n; i++) maxGap = Math.max(maxGap, r.s[i] - r.s[i - 1])
    expect(maxGap).toBeLessThanOrEqual(3.6)
  })
  it('signals alternate between axes', () => {
    const seen = new Set<string>()
    for (let t = 0; t < 40; t += 0.5) seen.add(`${signal(2, 2, 'x', t)}/${signal(2, 2, 'z', t)}`)
    expect(seen.has('green/red') && seen.has('red/green')).toBe(true)
  })
})
