export type VehicleClass = 'Everyday' | 'Sports' | 'SUV' | 'Motorcycle'
export type BodyStyle = 'hatch' | 'sedan' | 'coupe' | 'suv' | 'moto' | 'van' | 'bus' | 'bicycle' | 'police'

export interface VehicleSpec {
  id: string
  name: string
  cls: VehicleClass
  body: BodyStyle
  price: number
  unlockLevel: number
  /** physics */
  mass: number // kg
  engineForce: number // N at wheels (approx)
  maxSpeed: number // m/s forward
  maxReverse: number // m/s
  brakeForce: number // N
  grip: number // lateral grip, higher = stickier
  steerLock: number // max steering angle (rad) at low speed
  drag: number // aero drag coefficient (0.5*rho*Cd*A)
  /** dimensions (m) */
  length: number
  width: number
  height: number
  wheelRadius: number
  wheelBase: number
  defaultColor: string
}

export const VEHICLES: VehicleSpec[] = [
  {
    id: 'kito', name: 'Kito Hatch', cls: 'Everyday', body: 'hatch', price: 0, unlockLevel: 1,
    mass: 1150, engineForce: 6200, maxSpeed: 40, maxReverse: 9, brakeForce: 11000, grip: 8.5, steerLock: 0.58,
    drag: 0.42, length: 3.9, width: 1.72, height: 1.46, wheelRadius: 0.3, wheelBase: 2.45, defaultColor: '#2f6fed',
  },
  {
    id: 'meridian', name: 'Meridian Sedan', cls: 'Everyday', body: 'sedan', price: 4500, unlockLevel: 3,
    mass: 1450, engineForce: 7800, maxSpeed: 47, maxReverse: 9, brakeForce: 12500, grip: 9, steerLock: 0.55,
    drag: 0.5, length: 4.7, width: 1.82, height: 1.43, wheelRadius: 0.33, wheelBase: 2.78, defaultColor: '#c9ccd2',
  },
  {
    id: 'summit', name: 'Summit SUV', cls: 'SUV', body: 'suv', price: 9000, unlockLevel: 4,
    mass: 2050, engineForce: 10500, maxSpeed: 50, maxReverse: 10, brakeForce: 15000, grip: 10, steerLock: 0.5,
    drag: 0.7, length: 4.8, width: 1.95, height: 1.78, wheelRadius: 0.38, wheelBase: 2.85, defaultColor: '#2b3a2f',
  },
  {
    id: 'vanta', name: 'Vanta GT', cls: 'Sports', body: 'coupe', price: 22000, unlockLevel: 6,
    mass: 1380, engineForce: 13500, maxSpeed: 68, maxReverse: 10, brakeForce: 17500, grip: 12, steerLock: 0.46,
    drag: 0.46, length: 4.5, width: 1.9, height: 1.22, wheelRadius: 0.34, wheelBase: 2.7, defaultColor: '#e03a2f',
  },
  {
    id: 'apex', name: 'Apex RS', cls: 'Sports', body: 'coupe', price: 48000, unlockLevel: 9,
    mass: 1290, engineForce: 18500, maxSpeed: 82, maxReverse: 10, brakeForce: 20500, grip: 14, steerLock: 0.42,
    drag: 0.4, length: 4.4, width: 1.98, height: 1.16, wheelRadius: 0.35, wheelBase: 2.65, defaultColor: '#f2b400',
  },
  {
    id: 'ronin', name: 'Ronin 650', cls: 'Motorcycle', body: 'moto', price: 12000, unlockLevel: 5,
    mass: 230, engineForce: 5600, maxSpeed: 60, maxReverse: 4, brakeForce: 6200, grip: 11, steerLock: 0.5,
    drag: 0.28, length: 2.1, width: 0.8, height: 1.35, wheelRadius: 0.32, wheelBase: 1.42, defaultColor: '#ff6a2b',
  },
]

/** Non-player vehicle specs used by the ambient traffic, police and cyclists. */
export const AI_SPECS: Record<'van' | 'bus' | 'police' | 'bicycle', VehicleSpec> = {
  van: {
    id: 'van', name: 'Courier Van', cls: 'Everyday', body: 'van', price: 0, unlockLevel: 1,
    mass: 2400, engineForce: 8200, maxSpeed: 32, maxReverse: 8, brakeForce: 14000, grip: 8, steerLock: 0.5,
    drag: 0.8, length: 5.3, width: 2.0, height: 2.4, wheelRadius: 0.36, wheelBase: 3.3, defaultColor: '#f5f5f5',
  },
  bus: {
    id: 'bus', name: 'City Bus', cls: 'Everyday', body: 'bus', price: 0, unlockLevel: 1,
    mass: 11000, engineForce: 32000, maxSpeed: 24, maxReverse: 6, brakeForce: 52000, grip: 7, steerLock: 0.45,
    drag: 2.2, length: 11, width: 2.55, height: 3.1, wheelRadius: 0.5, wheelBase: 5.8, defaultColor: '#ffb703',
  },
  police: {
    id: 'police', name: 'Patrol Cruiser', cls: 'Everyday', body: 'police', price: 0, unlockLevel: 1,
    mass: 1750, engineForce: 15500, maxSpeed: 58, maxReverse: 9, brakeForce: 17000, grip: 11, steerLock: 0.52,
    drag: 0.5, length: 4.8, width: 1.9, height: 1.5, wheelRadius: 0.34, wheelBase: 2.85, defaultColor: '#f4f6fa',
  },
  bicycle: {
    id: 'bicycle', name: 'Bicycle', cls: 'Everyday', body: 'bicycle', price: 0, unlockLevel: 1,
    mass: 95, engineForce: 260, maxSpeed: 7, maxReverse: 1, brakeForce: 900, grip: 7, steerLock: 0.5,
    drag: 0.35, length: 1.75, width: 0.55, height: 1.7, wheelRadius: 0.34, wheelBase: 1.05, defaultColor: '#3a86ff',
  },
}

export const PAINT_COLORS = [
  { name: 'Cobalt', hex: '#2f6fed', price: 0 },
  { name: 'Graphite', hex: '#2a2d33', price: 0 },
  { name: 'Pearl', hex: '#e8e9ec', price: 0 },
  { name: 'Racing Red', hex: '#e03a2f', price: 300 },
  { name: 'Solar Orange', hex: '#ff6a2b', price: 300 },
  { name: 'Signal Yellow', hex: '#f2b400', price: 300 },
  { name: 'Forest', hex: '#2b5a3a', price: 500 },
  { name: 'Violet', hex: '#6a3df0', price: 500 },
  { name: 'Teal', hex: '#13a89e', price: 500 },
]

export const getVehicle = (id: string): VehicleSpec =>
  VEHICLES.find((v) => v.id === id) ?? VEHICLES[0]

/** Garage statistics derived from the real physics config (0-100). */
export function vehicleStats(v: VehicleSpec) {
  const accel = v.engineForce / v.mass // m/s^2 proxy
  return {
    topSpeed: Math.round(v.maxSpeed * 3.6),
    acceleration: Math.min(100, Math.round((accel / 14) * 100)),
    handling: Math.min(100, Math.round(((v.grip * 5.5) / (1 + v.mass / 3500)) * 1.1)),
    braking: Math.min(100, Math.round((v.brakeForce / v.mass / 14) * 100)),
  }
}

export interface UpgradeDef {
  id: 'engine' | 'tires' | 'brakes'
  name: string
  maxLevel: number
  costPerLevel: number
}
export const UPGRADES: UpgradeDef[] = [
  { id: 'engine', name: 'Engine', maxLevel: 3, costPerLevel: 1500 },
  { id: 'tires', name: 'Tires', maxLevel: 3, costPerLevel: 1000 },
  { id: 'brakes', name: 'Brakes', maxLevel: 3, costPerLevel: 800 },
]
export const UPGRADE_BONUS = 0.08 // +8 % per level

/** Applies customization & upgrades to the base spec so garage stats == gameplay. */
export function effectiveSpec(v: VehicleSpec, up: Partial<Record<UpgradeDef['id'], number>> = {}): VehicleSpec {
  const e = 1 + (up.engine ?? 0) * UPGRADE_BONUS
  const t = 1 + (up.tires ?? 0) * UPGRADE_BONUS
  const b = 1 + (up.brakes ?? 0) * UPGRADE_BONUS
  return {
    ...v,
    engineForce: v.engineForce * e,
    maxSpeed: v.maxSpeed * (1 + (up.engine ?? 0) * 0.03),
    grip: v.grip * t,
    brakeForce: v.brakeForce * b,
  }
}
