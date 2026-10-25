import { Canvas } from '@react-three/fiber'
import { Suspense, lazy, useEffect } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { GRAPHICS } from './config/game'
import { sfx, wireAudioEvents } from './core/audio'
import { installInput, onKeyPress } from './core/input'
import { emit, rt } from './core/runtime'
import { useStore } from './core/store'
import { GameScene } from './game/GameScene'
import { Sky } from './world/Sky'
import { World } from './world/World'
import { ErrorBoundary } from './ui/components'
import { Garage } from './ui/Garage'
import { Hud } from './ui/Hud'
import { MainMenu, Missions, Modes } from './ui/MainMenu'
import { ControlsGuide, PauseMenu, Results } from './ui/Overlays'
import { SettingsPanel } from './ui/SettingsPanel'
import { TouchControls } from './ui/TouchControls'

const Preview = lazy(() => import('./dev/Preview'))

function useEnvironment() {
  const setEnv = useStore((s) => s.setEnv)
  useEffect(() => {
    const upd = () => setEnv({
      portrait: window.innerHeight > window.innerWidth && window.innerWidth < 800,
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    })
    upd()
    window.addEventListener('resize', upd)
    window.addEventListener('orientationchange', upd)
    return () => { window.removeEventListener('resize', upd); window.removeEventListener('orientationchange', upd) }
  }, [setEnv])
}

function useKeys() {
  useEffect(() => {
    installInput()
    wireAudioEvents()
    const off = [
      onKeyPress('Escape', () => {
        const st = useStore.getState()
        if (st.screen === 'playing') st.go('paused')
        else if (st.screen === 'paused') st.go('playing')
      }),
      onKeyPress('KeyH', () => { if (useStore.getState().screen === 'playing') emit({ type: 'horn' }) }),
      onKeyPress('KeyF3', () => { rt.debug = !rt.debug }),
    ]
    // auto-pause when the tab is hidden so the car does not drive itself into a wall
    const vis = () => { const st = useStore.getState(); if (document.hidden && st.screen === 'playing') st.go('paused') }
    document.addEventListener('visibilitychange', vis)
    return () => { off.forEach((f) => f()); document.removeEventListener('visibilitychange', vis) }
  }, [])
}

function Overlay() {
  const screen = useStore((s) => s.screen)
  switch (screen) {
    case 'menu': return <MainMenu />
    case 'modes': return <Modes />
    case 'missions': return <Missions />
    case 'garage': return <Garage />
    case 'settings': return <SettingsPanel />
    case 'controls': return <ControlsGuide />
    case 'paused': return <><Hud /><PauseMenu /></>
    case 'results': return <><Hud /><Results /></>
    case 'playing': return <Hud />
    default: return null
  }
}

function Game() {
  const gfx = useStore((s) => s.save.settings.graphics)
  const g = GRAPHICS[gfx]
  const setReady = useStore((s) => s.setAssetsReady)
  return (
    <Canvas
      key={g.antialias ? 'aa' : 'noaa'}
      shadows={g.shadows}
      dpr={Math.min(g.dpr, window.devicePixelRatio || 1)}
      camera={{ fov: 62, near: 0.25, far: g.drawDistance + 700 }}
      gl={{ antialias: g.antialias, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.82, outputColorSpace: SRGBColorSpace, powerPreference: 'high-performance' }}
      onCreated={() => setReady(true)}
      style={{ position: 'fixed', inset: 0 }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Sky />
        <World />
        <GameScene />
      </Suspense>
    </Canvas>
  )
}

function Toast() {
  const toast = useStore((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.setState({ toast: null }), 2200)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast) return null
  return <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>
}

function Splash() {
  const ready = useStore((s) => s.assetsReady)
  if (ready) return null
  return <div className="splash" role="status"><h1 className="logo">ROAD<b>VANTA</b></h1><p>Building the city…</p></div>
}

export function App() {
  useEnvironment()
  useKeys()
  const touch = useStore((s) => s.touch)
  const portrait = useStore((s) => s.portrait)
  const screen = useStore((s) => s.screen)
  const muted = useStore((s) => s.save.settings.muted)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) return <Suspense fallback={null}><Preview /></Suspense>
  void sfx; void muted
  return (
    <ErrorBoundary>
      <Game />
      <div className="ui">
        <Overlay />
        <Toast />
        {touch && screen === 'playing' && <TouchControls />}
        {touch && portrait && screen === 'playing' && (
          <div className="rotate" role="alert"><div>⟳</div><p>Rotate your phone to landscape for the best driving experience.</p></div>
        )}
      </div>
      <Splash />
    </ErrorBoundary>
  )
}
