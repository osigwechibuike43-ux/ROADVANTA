import { useEffect, useState } from 'react'
import { PAINT_COLORS, UPGRADES, VEHICLES, effectiveSpec, getVehicle, vehicleStats } from '../config/vehicles'
import { sfx } from '../core/audio'
import { customOf, useStore } from '../core/store'
import { Button } from './components'

const Bar = ({ label, base, value }: { label: string; base: number; value: number }) => (
  <div className="stat">
    <span>{label}</span>
    <div className="bar"><div className="base" style={{ width: `${Math.min(100, base)}%` }} /><div className="up" style={{ width: `${Math.min(100, value)}%` }} /></div>
    <b>{value}</b>
  </div>
)

export function Garage() {
  const save = useStore((s) => s.save)
  const preview = useStore((s) => s.previewId ?? s.save.selected)
  const { go, setPreview, selectVehicle, buyVehicle, paintVehicle, buyUpgrade, upgradeCost, showToast } = useStore.getState()
  const [msg, setMsg] = useState('')
  useEffect(() => { setPreview(save.selected); return () => setPreview(null) }, [setPreview, save.selected])

  const v = getVehicle(preview)
  const owned = save.owned.includes(v.id)
  const c = customOf(save, v.id)
  const base = vehicleStats(v)
  const eff = vehicleStats(effectiveSpec(v, c.upgrades))
  const flash = (r: { ok: boolean; reason?: string }, ok: string) => {
    if (r.ok) { sfx.coin(); setMsg(ok) } else { sfx.error(); setMsg(r.reason ?? 'Not possible') }
    showToast(r.ok ? ok : r.reason ?? 'Not possible', r.ok ? 'good' : 'bad')
  }

  return (
    <div className="screen garage">
      <header className="topbar">
        <Button kind="ghost" small onClick={() => go('menu')}>← Back</Button>
        <h2>Garage</h2>
        <div className="badge"><div className="lvl">LV {save.level}</div><div className="coins">◎ {save.coins.toLocaleString()}</div></div>
      </header>
      <div className="garage-body">
        <ul className="car-list" aria-label="Vehicles">
          {VEHICLES.map((car) => {
            const own = save.owned.includes(car.id)
            const lock = save.level < car.unlockLevel
            return (
              <li key={car.id}>
                <button className={`car${car.id === v.id ? ' on' : ''}${car.id === save.selected ? ' sel' : ''}`} onClick={() => { sfx.click(); setPreview(car.id); setMsg('') }}>
                  <strong>{car.name}</strong>
                  <small>{car.cls}</small>
                  <span>{car.id === save.selected ? 'Selected' : own ? 'Owned' : lock ? `Level ${car.unlockLevel}` : `◎ ${car.price.toLocaleString()}`}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="panel">
          <h3>{v.name} <small>{v.cls}</small></h3>
          <Bar label="Top speed" base={base.topSpeed / 2.4} value={Math.round(eff.topSpeed / 2.4)} />
          <p className="hint">{eff.topSpeed} km/h top speed</p>
          <Bar label="Acceleration" base={base.acceleration} value={eff.acceleration} />
          <Bar label="Handling" base={base.handling} value={eff.handling} />
          <Bar label="Braking" base={base.braking} value={eff.braking} />
          {owned ? (
            <>
              <h4>Paint</h4>
              <div className="swatches">
                {PAINT_COLORS.map((p) => {
                  const has = save.ownedPaints.includes(p.hex)
                  return (
                    <button key={p.hex} className={`swatch${c.color === p.hex ? ' on' : ''}`} style={{ background: p.hex }} aria-label={`${p.name}${has ? '' : ` ◎${p.price}`}`} title={`${p.name}${has ? '' : ` — ◎${p.price}`}`} onClick={() => flash(paintVehicle(v.id, p.hex), `Painted ${p.name}`)}>
                      {!has && <i>◎</i>}
                    </button>
                  )
                })}
              </div>
              <h4>Upgrades</h4>
              {UPGRADES.map((u) => {
                const lvl = c.upgrades[u.id]
                const max = lvl >= u.maxLevel
                return (
                  <div className="upgrade" key={u.id}>
                    <span>{u.name}</span>
                    <span className="pips">{Array.from({ length: u.maxLevel }, (_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</span>
                    <Button small kind="ghost" disabled={max} onClick={() => flash(buyUpgrade(v.id, u.id), `${u.name} upgraded`)}>{max ? 'Max' : `◎ ${upgradeCost(v.id, u.id).toLocaleString()}`}</Button>
                  </div>
                )
              })}
              <div className="row">
                <Button disabled={save.selected === v.id} onClick={() => { selectVehicle(v.id); setMsg(`${v.name} selected`) }}>{save.selected === v.id ? 'Selected' : 'Select'}</Button>
              </div>
            </>
          ) : (
            <div className="row">
              <Button disabled={save.level < v.unlockLevel} onClick={() => flash(buyVehicle(v.id), `Purchased ${v.name}`)}>
                {save.level < v.unlockLevel ? `Unlocks at level ${v.unlockLevel}` : `Buy for ◎ ${v.price.toLocaleString()}`}
              </Button>
            </div>
          )}
          <p className="hint" role="status" aria-live="polite">{msg}</p>
        </div>
      </div>
    </div>
  )
}
