import { useRef, type CSSProperties, type ReactNode } from 'react'
import { rt } from '../core/runtime'
import { touchState } from '../core/input'
import { useStore } from '../core/store'
import { respawnPlayer } from '../game/session'

type Key = 'left' | 'right' | 'throttle' | 'brake' | 'handbrake'

function Hold({ k, className, children, label }: { k: Key; className: string; children: ReactNode; label: string }) {
  const ids = useRef(new Set<number>())
  const set = (on: boolean) => { (touchState as Record<Key, number | boolean>)[k] = k === 'handbrake' ? on : on ? 1 : 0 }
  return (
    <button
      className={`tc ${className}`}
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); ids.current.add(e.pointerId); set(true) }}
      onPointerUp={(e) => { ids.current.delete(e.pointerId); if (ids.current.size === 0) set(false) }}
      onPointerCancel={(e) => { ids.current.delete(e.pointerId); if (ids.current.size === 0) set(false) }}
      onLostPointerCapture={(e) => { ids.current.delete(e.pointerId); if (ids.current.size === 0) set(false) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export function TouchControls() {
  const go = useStore((s) => s.go)
  const style: CSSProperties = {}
  return (
    <div className="touch-controls" style={style}>
      <div className="tc-left">
        <Hold k="left" className="tc-steer" label="Steer left">◀</Hold>
        <Hold k="right" className="tc-steer" label="Steer right">▶</Hold>
      </div>
      <div className="tc-mid">
        <button className="tc tc-small" aria-label="Pause" onClick={() => go('paused')}>II</button>
        <button className="tc tc-small" aria-label="Change camera" onClick={() => { rt.camera = (rt.camera + 1) % 3 }}>CAM</button>
        <button className="tc tc-small" aria-label="Reset car" onClick={respawnPlayer}>RST</button>
      </div>
      <div className="tc-right">
        <Hold k="handbrake" className="tc-hb" label="Handbrake">HB</Hold>
        <Hold k="brake" className="tc-pedal tc-brake" label="Brake and reverse">BRAKE</Hold>
        <Hold k="throttle" className="tc-pedal tc-gas" label="Accelerator">GAS</Hold>
      </div>
    </div>
  )
}
