import { PROGRESSION, SAVE_KEY, SAVE_VERSION, type GraphicsQuality } from '../config/game'
import { PAINT_COLORS, VEHICLES } from '../config/vehicles'

export interface Settings {
  graphics: GraphicsQuality
  master: number
  engine: number
  environment: number
  music: number
  muted: boolean
  cameraDistance: number // 0.6..1.6 multiplier
  speedUnit: 'kmh' | 'mph'
}

export interface VehicleCustom {
  color: string
  upgrades: { engine: number; tires: number; brakes: number }
}

export interface SaveData {
  version: number
  level: number
  xp: number
  coins: number
  owned: string[]
  selected: string
  custom: Record<string, VehicleCustom>
  ownedPaints: string[]
  completed: Record<string, { count: number; bestTime?: number }>
  milestones: string[]
  tutorialSeen: boolean
  totalDistance: number
  settings: Settings
}

export const defaultSettings = (): Settings => ({
  graphics: 'medium', master: 0.8, engine: 0.7, environment: 0.6, music: 0.5,
  muted: false, cameraDistance: 1, speedUnit: 'kmh',
})

export const defaultSave = (): SaveData => ({
  version: SAVE_VERSION,
  level: 1,
  xp: 0,
  coins: PROGRESSION.startCoins,
  owned: [VEHICLES[0].id],
  selected: VEHICLES[0].id,
  custom: {},
  ownedPaints: PAINT_COLORS.filter((c) => c.price === 0).map((c) => c.hex),
  completed: {},
  milestones: [],
  tutorialSeen: false,
  totalDistance: 0,
  settings: defaultSettings(),
})

const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

/** Validates untrusted JSON into a SaveData; anything invalid falls back to defaults. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, any>
  if (r.version !== SAVE_VERSION) return d

  const ids = new Set(VEHICLES.map((v) => v.id))
  const out: SaveData = { ...d }
  if (isNum(r.level, 1, PROGRESSION.maxLevel)) out.level = Math.floor(r.level)
  if (isNum(r.xp, 0, 1e9)) out.xp = Math.floor(r.xp)
  if (isNum(r.coins, 0, 1e9)) out.coins = Math.floor(r.coins)
  if (isNum(r.totalDistance, 0, 1e12)) out.totalDistance = r.totalDistance
  if (typeof r.tutorialSeen === 'boolean') out.tutorialSeen = r.tutorialSeen

  if (Array.isArray(r.owned)) {
    const owned = r.owned.filter((x: unknown): x is string => typeof x === 'string' && ids.has(x))
    out.owned = Array.from(new Set([VEHICLES[0].id, ...owned]))
  }
  out.selected = typeof r.selected === 'string' && out.owned.includes(r.selected) ? r.selected : out.owned[0]

  if (r.custom && typeof r.custom === 'object') {
    for (const [id, c] of Object.entries<any>(r.custom)) {
      if (!ids.has(id) || !c) continue
      const u = c.upgrades ?? {}
      const lv = (x: unknown) => (isNum(x, 0, 3) ? Math.floor(x) : 0)
      out.custom[id] = {
        color: isHex(c.color) ? c.color : VEHICLES.find((v) => v.id === id)!.defaultColor,
        upgrades: { engine: lv(u.engine), tires: lv(u.tires), brakes: lv(u.brakes) },
      }
    }
  }
  if (r.completed && typeof r.completed === 'object') {
    for (const [id, c] of Object.entries<any>(r.completed)) {
      if (!c || !isNum(c.count, 0, 1e6)) continue
      out.completed[id] = { count: Math.floor(c.count), ...(isNum(c.bestTime, 0, 1e6) ? { bestTime: c.bestTime } : {}) }
    }
  }
  if (Array.isArray(r.ownedPaints)) {
    const valid = new Set(PAINT_COLORS.map((c) => c.hex))
    const own = r.ownedPaints.filter((x: unknown): x is string => typeof x === 'string' && valid.has(x))
    out.ownedPaints = Array.from(new Set([...out.ownedPaints, ...own]))
  }
  if (Array.isArray(r.milestones)) out.milestones = r.milestones.filter((x: unknown): x is string => typeof x === 'string')

  const s = r.settings
  if (s && typeof s === 'object') {
    const st = out.settings
    if (['low', 'medium', 'high'].includes(s.graphics)) st.graphics = s.graphics
    for (const k of ['master', 'engine', 'environment', 'music'] as const) if (isNum(s[k], 0, 1)) st[k] = s[k]
    if (typeof s.muted === 'boolean') st.muted = s.muted
    if (isNum(s.cameraDistance, 0.6, 1.6)) st.cameraDistance = s.cameraDistance
    if (s.speedUnit === 'kmh' || s.speedUnit === 'mph') st.speedUnit = s.speedUnit
  }
  return out
}

export function loadSave(): SaveData {
  try {
    const txt = localStorage.getItem(SAVE_KEY)
    if (!txt) return defaultSave()
    return sanitize(JSON.parse(txt))
  } catch {
    return defaultSave()
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch {
    /* storage unavailable (private mode / quota) – game stays playable */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
