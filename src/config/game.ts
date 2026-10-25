export type GraphicsQuality = 'low' | 'medium' | 'high'

export const GRAPHICS: Record<GraphicsQuality, {
  dpr: number; shadows: boolean; shadowMap: number; traffic: number; pedestrians: number
  drawDistance: number; fog: number; antialias: boolean
}> = {
  low:    { dpr: 1,   shadows: false, shadowMap: 1024, traffic: 10, pedestrians: 14, drawDistance: 260, fog: 0.0042, antialias: false },
  medium: { dpr: 1.5, shadows: true,  shadowMap: 2048, traffic: 18, pedestrians: 30, drawDistance: 380, fog: 0.0030, antialias: true },
  high:   { dpr: 2,   shadows: true,  shadowMap: 4096, traffic: 28, pedestrians: 48, drawDistance: 520, fog: 0.0022, antialias: true },
}

/** All progression values are configurable here. */
export const PROGRESSION = {
  maxLevel: 30,
  /** XP required to go from level n to n+1 */
  xpForLevel: (level: number) => Math.round(120 + (level - 1) * 90 + (level - 1) ** 2 * 8),
  startCoins: 500,
  missionRewardScale: 1,
  replayRewardFactor: 0.25, // replaying a completed mission pays 25 %
  milestones: [
    { id: 'lvl5', level: 5, coins: 1000, label: 'Reached level 5' },
    { id: 'lvl10', level: 10, coins: 3000, label: 'Reached level 10' },
    { id: 'lvl20', level: 20, coins: 8000, label: 'Reached level 20' },
  ],
}

/** Level at which each feature opens. */
export const UNLOCKS = {
  destination: 2,
  timed: 4,
  police: 5,
  race: 3,
  delivery: 3,
}

export const POLICE = {
  maxSpeedFactor: 0.9, // fraction of player's max speed
  catchRadius: 9, // metres (centre to centre)
  catchTime: 3.2, // seconds within radius -> busted
  escapeDistance: 190, // metres away
  escapeTime: 7, // seconds beyond distance -> escaped
  speedLimit: 24, // m/s; exceeding in a chase-free state raises no flags unless mission
}

export const WORLD = {
  blockSize: 96, // centre to centre of intersections
  gridN: 7, // intersections per side
  roadWidth: 14, // 2 lanes each way... see lanes
  laneWidth: 3.4,
  sidewalk: 4,
}

export const SAVE_KEY = 'roadvanta.save'
export const SAVE_VERSION = 1
