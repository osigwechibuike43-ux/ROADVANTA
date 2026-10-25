import { useEffect, useState } from 'react'
import { formatTime } from '../core/math'
import { sfx } from '../core/audio'
import { rt } from '../core/runtime'
import { useStore } from '../core/store'
import { Button, Confirm, Segmented, Slider } from './components'
import { quitToMenu } from './MainMenu'

export function PauseMenu() {
  const go = useStore((s) => s.go)
  const request = useStore((s) => s.request)
  const startSession = useStore((s) => s.startSession)
  const settings = useStore((s) => s.save.settings)
  const upd = useStore((s) => s.updateSettings)
  const [confirm, setConfirm] = useState<null | 'restart' | 'quit'>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [cam, setCam] = useState(rt.camera)
  if (showSettings) return <div className="screen overlay"><SettingsPanelWithBack onBack={() => setShowSettings(false)} /></div>
  return (
    <div className="screen overlay pause">
      <div className="menu-card">
        <h2>Paused</h2>
        <div className="menu-list">
          <Button onClick={() => go('playing')}>Resume</Button>
          <Button kind="ghost" onClick={() => setConfirm('restart')}>Restart</Button>
          <Button kind="ghost" onClick={() => { rt.camera = (rt.camera + 1) % 3; setCam(rt.camera) }}>Camera: {['Chase', 'Far chase', 'Cockpit'][cam]}</Button>
          <Button kind="ghost" onClick={() => upd({ muted: !settings.muted })}>Sound: {settings.muted ? 'Off' : 'On'}</Button>
          <Button kind="ghost" onClick={() => setShowSettings(true)}>Settings</Button>
          <Button kind="danger" onClick={() => setConfirm('quit')}>Quit to menu</Button>
        </div>
      </div>
      {confirm === 'restart' && (
        <Confirm title="Restart?" text="Your current attempt will be lost." confirmLabel="Restart" onCancel={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); if (request) startSession(request.mode, request.missionId) }} />
      )}
      {confirm === 'quit' && (
        <Confirm title="Quit to menu?" text="Progress in the current mission will be lost." confirmLabel="Quit" danger onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); quitToMenu() }} />
      )}
    </div>
  )
}

function SettingsPanelWithBack({ onBack }: { onBack: () => void }) {
  const st = useStore((x) => x.save.settings)
  const upd = useStore((x) => x.updateSettings)
  return (
    <div className="menu-card wide">
      <h2>Settings</h2>
      <Segmented label="Quality preset" value={st.graphics} onChange={(v) => upd({ graphics: v })} options={[{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }]} />
      <Slider label="Camera distance" value={st.cameraDistance} min={0.6} max={1.6} onChange={(v) => upd({ cameraDistance: v })} />
      <Slider label="Master volume" value={st.master} onChange={(v) => upd({ master: v })} />
      <Slider label="Engine" value={st.engine} onChange={(v) => upd({ engine: v })} />
      <Slider label="Environment" value={st.environment} onChange={(v) => upd({ environment: v })} />
      <Slider label="Music" value={st.music} onChange={(v) => upd({ music: v })} />
      <div className="row"><Button onClick={onBack}>Done</Button></div>
    </div>
  )
}

export function ControlsGuide() {
  const go = useStore((s) => s.go)
  const mark = useStore((s) => s.markTutorialSeen)
  const touch = useStore((s) => s.touch)
  const start = () => { mark(); go('playing') }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Enter') start() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rows: [string, string][] = touch
    ? [['Left pad', 'Steer'], ['Right pedals', 'Gas / Brake & reverse'], ['HB button', 'Handbrake'], ['Cam / Reset', 'Camera view / put car back on road'], ['⏸', 'Pause']]
    : [['W / ↑', 'Accelerate'], ['S / ↓', 'Brake / reverse'], ['A D / ← →', 'Steer'], ['Space', 'Handbrake (slide!)'], ['C', 'Change camera'], ['R', 'Reset car to road'], ['H', 'Horn'], ['Esc', 'Pause']]
  return (
    <div className="screen overlay">
      <div className="menu-card wide">
        <h2>How to drive</h2>
        <table className="keys"><tbody>{rows.map(([k, d]) => <tr key={k}><th>{k}</th><td>{d}</td></tr>)}</tbody></table>
        <p className="hint">Stop at red lights, watch for pedestrians, and keep an eye on the minimap.</p>
        <div className="row"><Button onClick={start}>Start driving</Button></div>
      </div>
    </div>
  )
}

export function Results() {
  const r = useStore((s) => s.results)
  const request = useStore((s) => s.request)
  const startSession = useStore((s) => s.startSession)
  const go = useStore((s) => s.go)
  useEffect(() => { if (r) (r.success ? sfx.success() : sfx.fail()) }, [r])
  if (!r) return null
  const m = request?.missionId
  return (
    <div className="screen overlay results">
      <div className="menu-card wide">
        <h2 className={r.success ? 'good' : 'bad'}>{r.title}</h2>
        <p>{r.subtitle}</p>
        <dl className="result-grid">
          {r.time !== undefined && <><dt>Time</dt><dd>{formatTime(r.time)}</dd></>}
          <dt>Coins</dt><dd>+{r.coins.toLocaleString()}</dd>
          {r.bonus > 0 && <><dt>{r.bonusLabel}</dt><dd>+{r.bonus.toLocaleString()}</dd></>}
          <dt>XP</dt><dd>+{r.xp}</dd>
          {r.levelAfter > r.levelBefore && <><dt>Level up</dt><dd>{r.levelBefore} → {r.levelAfter}</dd></>}
        </dl>
        {r.details.length > 0 && <ul className="details">{r.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        {r.unlocks.length > 0 && <ul className="details good">{r.unlocks.map((d) => <li key={d}>{d}</li>)}</ul>}
        <div className="row">
          {request && <Button onClick={() => startSession(request.mode, m)}>{r.success ? 'Play again' : 'Retry'}</Button>}
          <Button kind="ghost" onClick={quitToMenu}>Main menu</Button>
        </div>
      </div>
    </div>
  )
}
