import { useEffect, useRef } from 'react'
import { city, EXTENT, nodeX, nodeZ } from '../world/city'
import { rt } from '../core/runtime'
import { useStore } from '../core/store'
import { formatTime } from '../core/math'
import { fleet } from '../sim/fleet'
import { S, playerBody } from '../game/session'

const SIZE = 168
const RANGE = 150

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = SIZE * dpr; cv.height = SIZE * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    let raf = 0, last = 0
    const lines: { h: number; w: number }[] = []
    for (let i = 0; i < 7; i++) lines.push({ h: nodeX(i), w: i === 3 ? 7 : 4.5 })
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 50) return
      last = t
      const p = playerBody
      const sc = SIZE / 2 / RANGE
      const sh = Math.sin(p.heading), ch = Math.cos(p.heading)
      const tr = (x: number, z: number): [number, number] => {
        const dx = x - p.x, dz = z - p.z
        return [SIZE / 2 + (-dx * ch + dz * sh) * sc, SIZE / 2 - (dx * sh + dz * ch) * sc]
      }
      g.clearRect(0, 0, SIZE, SIZE)
      g.save()
      g.beginPath(); g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2); g.clip()
      g.fillStyle = 'rgba(12,16,22,0.88)'; g.fillRect(0, 0, SIZE, SIZE)
      g.lineCap = 'butt'
      g.strokeStyle = '#4a5568'
      for (const l of lines) {
        g.lineWidth = l.w * 2 * sc
        let a = tr(l.h, -EXTENT), b = tr(l.h, EXTENT)
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke()
        a = tr(-EXTENT, l.h); b = tr(EXTENT, l.h)
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke()
      }
      // buildings as faint blocks near the player
      g.fillStyle = 'rgba(80,92,110,0.28)'
      for (const b of city.buildings) {
        if (Math.abs(b.x - p.x) > RANGE || Math.abs(b.z - p.z) > RANGE) continue
        const [x, y] = tr(b.x, b.z)
        g.fillRect(x - 2, y - 2, 4, 4)
      }
      // markers
      for (const m of S.markers) {
        const [x, y] = tr(m.x, m.z)
        const dx = x - SIZE / 2, dy = y - SIZE / 2
        const d = Math.hypot(dx, dy), lim = SIZE / 2 - 9
        const k = d > lim ? lim / d : 1
        g.fillStyle = m.color
        g.beginPath(); g.arc(SIZE / 2 + dx * k, SIZE / 2 + dy * k, d > lim ? 4 : 5.5, 0, Math.PI * 2); g.fill()
        g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke()
      }
      // other vehicles
      for (const a of fleet.agents) {
        if (a.kind !== 'police' && a.kind !== 'racer') continue
        const [x, y] = tr(a.body.x, a.body.z)
        if (Math.hypot(x - SIZE / 2, y - SIZE / 2) > SIZE / 2) continue
        g.fillStyle = a.kind === 'police' ? (Math.floor(performance.now() / 250) % 2 ? '#ff3b3b' : '#3b7bff') : '#ffd23a'
        g.fillRect(x - 3, y - 3, 6, 6)
      }
      // player arrow
      g.fillStyle = '#fff'
      g.beginPath(); g.moveTo(SIZE / 2, SIZE / 2 - 8); g.lineTo(SIZE / 2 + 5.5, SIZE / 2 + 6); g.lineTo(SIZE / 2, SIZE / 2 + 3); g.lineTo(SIZE / 2 - 5.5, SIZE / 2 + 6); g.closePath(); g.fill()
      g.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="minimap" style={{ width: SIZE, height: SIZE }} aria-label="Minimap" role="img" />
}

export function Hud() {
  const hud = useStore((s) => s.hud)
  const save = useStore((s) => s.save)
  const touch = useStore((s) => s.touch)
  const unit = save.settings.speedUnit === 'kmh' ? 'km/h' : 'mph'
  const showFps = rt.debug
  return (
    <div className={`hud${touch ? ' touch' : ''}`} aria-live="off">
      <div className="hud-top">
        <div className="objective">
          <strong>{hud.objective}</strong>
          <span>{hud.sub}</span>
          {hud.progress !== null && <div className="xpbar"><div style={{ width: `${Math.round(hud.progress * 100)}%` }} /></div>}
        </div>
        <div className="hud-right">
          {hud.timer !== null && <div className="timer"><small>{hud.timerLabel}</small>{formatTime(hud.timer)}</div>}
          {hud.position && <div className="pos">{hud.position}</div>}
          <div className="wallet"><span>LV {save.level}</span><span>◎ {save.coins.toLocaleString()}</span></div>
        </div>
      </div>
      {hud.wanted > 0 && (
        <div className="wanted" role="status">{'★'.repeat(hud.wanted)}<i>{'★'.repeat(3 - hud.wanted)}</i> POLICE</div>
      )}
      {hud.wanted === 0 && hud.heat > 0.08 && (
        <div className="heat" title="Police attention"><div style={{ width: `${hud.heat * 100}%` }} /></div>
      )}
      {hud.message && <div className={`banner ${hud.messageKind}`} key={hud.message}>{hud.message}</div>}
      <div className="hud-bottom">
        <Minimap />
        <div className="speedo" aria-label={`Speed ${hud.speed} ${unit}`}>
          <div className="rpm"><div style={{ width: `${Math.round(hud.rpm * 100)}%` }} /></div>
          <div className="num">{hud.speed}</div>
          <div className="unit">{unit} · <b>{hud.gear}</b></div>
        </div>
      </div>
      {showFps && <div className="fps">{Math.round(rt.fps)} fps</div>}
    </div>
  )
}
