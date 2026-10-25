import { POLICE, PROGRESSION } from '../config/game'
import { getMission, MISSION_TYPE_LABEL, type MissionDef } from '../config/missions'
import { effectiveSpec, getVehicle, VEHICLES } from '../config/vehicles'
import { clamp, formatTime, mulberry32 } from '../core/math'
import { emit, onPlayEvent, rt } from '../core/runtime'
import { customOf, useStore, type Mode, type ResultData, type SessionRequest } from '../core/store'
import { fleet } from '../sim/fleet'
import { buildRoute, DIRS, inGrid, nearestNode, signal } from '../sim/nav'
import { resetPeds } from '../sim/pedestrians'
import { clearPolice, spawnPoliceUnit, updatePolice, policeAgents } from '../sim/police'
import { clearRacers, CP_RADIUS, progressScore, spawnRacers, updateRacers } from '../sim/race'
import { resetTraffic } from '../sim/traffic'
import { createBody, resetBody, setSpec, type ControlInput } from '../vehicles/physics'
import { nodeX, nodeZ, roadHalf } from '../world/city'
import { SHOWROOM } from '../world/World'
import type { Agent } from '../sim/agents'

/** Mission / mode state machine. Pure game logic — no React, no rendering. */

export interface Marker { x: number; z: number; color: string; radius: number; kind: 'goal' | 'checkpoint' | 'next' | 'pickup' | 'dropoff' | 'safe' }

export const playerBody = createBody(VEHICLES[0], SHOWROOM.x, SHOWROOM.z, 0.6)
rt.player = playerBody
rt.bodies.push(playerBody)

type Phase = 'idle' | 'countdown' | 'running' | 'ended'

export const S = {
  phase: 'idle' as Phase,
  mode: 'free' as Mode,
  mission: null as MissionDef | null,
  nonce: -1,
  t: 0,
  countdown: 0,
  stage: 0,
  markers: [] as Marker[],
  distance: 0,
  lastBodyDist: 0,
  hold: 0,
  drift: 0,
  escapeT: 0,
  bustedT: 0,
  heat: 0,
  quietT: 0,
  inNode: -1,
  racers: [] as Agent[],
  playerCp: 0,
  position: 1,
  msg: '',
  msgKind: 'info' as 'info' | 'good' | 'bad',
  msgT: 0,
  hudT: 0,
  nearestPolice: Infinity,
  speedingT: 0,
  graceT: 0,
  fines: 0,
}

const say = (msg: string, kind: 'info' | 'good' | 'bad' = 'info', t = 2.6) => { S.msg = msg; S.msgKind = kind; S.msgT = t }

export function applyPlayerSpec() {
  const st = useStore.getState()
  const base = getVehicle(st.save.selected)
  const c = customOf(st.save, base.id)
  setSpec(playerBody, effectiveSpec(base, c.upgrades))
}

export function clearWorld() {
  fleet.clear()
  resetTraffic()
  clearPolice()
  clearRacers()
  resetPeds()
  rt.bodies.length = 0
  rt.bodies.push(playerBody)
  rt.wanted = 0
  rt.sirenNear = 0
}

/** Puts the selected car on the showroom turntable for menus. */
export function enterMenu() {
  S.phase = 'idle'
  S.mission = null
  S.markers = []
  clearWorld()
  applyPlayerSpec()
  resetBody(playerBody, SHOWROOM.x, SHOWROOM.z, 0.6)
  rt.playing = false
  rt.countdown = 0
}

function placePlayer(gx: number, gz: number, dir: number, startAt: number) {
  let d = dir
  let nx = gx + DIRS[d][0], nz = gz + DIRS[d][1]
  if (!inGrid(nx, nz)) { d = (d + 2) % 4; nx = gx + DIRS[d][0]; nz = gz + DIRS[d][1] }
  const r = buildRoute([[gx, gz], [nx, nz]], [0], { startAt })
  resetBody(playerBody, r.x[0], r.z[0], Math.atan2(DIRS[d][0], DIRS[d][1]))
}

const MARK = { goal: '#ff6a2b', checkpoint: '#34c3ff', next: '#34c3ff', pickup: '#ffd23a', dropoff: '#4cd964', safe: '#4cd964' }
const mk = (gx: number, gz: number, kind: Marker['kind'], radius = 11): Marker => ({ x: nodeX(gx), z: nodeZ(gz), kind, color: MARK[kind], radius })

export function startFromRequest(req: SessionRequest) {
  S.nonce = req.nonce
  const m = req.missionId ? getMission(req.missionId) ?? null : null
  clearWorld()
  applyPlayerSpec()
  Object.assign(S, {
    mode: req.mode, mission: m, t: 0, stage: 0, distance: 0, hold: 0, drift: 0, escapeT: 0, bustedT: 0, heat: 0, quietT: 0,
    inNode: -1, racers: [], playerCp: 0, position: 1, msg: '', msgT: 0, hudT: 0, nearestPolice: Infinity, speedingT: 0, graceT: 4, fines: 0,
  })
  rt.playing = true
  rt.time = 0
  rt.camera = 0
  const start = m ? m.start : { gx: 3, gz: 1, dir: 1 }
  let startAt = 24
  if (m?.type === 'race') {
    const slots = [40, 31, 22, 13]
    const rng = mulberry32(Date.now() & 0xffff)
    const mine = Math.floor(rng() * Math.min(slots.length, (m.opponents ?? 0) + 1))
    const others = slots.filter((_, i) => i !== mine).slice(0, m.opponents ?? 0)
    startAt = slots[mine]
    placePlayer(start.gx, start.gz, start.dir, startAt)
    S.racers = spawnRacers(m, others)
  } else placePlayer(start.gx, start.gz, start.dir, startAt)
  S.lastBodyDist = playerBody.distance
  playerBody.distance = 0
  S.lastBodyDist = 0

  S.markers = []
  if (m) {
    if (m.type === 'destination' || m.type === 'timed') S.markers = [mk(m.points[0][0], m.points[0][1], 'goal')]
    else if (m.type === 'delivery') S.markers = [mk(m.points[0][0], m.points[0][1], 'pickup')]
    else if (m.type === 'police') S.markers = [mk(m.points[0][0], m.points[0][1], 'safe', 12)]
    else if (m.type === 'race') S.markers = [mk(m.points[0][0], m.points[0][1], 'next', CP_RADIUS)]
  }
  if (m?.type === 'race') {
    S.phase = 'countdown'
    S.countdown = 4.2
    rt.countdown = S.countdown
  } else {
    S.phase = 'running'
    S.countdown = 0
    rt.countdown = 0
    say(m ? m.title : 'Free drive — explore the city', 'info', 3.4)
  }
  if (m?.type === 'police') {
    for (let i = 0; i < (m.police ?? 1); i++) spawnPoliceUnit(playerBody, playerBody.spec.maxSpeed, { min: 90 + i * 25, max: 160 + i * 25 })
    rt.wanted = Math.min(3, m.police ?? 1)
  }
}

// ---------------------------------------------------------------- events
let eventsHooked = false
export function hookEvents() {
  if (eventsHooked) return
  eventsHooked = true
  onPlayEvent((e) => {
    if (S.phase !== 'running' || S.mode !== 'free') return
    if (e.type === 'crash' && e.kind === 'vehicle' && e.impact > 4) { S.heat += 18 + e.impact * 1.5; S.quietT = 0 }
    if (e.type === 'ped-hit') { S.heat += 70; S.quietT = 0; say('Pedestrian hit! Police alerted', 'bad') }
  })
}

// ---------------------------------------------------------------- rewards
function finish(success: boolean, title: string, subtitle: string, extra: { position?: number } = {}) {
  if (S.phase === 'ended') return
  S.phase = 'ended'
  const m = S.mission
  const st = useStore.getState()
  const before = st.save.level
  let coins = 0, xp = 0, bonus = 0
  let bonusLabel: string | undefined
  const details: string[] = []
  const replay = !!(m && (st.save.completed[m.id]?.count ?? 0) > 0)
  if (m && success) {
    coins = Math.round(m.reward.coins * PROGRESSION.missionRewardScale)
    xp = m.reward.xp
    if (m.type === 'race' && extra.position) {
      const cf = [1, 0.6, 0.35, 0.15][extra.position - 1] ?? 0.1
      const xf = [1, 0.7, 0.5, 0.3][extra.position - 1] ?? 0.2
      coins = Math.round(coins * cf); xp = Math.round(xp * xf)
      details.push(`Finished P${extra.position} of ${(m.opponents ?? 0) + 1}`)
    }
    if (m.parTime && S.t <= m.parTime && (m.type !== 'race' || extra.position === 1)) {
      bonus = Math.round(coins * 0.25)
      bonusLabel = `Par time bonus (${formatTime(m.parTime)})`
    }
    if (replay) {
      coins = Math.round(coins * PROGRESSION.replayRewardFactor)
      xp = Math.round(xp * PROGRESSION.replayRewardFactor)
      bonus = Math.round(bonus * PROGRESSION.replayRewardFactor)
      details.push(`Replay: rewards reduced to ${Math.round(PROGRESSION.replayRewardFactor * 100)}%`)
    }
  }
  const res = success && m
    ? st.applyReward({ coins: coins + bonus, xp, missionId: m.id, time: m.type === 'distance' || m.type === 'police' ? undefined : S.t })
    : { levelBefore: before, levelAfter: before, unlocks: [] as string[] }
  const data: ResultData = {
    success, title, subtitle, missionId: m?.id, time: S.t, coins, xp, bonus, bonusLabel,
    levelBefore: res.levelBefore, levelAfter: res.levelAfter, details, unlocks: res.unlocks, replay,
  }
  if (m) details.unshift(`${MISSION_TYPE_LABEL[m.type]} · difficulty ${'★'.repeat(m.difficulty)}`)
  st.addDistance(playerBody.distance)
  st.setResults(data)
  st.go('results')
}

// ---------------------------------------------------------------- free-drive wanted level
function freeDriveWanted(dt: number) {
  const p = playerBody
  const kmh = Math.abs(p.speed) * 3.6
  if (kmh > 118) { S.heat += (kmh - 118) * 0.07 * dt * 3; S.speedingT += dt } else S.speedingT = Math.max(0, S.speedingT - dt)
  // red-light running
  const [gx, gz] = nearestNode(p.x, p.z)
  const inside = Math.abs(p.x - nodeX(gx)) < roadHalf(gx) && Math.abs(p.z - nodeZ(gz)) < roadHalf(gz)
  const key = gx * 10 + gz
  if (inside && S.inNode !== key) {
    S.inNode = key
    const axis = Math.abs(Math.sin(p.heading)) > Math.abs(Math.cos(p.heading)) ? 'x' : 'z'
    if (signal(gx, gz, axis, rt.time) === 'red' && Math.abs(p.speed) > 5) {
      S.heat += 45; S.quietT = 0
      say('Ran a red light!', 'bad')
    }
  } else if (!inside && S.inNode === key) S.inNode = -1
  S.quietT += dt
  const pol = policeAgents()
  if (pol.length === 0) {
    if (S.quietT > 3) S.heat = Math.max(0, S.heat - 4 * dt)
    if (S.heat >= 100 && S.graceT <= 0) {
      const n = S.heat >= 220 ? 2 : 1
      for (let i = 0; i < n; i++) spawnPoliceUnit(p, p.spec.maxSpeed, { min: 100, max: 170, behind: true })
      rt.wanted = n
      S.escapeT = 0; S.bustedT = 0
      say('Police pursuit! Lose them or get fined', 'bad', 3.2)
    }
  } else {
    S.heat = Math.max(S.heat, 100)
  }
}

function policeLogic(dt: number, mission: boolean) {
  const p = playerBody
  const nearest = updatePolice(dt, p, true)
  S.nearestPolice = nearest
  if (nearest < POLICE.catchRadius && Math.abs(p.speed) < 16) S.bustedT += dt
  else S.bustedT = Math.max(0, S.bustedT - dt * 1.2)
  if (nearest > POLICE.escapeDistance) S.escapeT += dt
  else S.escapeT = Math.max(0, S.escapeT - dt * 1.5)
  if (S.bustedT >= POLICE.catchTime) {
    if (mission) finish(false, 'Busted!', 'The patrol cars boxed you in.')
    else {
      const fine = Math.min(500, Math.round(useStore.getState().save.coins * 0.1))
      useStore.getState().addCoins(-fine)
      clearPolice(); S.heat = 0; S.bustedT = 0; S.escapeT = 0; rt.wanted = 0
      placePlayer(3, 1, 1, 24)
      say(`Busted! Fine: ${fine} coins`, 'bad', 4)
    }
  } else if (S.escapeT >= POLICE.escapeTime) {
    if (mission) {
      finish(true, 'You lost them!', 'The patrol cars lost your trail.')
    } else {
      clearPolice(); S.heat = 0; S.escapeT = 0; rt.wanted = 0
      useStore.getState().applyReward({ coins: 0, xp: 40 })
      say('Escaped the police! +40 XP', 'good', 3.2)
    }
  }
}

// ---------------------------------------------------------------- per-step update
export function updateSession(dt: number) {
  if (S.phase === 'idle' || S.phase === 'ended') return
  const p = playerBody
  const m = S.mission
  S.msgT = Math.max(0, S.msgT - dt)
  S.graceT = Math.max(0, S.graceT - dt)

  if (S.phase === 'countdown') {
    const before = Math.ceil(S.countdown)
    S.countdown -= dt
    rt.countdown = S.countdown
    if (m?.type === 'race') updateRacers(dt, m, S.racers, 0, 0, true)
    const after = Math.ceil(S.countdown)
    if (after !== before && after >= 1 && after <= 3) say(String(after), 'info', 0.9)
    if (S.countdown <= 0) { S.phase = 'running'; rt.countdown = 0; say('GO!', 'good', 1.4) }
    return
  }

  S.t += dt
  S.distance += Math.max(0, p.distance - S.lastBodyDist)
  S.lastBodyDist = p.distance

  if (S.mode === 'free') {
    freeDriveWanted(dt)
    if (policeAgents().length) policeLogic(dt, false)
    else rt.wanted = 0
    return
  }
  if (!m) return

  const timeLeft = m.timeLimit !== undefined ? m.timeLimit - S.t : Infinity
  if (timeLeft <= 0 && m.type !== 'race') { finish(false, 'Time is up', 'You ran out of time.'); return }
  const dist = (x: number, z: number) => Math.hypot(p.x - x, p.z - z)

  switch (m.type) {
    case 'destination':
    case 'timed': {
      const g = S.markers[0]
      if (g && dist(g.x, g.z) < g.radius) finish(true, 'Destination reached', m.title)
      break
    }
    case 'delivery': {
      const g = S.markers[0]
      if (g && dist(g.x, g.z) < g.radius) {
        if (S.stage === 0) {
          S.stage = 1
          S.markers = [mk(m.points[1][0], m.points[1][1], 'dropoff')]
          say('Parcel collected — deliver it!', 'good')
        } else finish(true, 'Delivery complete', 'The customer is happy.')
      }
      break
    }
    case 'distance':
      if (S.distance >= (m.distance ?? 1000)) finish(true, 'Distance complete', `You covered ${(S.distance / 1000).toFixed(1)} km.`)
      break
    case 'challenge': {
      const c = m.challenge!
      if (c.kind === 'speed') {
        if (Math.abs(p.speed) * 3.6 >= c.kmh) S.hold += dt
        else S.hold = Math.max(0, S.hold - dt * 2)
        if (S.hold >= c.hold) finish(true, 'Speed challenge passed', `Held ${c.kmh} km/h.`)
      } else {
        if (p.slip > 0.45 && Math.abs(p.speed) > 8) S.drift += dt
        if (S.drift >= c.seconds) finish(true, 'Drift challenge passed', `${c.seconds}s of sliding.`)
      }
      break
    }
    case 'police': {
      const g = S.markers[0]
      if (g && dist(g.x, g.z) < g.radius) { finish(true, 'Safe house reached', 'The police lost you.'); break }
      policeLogic(dt, true)
      break
    }
    case 'race': {
      const cp = m.points[S.playerCp]
      if (cp && dist(nodeX(cp[0]), nodeZ(cp[1])) < CP_RADIUS) {
        S.playerCp++
        if (S.playerCp >= m.points.length) {
          const ahead = S.racers.filter((r) => r.finished > 0).length
          finish(true, ahead === 0 ? 'Victory!' : `Finished P${ahead + 1}`, m.title, { position: ahead + 1 })
          break
        }
        const nx = m.points[S.playerCp]
        S.markers = [mk(nx[0], nx[1], 'next', CP_RADIUS)]
        if (S.playerCp + 1 < m.points.length) {
          const n2 = m.points[S.playerCp + 1]
          S.markers.push({ ...mk(n2[0], n2[1], 'checkpoint', CP_RADIUS), color: '#7a8ca3' })
        }
        say(`Checkpoint ${S.playerCp}/${m.points.length}`, 'good', 1.6)
      }
      const myScore = progressScore(S.playerCp, p.x, p.z, m)
      updateRacers(dt, m, S.racers, S.t, myScore, false)
      let ahead = 0
      for (const r of S.racers) {
        if (r.finished > 0) ahead++
        else if (progressScore(r.nextCp, r.body.x, r.body.z, m) > myScore) ahead++
      }
      S.position = ahead + 1
      break
    }
  }
}

/** Overrides driver input during the race countdown. */
export function frozenInput(inp: ControlInput) {
  inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.handbrake = true
}

// ---------------------------------------------------------------- HUD snapshot
const gearOf = (g: number) => (g < 0 ? 'R' : g === 0 ? 'N' : String(g))

export function hudSnapshot() {
  const p = playerBody
  const m = S.mission
  const unit = useStore.getState().save.settings.speedUnit
  const speed = Math.round(Math.abs(p.speed) * (unit === 'kmh' ? 3.6 : 2.237))
  let objective = 'Free Drive'
  let sub = 'Explore the city · obey the lights'
  let timer: number | null = null
  let timerLabel = ''
  let progress: number | null = null
  let position: string | null = null
  if (m) {
    objective = m.title
    sub = m.description
    const left = m.timeLimit !== undefined ? Math.max(0, m.timeLimit - S.t) : null
    if (left !== null) { timer = left; timerLabel = 'TIME LEFT' }
    switch (m.type) {
      case 'destination': case 'timed': {
        const g = S.markers[0]
        objective = 'Reach the destination'
        sub = g ? `${Math.round(Math.hypot(p.x - g.x, p.z - g.z))} m to go` : ''
        break
      }
      case 'delivery': {
        const g = S.markers[0]
        objective = S.stage === 0 ? 'Collect the parcel' : 'Deliver the parcel'
        sub = g ? `${Math.round(Math.hypot(p.x - g.x, p.z - g.z))} m to go` : ''
        break
      }
      case 'distance':
        objective = `Drive ${((m.distance ?? 0) / 1000).toFixed(1)} km`
        sub = `${(S.distance / 1000).toFixed(2)} km driven`
        progress = clamp(S.distance / (m.distance ?? 1), 0, 1)
        break
      case 'challenge': {
        const c = m.challenge!
        objective = c.kind === 'speed' ? `Hold ${c.kmh} km/h for ${c.hold}s` : `Drift for ${c.seconds}s`
        sub = c.kind === 'speed' ? `${S.hold.toFixed(1)} / ${c.hold}s` : `${S.drift.toFixed(1)} / ${c.seconds}s`
        progress = c.kind === 'speed' ? clamp(S.hold / c.hold, 0, 1) : clamp(S.drift / c.seconds, 0, 1)
        break
      }
      case 'police': {
        const g = S.markers[0]
        objective = 'Escape the police'
        sub = `Safe house ${g ? Math.round(Math.hypot(p.x - g.x, p.z - g.z)) : 0} m · nearest unit ${Number.isFinite(S.nearestPolice) ? Math.round(S.nearestPolice) : '–'} m`
        progress = clamp(S.escapeT / POLICE.escapeTime, 0, 1)
        break
      }
      case 'race':
        objective = `Checkpoint ${Math.min(S.playerCp + 1, m.points.length)} / ${m.points.length}`
        sub = 'Follow the blue markers'
        position = `P${S.position}/${(m.opponents ?? 0) + 1}`
        timer = S.t; timerLabel = 'RACE TIME'
        break
    }
  } else {
    if (S.heat > 5 && policeAgents().length === 0) sub = `Heat ${Math.round(S.heat)}% — drive carefully`
    if (policeAgents().length) sub = `Pursuit · nearest ${Number.isFinite(S.nearestPolice) ? Math.round(S.nearestPolice) : '–'} m`
  }
  return {
    speed, gear: gearOf(p.gear), rpm: p.rpm, objective, sub, timer, timerLabel, progress, position,
    wanted: rt.wanted, heat: clamp(S.heat / 100, 0, 1), countdown: Math.max(0, S.countdown),
    message: S.msgT > 0 ? S.msg : null, messageKind: S.msgKind,
    speedLimit: false,
  }
}

/** R key: puts the car back on the nearest road lane, facing the way it was pointing. */
export function respawnPlayer() {
  if (S.phase !== 'running' && S.phase !== 'countdown') return
  const p = playerBody
  const [gx, gz] = nearestNode(p.x, p.z)
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading)
  let best = 0, bd = -2
  for (let d = 0; d < 4; d++) {
    const dot = DIRS[d][0] * fx + DIRS[d][1] * fz
    if (dot > bd) { bd = dot; best = d }
  }
  placePlayer(gx, gz, best, 24)
  say('Car reset to the road', 'info', 1.6)
}
