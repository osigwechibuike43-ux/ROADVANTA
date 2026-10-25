import type { ControlInput } from '../vehicles/physics'

/**
 * Unified keyboard + touch input. Keys are tracked by `code`, cleared on blur/visibility loss so
 * nothing can get stuck, and game keys have their default browser behaviour suppressed.
 */

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'KeyR', 'Escape', 'KeyT', 'KeyH', 'KeyM', 'KeyF', 'F3',
])

const keys = new Set<string>()
export const touchState = { throttle: 0, brake: 0, left: 0, right: 0, handbrake: false, steerAxis: 0 }

type Handler = () => void
const pressHandlers = new Map<string, Set<Handler>>()

/** Subscribe to a one-shot key press (e.g. camera change). Returns unsubscribe. */
export function onKeyPress(code: string, fn: Handler) {
  let set = pressHandlers.get(code)
  if (!set) { set = new Set(); pressHandlers.set(code, set) }
  set.add(fn)
  return () => { set!.delete(fn) }
}

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  const down = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    if (typing) return
    if (GAME_KEYS.has(e.code)) e.preventDefault()
    if (!e.repeat) {
      keys.add(e.code)
      pressHandlers.get(e.code)?.forEach((f) => f())
    }
  }
  const up = (e: KeyboardEvent) => { keys.delete(e.code) }
  const clear = () => {
    keys.clear()
    touchState.throttle = touchState.brake = touchState.left = touchState.right = 0
    touchState.handbrake = false
    touchState.steerAxis = 0
  }
  window.addEventListener('keydown', down, { passive: false })
  window.addEventListener('keyup', up)
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear() })
  window.addEventListener('contextmenu', (e) => { if ((e.target as HTMLElement)?.closest?.('.touch-controls')) e.preventDefault() })
  // gamepad is polled each frame in readInput
}

const smooth = { steer: 0 }

function gamepad(): { throttle: number; brake: number; steer: number; handbrake: boolean } | null {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
  for (const p of pads) {
    if (!p || !p.connected) continue
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v)
    const rt = p.buttons[7]?.value ?? 0, lt = p.buttons[6]?.value ?? 0
    return { throttle: rt, brake: lt, steer: dead(p.axes[0] ?? 0), handbrake: !!p.buttons[0]?.pressed }
  }
  return null
}

/** Reads the current input into `out`. dt is used to ease keyboard steering. */
export function readInput(out: ControlInput, dt: number) {
  const k = (c: string) => keys.has(c)
  let throttle = k('KeyW') || k('ArrowUp') ? 1 : 0
  let brake = k('KeyS') || k('ArrowDown') ? 1 : 0
  let steerTarget = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0)
  let hb = k('Space')
  throttle = Math.max(throttle, touchState.throttle)
  brake = Math.max(brake, touchState.brake)
  steerTarget += touchState.right - touchState.left + touchState.steerAxis
  hb = hb || touchState.handbrake
  const gp = gamepad()
  if (gp) {
    throttle = Math.max(throttle, gp.throttle)
    brake = Math.max(brake, gp.brake)
    steerTarget += gp.steer
    hb = hb || gp.handbrake
  }
  steerTarget = Math.max(-1, Math.min(1, steerTarget))
  // ease keyboard steering so taps are gentle; analogue values pass through
  const rate = steerTarget === 0 ? 9 : 5.5
  smooth.steer += (steerTarget - smooth.steer) * Math.min(1, rate * dt)
  out.throttle = throttle
  out.brake = brake
  out.steer = smooth.steer
  out.handbrake = hb
}

export const resetSteer = () => { smooth.steer = 0 }
export const isTouchDevice = () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
