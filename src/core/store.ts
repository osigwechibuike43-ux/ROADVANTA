import { create } from 'zustand'
import { PROGRESSION } from '../config/game'
import { PAINT_COLORS, UPGRADES, getVehicle, type UpgradeDef } from '../config/vehicles'
import { clearSave, defaultSave, loadSave, writeSave, type SaveData, type Settings, type VehicleCustom } from './save'

export type Screen = 'menu' | 'modes' | 'missions' | 'garage' | 'settings' | 'playing' | 'paused' | 'results' | 'controls'
export type Mode = 'free' | 'career' | 'race' | 'police'

export interface SessionRequest { mode: Mode; missionId?: string; nonce: number }

export interface Hud {
  speed: number
  gear: string
  rpm: number
  objective: string
  sub: string
  timer: number | null
  timerLabel: string
  progress: number | null
  wanted: number
  heat: number
  position: string | null
  message: string | null
  messageKind: 'info' | 'good' | 'bad'
  countdown: number
  speedLimit: boolean
}

export interface ResultData {
  success: boolean
  title: string
  subtitle: string
  missionId?: string
  time?: number
  coins: number
  xp: number
  bonus: number
  bonusLabel?: string
  levelBefore: number
  levelAfter: number
  details: string[]
  unlocks: string[]
  replay: boolean
}

const emptyHud = (): Hud => ({
  speed: 0, gear: 'N', rpm: 0, objective: '', sub: '', timer: null, timerLabel: '', progress: null, wanted: 0, heat: 0,
  position: null, message: null, messageKind: 'info', countdown: 0, speedLimit: false,
})

interface Store {
  screen: Screen
  prevScreen: Screen
  save: SaveData
  hud: Hud
  request: SessionRequest | null
  results: ResultData | null
  toast: { text: string; kind: 'good' | 'bad' | 'info'; id: number } | null
  portrait: boolean
  touch: boolean
  assetsReady: boolean
  previewId: string | null

  go: (s: Screen) => void
  back: () => void
  startSession: (mode: Mode, missionId?: string) => void
  setHud: (h: Partial<Hud>) => void
  showToast: (text: string, kind?: 'good' | 'bad' | 'info') => void
  setResults: (r: ResultData | null) => void
  setPreview: (id: string | null) => void
  setAssetsReady: (v: boolean) => void
  setEnv: (e: { portrait?: boolean; touch?: boolean }) => void

  selectVehicle: (id: string) => boolean
  buyVehicle: (id: string) => { ok: boolean; reason?: string }
  paintVehicle: (id: string, hex: string) => { ok: boolean; reason?: string }
  buyUpgrade: (id: string, up: UpgradeDef['id']) => { ok: boolean; reason?: string }
  upgradeCost: (id: string, up: UpgradeDef['id']) => number
  updateSettings: (p: Partial<Settings>) => void
  applyReward: (opts: { coins: number; xp: number; missionId?: string; time?: number }) => { levelBefore: number; levelAfter: number; unlocks: string[] }
  addCoins: (n: number) => void
  addDistance: (m: number) => void
  markTutorialSeen: () => void
  resetProgress: () => void
}

let nonceCounter = 0
const commit = (set: (p: Partial<Store>) => void, save: SaveData) => {
  writeSave(save)
  set({ save })
}
export const customOf = (save: SaveData, id: string): VehicleCustom =>
  save.custom[id] ?? { color: getVehicle(id).defaultColor, upgrades: { engine: 0, tires: 0, brakes: 0 } }

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  prevScreen: 'menu',
  save: loadSave(),
  hud: emptyHud(),
  request: null,
  results: null,
  toast: null,
  portrait: false,
  touch: false,
  assetsReady: false,
  previewId: null,

  go: (s) => set((st) => ({ screen: s, prevScreen: st.screen })),
  back: () => set((st) => ({ screen: st.prevScreen === st.screen ? 'menu' : st.prevScreen, prevScreen: st.screen })),
  startSession: (mode, missionId) => {
    const st = get()
    set({
      request: { mode, missionId, nonce: ++nonceCounter },
      screen: st.save.tutorialSeen ? 'playing' : 'controls',
      prevScreen: st.screen,
      hud: emptyHud(),
      results: null,
    })
  },
  setHud: (h) => set((st) => ({ hud: { ...st.hud, ...h } })),
  showToast: (text, kind = 'info') => set({ toast: { text, kind, id: Math.random() } }),
  setResults: (r) => set({ results: r }),
  setPreview: (id) => set({ previewId: id }),
  setAssetsReady: (v) => set({ assetsReady: v }),
  setEnv: (e) => set(e),

  selectVehicle: (id) => {
    const { save } = get()
    if (!save.owned.includes(id)) return false
    commit(set, { ...save, selected: id })
    return true
  },
  buyVehicle: (id) => {
    const { save } = get()
    const v = getVehicle(id)
    if (save.owned.includes(id)) return { ok: false, reason: 'Already owned' }
    if (save.level < v.unlockLevel) return { ok: false, reason: `Unlocks at level ${v.unlockLevel}` }
    if (save.coins < v.price) return { ok: false, reason: 'Not enough coins' }
    commit(set, { ...save, coins: save.coins - v.price, owned: [...save.owned, id], selected: id })
    return { ok: true }
  },
  paintVehicle: (id, hex) => {
    const { save } = get()
    if (!save.owned.includes(id)) return { ok: false, reason: 'Vehicle not owned' }
    const paint = PAINT_COLORS.find((c) => c.hex === hex)
    if (!paint) return { ok: false, reason: 'Unknown colour' }
    let coins = save.coins
    let paints = save.ownedPaints
    if (!paints.includes(hex)) {
      if (coins < paint.price) return { ok: false, reason: 'Not enough coins' }
      coins -= paint.price
      paints = [...paints, hex]
    }
    const c = customOf(save, id)
    commit(set, { ...save, coins, ownedPaints: paints, custom: { ...save.custom, [id]: { ...c, color: hex } } })
    return { ok: true }
  },
  upgradeCost: (id, up) => {
    const def = UPGRADES.find((u) => u.id === up)!
    const lvl = customOf(get().save, id).upgrades[up]
    return def.costPerLevel * (lvl + 1)
  },
  buyUpgrade: (id, up) => {
    const { save, upgradeCost } = get()
    const def = UPGRADES.find((u) => u.id === up)!
    if (!save.owned.includes(id)) return { ok: false, reason: 'Vehicle not owned' }
    const c = customOf(save, id)
    if (c.upgrades[up] >= def.maxLevel) return { ok: false, reason: 'Maxed out' }
    const cost = upgradeCost(id, up)
    if (save.coins < cost) return { ok: false, reason: 'Not enough coins' }
    commit(set, {
      ...save, coins: save.coins - cost,
      custom: { ...save.custom, [id]: { ...c, upgrades: { ...c.upgrades, [up]: c.upgrades[up] + 1 } } },
    })
    return { ok: true }
  },
  updateSettings: (p) => {
    const { save } = get()
    commit(set, { ...save, settings: { ...save.settings, ...p } })
  },
  applyReward: ({ coins, xp, missionId, time }) => {
    const { save } = get()
    const levelBefore = save.level
    let level = save.level, curXp = save.xp + xp
    while (level < PROGRESSION.maxLevel && curXp >= PROGRESSION.xpForLevel(level)) {
      curXp -= PROGRESSION.xpForLevel(level)
      level++
    }
    if (level >= PROGRESSION.maxLevel) curXp = 0
    let bonusCoins = 0
    const unlocks: string[] = []
    const milestones = [...save.milestones]
    for (const m of PROGRESSION.milestones) {
      if (level >= m.level && !milestones.includes(m.id)) {
        milestones.push(m.id)
        bonusCoins += m.coins
        unlocks.push(`${m.label}: +${m.coins} coins`)
      }
    }
    const completed = { ...save.completed }
    if (missionId) {
      const prev = completed[missionId]
      completed[missionId] = {
        count: (prev?.count ?? 0) + 1,
        ...(time !== undefined ? { bestTime: prev?.bestTime !== undefined ? Math.min(prev.bestTime, time) : time } : prev?.bestTime !== undefined ? { bestTime: prev.bestTime } : {}),
      }
    }
    commit(set, { ...save, coins: save.coins + coins + bonusCoins, xp: curXp, level, milestones, completed })
    return { levelBefore, levelAfter: level, unlocks }
  },
  addCoins: (n) => {
    const { save } = get()
    commit(set, { ...save, coins: Math.max(0, save.coins + n) })
  },
  addDistance: (m) => {
    const { save } = get()
    commit(set, { ...save, totalDistance: save.totalDistance + m })
  },
  markTutorialSeen: () => {
    const { save } = get()
    if (!save.tutorialSeen) commit(set, { ...save, tutorialSeen: true })
  },
  resetProgress: () => {
    clearSave()
    const fresh = defaultSave()
    writeSave(fresh)
    set({ save: fresh, screen: 'menu', prevScreen: 'menu', request: null, results: null })
  },
}))
