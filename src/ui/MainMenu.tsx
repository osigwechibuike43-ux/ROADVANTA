import { useMemo, useState } from 'react'
import { MISSIONS, MISSION_TYPE_LABEL, type MissionDef } from '../config/missions'
import { PROGRESSION } from '../config/game'
import { getVehicle } from '../config/vehicles'
import { enterMenu } from '../game/session'
import { sfx } from '../core/audio'
import { formatTime } from '../core/math'
import { useStore } from '../core/store'
import { Button, Stars } from './components'

function PlayerBadge() {
  const save = useStore((s) => s.save)
  const need = PROGRESSION.xpForLevel(save.level)
  const pct = save.level >= PROGRESSION.maxLevel ? 100 : Math.round((save.xp / need) * 100)
  return (
    <div className="badge" aria-label={`Level ${save.level}, ${save.coins} coins`}>
      <div className="lvl">LV {save.level}</div>
      <div className="xpbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      <div className="coins">◎ {save.coins.toLocaleString()}</div>
    </div>
  )
}

export function MainMenu() {
  const go = useStore((s) => s.go)
  const startSession = useStore((s) => s.startSession)
  const selected = useStore((s) => s.save.selected)
  return (
    <div className="screen menu">
      <PlayerBadge />
      <div className="menu-card">
        <h1 className="logo">ROAD<b>VANTA</b></h1>
        <p className="tagline">Drive Your World.</p>
        <div className="menu-list">
          <Button onClick={() => startSession('free')}>Free Drive</Button>
          <Button kind="ghost" onClick={() => go('modes')}>Game Modes</Button>
          <Button kind="ghost" onClick={() => go('garage')}>Garage</Button>
          <Button kind="ghost" onClick={() => go('settings')}>Settings</Button>
        </div>
        <p className="hint">Current car: <strong>{getVehicle(selected).name}</strong></p>
      </div>
    </div>
  )
}

type ListMode = 'career' | 'race' | 'police'

export function Modes() {
  const go = useStore((s) => s.go)
  const startSession = useStore((s) => s.startSession)
  const level = useStore((s) => s.save.level)
  const [list, setList] = useState<ListMode | null>(null)
  if (list) return <Missions mode={list} onBack={() => setList(null)} />
  const cards: { id: ListMode | 'free'; title: string; text: string; lock?: number }[] = [
    { id: 'free', title: 'Free Drive', text: 'Cruise the city with live traffic and pedestrians. Break the law and the police will notice.' },
    { id: 'career', title: 'Career', text: 'Destinations, deliveries, time trials, distance and skill challenges. Earn XP and coins.' },
    { id: 'race', title: 'Street Racing', text: 'Race rivals through checkpoints on public roads. Placement decides your payout.' },
    { id: 'police', title: 'Police Chase', text: 'Patrol cars are after you. Lose them or reach the safe house.' },
  ]
  return (
    <div className="screen">
      <header className="topbar">
        <Button kind="ghost" small onClick={() => go('menu')}>← Back</Button>
        <h2>Game Modes</h2>
        <PlayerBadge />
      </header>
      <div className="cards">
        {cards.map((c) => {
          const missions = c.id === 'free' ? [] : missionsFor(c.id)
          const unlockAt = missions.length ? Math.min(...missions.map((m) => m.minLevel)) : 1
          const locked = level < unlockAt
          return (
            <button key={c.id} className="card mode" disabled={locked} onClick={() => { sfx.click(); c.id === 'free' ? startSession('free') : setList(c.id) }}>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
              <span className="meta">{locked ? `Unlocks at level ${unlockAt}` : c.id === 'free' ? 'Always available' : `${missions.length} missions`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const missionsFor = (mode: ListMode): MissionDef[] =>
  MISSIONS.filter((m) => (mode === 'race' ? m.type === 'race' : mode === 'police' ? m.type === 'police' : m.type !== 'race' && m.type !== 'police'))

export function Missions({ mode, onBack }: { mode?: ListMode; onBack?: () => void }) {
  const go = useStore((s) => s.go)
  const save = useStore((s) => s.save)
  const startSession = useStore((s) => s.startSession)
  const list = useMemo(() => missionsFor(mode ?? 'career'), [mode])
  const title = mode === 'race' ? 'Street Racing' : mode === 'police' ? 'Police Chase' : 'Career'
  return (
    <div className="screen">
      <header className="topbar">
        <Button kind="ghost" small onClick={onBack ?? (() => go('menu'))}>← Back</Button>
        <h2>{title}</h2>
        <PlayerBadge />
      </header>
      <ul className="missions">
        {list.map((m) => {
          const done = save.completed[m.id]
          const locked = save.level < m.minLevel
          return (
            <li key={m.id}>
              <button className={`mission${locked ? ' locked' : ''}`} disabled={locked} onClick={() => { sfx.click(); startSession(mode ?? 'career', m.id) }}>
                <div className="m-head">
                  <span className="m-type">{MISSION_TYPE_LABEL[m.type]}</span>
                  <Stars n={m.difficulty} />
                </div>
                <h3>{m.title}{done ? <em className="done"> ✓ ×{done.count}</em> : null}</h3>
                <p>{m.description}</p>
                <div className="m-foot">
                  <span>◎ {m.reward.coins} · {m.reward.xp} XP</span>
                  {m.timeLimit ? <span>Limit {formatTime(m.timeLimit)}</span> : null}
                  {done?.bestTime !== undefined ? <span>Best {formatTime(done.bestTime)}</span> : null}
                  {locked ? <span className="lock">Level {m.minLevel}</span> : null}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Exposed so the pause menu can quit cleanly. */
export function quitToMenu() {
  enterMenu()
  useStore.setState({ screen: 'menu', prevScreen: 'menu', results: null })
}
