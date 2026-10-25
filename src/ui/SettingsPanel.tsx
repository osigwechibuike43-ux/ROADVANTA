import { useState } from 'react'
import { useStore } from '../core/store'
import type { GraphicsQuality } from '../config/game'
import { Button, Confirm, Segmented, Slider } from './components'

export function SettingsPanel({ embedded }: { embedded?: boolean }) {
  const s = useStore((st) => st.save.settings)
  const upd = useStore((st) => st.updateSettings)
  const back = useStore((st) => st.back)
  const reset = useStore((st) => st.resetProgress)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className={embedded ? 'settings embedded' : 'screen settings-screen'}>
      <header className="topbar">
        <Button kind="ghost" small onClick={back}>← Back</Button>
        <h2>Settings</h2>
        <span />
      </header>
      <div className="settings">
        <section>
          <h4>Graphics</h4>
          <Segmented<GraphicsQuality> label="Quality preset" value={s.graphics} onChange={(v) => upd({ graphics: v })}
            options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]} />
          <p className="hint">Low: no shadows, light traffic — best for phones. High: sharp shadows, dense traffic.</p>
          <Slider label="Camera distance" value={s.cameraDistance} min={0.6} max={1.6} step={0.05} onChange={(v) => upd({ cameraDistance: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Segmented label="Speed unit" value={s.speedUnit} onChange={(v) => upd({ speedUnit: v })} options={[{ id: 'kmh', label: 'km/h' }, { id: 'mph', label: 'mph' }]} />
        </section>
        <section>
          <h4>Audio</h4>
          <Slider label="Master" value={s.master} onChange={(v) => upd({ master: v })} />
          <Slider label="Engine" value={s.engine} onChange={(v) => upd({ engine: v })} />
          <Slider label="Environment" value={s.environment} onChange={(v) => upd({ environment: v })} />
          <Slider label="Music" value={s.music} onChange={(v) => upd({ music: v })} />
          <label className="check"><input type="checkbox" checked={s.muted} onChange={(e) => upd({ muted: e.target.checked })} /> Mute all audio</label>
        </section>
        <section>
          <h4>Save data</h4>
          <p className="hint">Progress is stored only in this browser (local storage).</p>
          <Button kind="danger" small onClick={() => setConfirm(true)}>Reset all progress</Button>
        </section>
      </div>
      {confirm && (
        <Confirm title="Reset all progress?" text="This permanently deletes your level, coins, vehicles and mission records on this device." confirmLabel="Delete everything" danger onCancel={() => setConfirm(false)} onConfirm={() => { reset(); setConfirm(false) }} />
      )}
    </div>
  )
}
