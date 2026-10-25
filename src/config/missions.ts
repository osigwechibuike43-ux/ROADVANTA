import { UNLOCKS } from './game'

export type MissionType = 'destination' | 'timed' | 'distance' | 'race' | 'police' | 'delivery' | 'challenge'
export type GridPoint = [number, number]

export interface MissionDef {
  id: string
  title: string
  description: string
  type: MissionType
  difficulty: 1 | 2 | 3 | 4 | 5
  minLevel: number
  reward: { coins: number; xp: number }
  /** Starting intersection and heading (0:+x 1:+z 2:-x 3:-z). */
  start: { gx: number; gz: number; dir: number }
  /** destination: [goal]; timed: [goal]; delivery: [pickup, dropoff]; race: checkpoints (last = finish); police: [safehouse]. */
  points: GridPoint[]
  timeLimit?: number // seconds, fail when exceeded
  parTime?: number // seconds, finishing under this earns a bonus
  distance?: number // metres for distance missions
  opponents?: number // race rivals
  police?: number // pursuing units
  challenge?: { kind: 'speed'; kmh: number; hold: number } | { kind: 'drift'; seconds: number }
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'm01', title: 'Welcome to Roadvanta', type: 'destination', difficulty: 1, minLevel: 1,
    description: 'Learn the basics: follow the marker two blocks up Central Avenue and stop in the ring.',
    reward: { coins: 150, xp: 90 }, start: { gx: 3, gz: 0, dir: 1 }, points: [[3, 2]],
  },
  {
    id: 'm02', title: 'Corner Store Run', type: 'destination', difficulty: 1, minLevel: UNLOCKS.destination,
    description: 'Pick up the delivery at the plaza district — obey the lights, mind the pedestrians.',
    reward: { coins: 240, xp: 110 }, start: { gx: 1, gz: 1, dir: 0 }, points: [[4, 2]],
  },
  {
    id: 'm03', title: 'Uptown Shuttle', type: 'destination', difficulty: 2, minLevel: UNLOCKS.destination,
    description: 'Drive across the city to the northern office district.',
    reward: { coins: 320, xp: 130 }, start: { gx: 5, gz: 0, dir: 1 }, points: [[2, 5]],
  },
  {
    id: 'm04', title: 'Street Sprint', type: 'race', difficulty: 2, minLevel: UNLOCKS.race,
    description: 'First street race: three checkpoints, two rivals. Finish on the podium.',
    reward: { coins: 520, xp: 190 }, start: { gx: 1, gz: 1, dir: 1 }, points: [[1, 4], [4, 4], [4, 1], [1, 1]], opponents: 2, parTime: 78,
  },
  {
    id: 'm05', title: 'Parcel Express', type: 'delivery', difficulty: 2, minLevel: UNLOCKS.delivery,
    description: 'Collect the parcel at the market and deliver it across town before the clock runs out.',
    reward: { coins: 430, xp: 170 }, start: { gx: 0, gz: 3, dir: 0 }, points: [[2, 3], [5, 5]], timeLimit: 130, parTime: 90,
  },
  {
    id: 'm06', title: 'Beat the Clock', type: 'timed', difficulty: 2, minLevel: UNLOCKS.timed,
    description: 'Reach the harbour district in time. Traffic will not make it easy.',
    reward: { coins: 480, xp: 200 }, start: { gx: 0, gz: 0, dir: 0 }, points: [[5, 3]], timeLimit: 75, parTime: 55,
  },
  {
    id: 'm07', title: 'Scenic Distance', type: 'distance', difficulty: 2, minLevel: UNLOCKS.timed,
    description: 'Drive 2.5 km anywhere in the city. Take any route you like — every kilometre counts.',
    reward: { coins: 380, xp: 160 }, start: { gx: 3, gz: 3, dir: 1 }, points: [], distance: 2500,
  },
  {
    id: 'm08', title: 'Need for Speed', type: 'challenge', difficulty: 3, minLevel: UNLOCKS.timed,
    description: 'Hold 110 km/h for 6 seconds on the avenue. No braking out of it!',
    reward: { coins: 600, xp: 240 }, start: { gx: 3, gz: 0, dir: 1 }, points: [], challenge: { kind: 'speed', kmh: 110, hold: 6 }, timeLimit: 70,
  },
  {
    id: 'm09', title: 'First Heat', type: 'police', difficulty: 3, minLevel: UNLOCKS.police,
    description: 'Patrol cars are on your tail. Reach the safe house — or lose them for good.',
    reward: { coins: 900, xp: 320 }, start: { gx: 2, gz: 2, dir: 1 }, points: [[5, 5]], police: 1, timeLimit: 150,
  },
  {
    id: 'm10', title: 'Downtown Dash', type: 'race', difficulty: 3, minLevel: 6,
    description: 'Tight turns around the plaza. Three rivals, five checkpoints.',
    reward: { coins: 1100, xp: 380 }, start: { gx: 2, gz: 1, dir: 0 }, points: [[4, 1], [4, 3], [3, 4], [2, 3], [2, 1]], opponents: 3, parTime: 85,
  },
  {
    id: 'm11', title: 'Slide Session', type: 'challenge', difficulty: 3, minLevel: 6,
    description: 'Show off: accumulate 8 seconds of drifting using the handbrake.',
    reward: { coins: 850, xp: 300 }, start: { gx: 3, gz: 3, dir: 0 }, points: [], challenge: { kind: 'drift', seconds: 8 }, timeLimit: 90,
  },
  {
    id: 'm12', title: 'Midnight Courier', type: 'delivery', difficulty: 4, minLevel: 7,
    description: 'Two stops, tight deadline. The factory district is far from the harbour.',
    reward: { coins: 1400, xp: 460 }, start: { gx: 0, gz: 5, dir: 0 }, points: [[3, 5], [5, 0]], timeLimit: 120, parTime: 95,
  },
  {
    id: 'm13', title: 'Two Cars Behind', type: 'police', difficulty: 4, minLevel: 8,
    description: 'Two patrol units this time. Use the grid — they cannot corner like you.',
    reward: { coins: 1800, xp: 560 }, start: { gx: 4, gz: 4, dir: 2 }, points: [[0, 0]], police: 2, timeLimit: 170,
  },
  {
    id: 'm14', title: 'Apex Cup', type: 'race', difficulty: 4, minLevel: 9,
    description: 'The big one: a long circuit with three fast rivals.',
    reward: { coins: 2600, xp: 720 }, start: { gx: 1, gz: 0, dir: 1 }, points: [[1, 5], [5, 5], [5, 1], [3, 1], [3, 3], [1, 3], [1, 0]], opponents: 3, parTime: 150,
  },
  {
    id: 'm15', title: 'Cross-City Rush', type: 'timed', difficulty: 4, minLevel: 10,
    description: 'Corner to corner in under 70 seconds. Every red light counts.',
    reward: { coins: 2200, xp: 640 }, start: { gx: 0, gz: 0, dir: 1 }, points: [[6, 6]], timeLimit: 70, parTime: 56,
  },
  {
    id: 'm16', title: 'Most Wanted', type: 'police', difficulty: 5, minLevel: 12,
    description: 'Three units, relentless. Make it to the safe house at the opposite end of the city.',
    reward: { coins: 4000, xp: 1000 }, start: { gx: 6, gz: 6, dir: 2 }, points: [[0, 0]], police: 3, timeLimit: 200,
  },
]

export const getMission = (id: string) => MISSIONS.find((m) => m.id === id)

export const MISSION_TYPE_LABEL: Record<MissionType, string> = {
  destination: 'Destination', timed: 'Timed run', distance: 'Distance', race: 'Street race', police: 'Police chase',
  delivery: 'Delivery', challenge: 'Challenge',
}
