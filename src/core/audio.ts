import { onPlayEvent, rt } from './runtime'
import { useStore } from './store'

/**
 * Procedural WebAudio: engine, tyres, wind, city ambience, siren, music and UI sounds.
 * Everything is synthesised at runtime (no audio files). Sounds are mixed with simple
 * distance/intensity gains; this is not positional 3D audio.
 */

type Bus = { master: GainNode; engine: GainNode; env: GainNode; music: GainNode }

class Sfx {
  private ctx: AudioContext | null = null
  private bus: Bus | null = null
  private eng: { o1: OscillatorNode; o2: OscillatorNode; filt: BiquadFilterNode; gain: GainNode } | null = null
  private tire: { gain: GainNode; filt: BiquadFilterNode } | null = null
  private wind: { gain: GainNode; filt: BiquadFilterNode } | null = null
  private amb: { gain: GainNode } | null = null
  private siren: { o: OscillatorNode; gain: GainNode } | null = null
  private noise: AudioBuffer | null = null
  private musicT = 0
  private musicStep = 0
  private lastCount = 0
  private ready = false
  /** True when the browser blocks audio (no user gesture yet). */
  get blocked() { return !this.ctx || this.ctx.state !== 'running' }

  /** Must be called from a user gesture (click / key / touch). Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.build()
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch { /* audio is optional */ }
  }

  private build() {
    const c = this.ctx!
    const mk = (v = 1) => { const g = c.createGain(); g.gain.value = v; return g }
    const master = mk(0.8), engine = mk(0.7), env = mk(0.6), music = mk(0.5)
    master.connect(c.destination)
    const comp = c.createDynamicsCompressor()
    engine.connect(comp); env.connect(comp); music.connect(comp); comp.connect(master)
    this.bus = { master, engine, env, music }

    // white-noise buffer shared by all noise sources
    const len = c.sampleRate * 2
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.noise = buf
    const loop = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s }

    // engine
    const o1 = c.createOscillator(); o1.type = 'sawtooth'
    const o2 = c.createOscillator(); o2.type = 'square'
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 600; ef.Q.value = 2
    const eg = mk(0)
    o1.connect(ef); o2.connect(ef); ef.connect(eg); eg.connect(engine)
    o1.start(); o2.start()
    this.eng = { o1, o2, filt: ef, gain: eg }

    // tyre squeal
    const ts = loop(); const tf = c.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1700; tf.Q.value = 3
    const tg = mk(0); ts.connect(tf); tf.connect(tg); tg.connect(env)
    this.tire = { gain: tg, filt: tf }
    // wind / road
    const ws = loop(); const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500
    const wg = mk(0); ws.connect(wf); wf.connect(wg); wg.connect(env)
    this.wind = { gain: wg, filt: wf }
    // city ambience
    const as = loop(); const af = c.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 280
    const ag = mk(0.05); as.connect(af); af.connect(ag); ag.connect(env)
    this.amb = { gain: ag }
    // siren
    const so = c.createOscillator(); so.type = 'triangle'
    const sg = mk(0); so.connect(sg); sg.connect(env); so.start()
    this.siren = { o: so, gain: sg }
    this.ready = true
  }

  private env(t: number, g: AudioParam, from: number, peak: number, attack: number, release: number) {
    g.cancelScheduledValues(t)
    g.setValueAtTime(from, t)
    g.linearRampToValueAtTime(peak, t + attack)
    g.exponentialRampToValueAtTime(0.0001, t + attack + release)
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.25, dest?: GainNode, glide = 0) {
    const c = this.ctx
    if (!c || !this.bus || c.state !== 'running') return
    const o = c.createOscillator(); const g = c.createGain()
    o.type = type
    const t = c.currentTime
    o.frequency.setValueAtTime(freq, t)
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur)
    this.env(t, g.gain, 0.0001, vol, 0.01, dur)
    o.connect(g); g.connect(dest ?? this.bus.env)
    o.start(t); o.stop(t + dur + 0.05)
  }

  private burst(dur: number, freq: number, vol: number, q = 0.8, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx
    if (!c || !this.bus || !this.noise || c.state !== 'running') return
    const s = c.createBufferSource(); s.buffer = this.noise
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
    const g = c.createGain()
    const t = c.currentTime
    this.env(t, g.gain, 0.0001, vol, 0.004, dur)
    s.connect(f); f.connect(g); g.connect(this.bus.env)
    s.start(t, Math.random()); s.stop(t + dur + 0.05)
  }

  click() { this.tone(660, 0.07, 'triangle', 0.12, this.bus?.music) }
  back() { this.tone(440, 0.08, 'triangle', 0.1, this.bus?.music) }
  coin() { this.tone(988, 0.12, 'square', 0.08, this.bus?.music); setTimeout(() => this.tone(1319, 0.2, 'square', 0.08, this.bus?.music), 90) }
  error() { this.tone(180, 0.18, 'sawtooth', 0.1, this.bus?.music) }
  beep(go = false) { this.tone(go ? 1040 : 640, go ? 0.5 : 0.18, 'square', 0.12, this.bus?.music) }
  success() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'triangle', 0.14, this.bus?.music), i * 110)) }
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.09, this.bus?.music), i * 160)) }
  horn() { this.tone(420, 0.45, 'square', 0.1); this.tone(525, 0.45, 'square', 0.08) }
  crash(impact: number) {
    const v = Math.min(1, impact / 12)
    this.burst(0.15 + v * 0.35, 900 + v * 900, 0.25 + v * 0.5, 0.7)
    this.tone(90 - v * 30, 0.25, 'sine', 0.3 * v + 0.1, undefined, 0.5)
  }
  thump() { this.tone(120, 0.2, 'sine', 0.35, undefined, 0.5); this.burst(0.12, 400, 0.25) }

  private updateMusic(dt: number, playing: boolean) {
    const c = this.ctx
    if (!c || !this.bus || c.state !== 'running') return
    this.musicT -= dt
    if (this.musicT > 0) return
    // slow minor-pentatonic pad pattern; louder in menus, softer while driving
    const prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]]
    const chord = prog[this.musicStep % 4]
    this.musicStep++
    this.musicT = playing ? 3.2 : 2.6
    for (const n of chord) {
      const f = 440 * Math.pow(2, (n - 69) / 12)
      this.tone(f, this.musicT * 1.15, 'triangle', playing ? 0.035 : 0.06, this.bus.music)
    }
    this.tone(440 * Math.pow(2, (chord[0] - 81) / 12), this.musicT, 'sine', 0.06, this.bus.music)
  }

  update(dt: number) {
    if (!this.ready || !this.ctx || !this.bus) return
    const c = this.ctx
    if (c.state !== 'running') return
    const st = useStore.getState()
    const s = st.save.settings
    const t = c.currentTime
    const mv = s.muted ? 0 : s.master
    this.bus.master.gain.setTargetAtTime(mv, t, 0.05)
    this.bus.engine.gain.setTargetAtTime(s.engine, t, 0.05)
    this.bus.env.gain.setTargetAtTime(s.environment, t, 0.05)
    this.bus.music.gain.setTargetAtTime(s.music, t, 0.05)

    const driving = rt.playing && !rt.paused && st.screen === 'playing'
    const p = rt.player
    this.updateMusic(dt, driving)

    // countdown beeps
    if (rt.countdown > 0) {
      const n = Math.ceil(rt.countdown)
      if (n !== this.lastCount && n >= 1 && n <= 3) this.beep(false)
      this.lastCount = n
    } else if (this.lastCount > 0) { this.beep(true); this.lastCount = 0 }

    if (!driving || !p || !this.eng || !this.tire || !this.wind || !this.siren || !this.amb) {
      this.eng && this.eng.gain.gain.setTargetAtTime(0, t, 0.08)
      this.tire && this.tire.gain.gain.setTargetAtTime(0, t, 0.08)
      this.wind && this.wind.gain.gain.setTargetAtTime(0, t, 0.08)
      this.siren && this.siren.gain.gain.setTargetAtTime(0, t, 0.08)
      this.amb && this.amb.gain.gain.setTargetAtTime(st.screen === 'playing' ? 0.05 : 0.02, t, 0.2)
      return
    }
    const moto = p.spec.body === 'moto'
    const base = (moto ? 70 : 42) + p.rpm * (moto ? 260 : 170)
    this.eng.o1.frequency.setTargetAtTime(base, t, 0.04)
    this.eng.o2.frequency.setTargetAtTime(base * 0.5, t, 0.04)
    this.eng.filt.frequency.setTargetAtTime(350 + p.rpm * 1400 + p.input.throttle * 500, t, 0.05)
    this.eng.gain.gain.setTargetAtTime(0.06 + p.input.throttle * 0.07 + p.rpm * 0.03, t, 0.05)

    const spd = Math.abs(p.speed)
    this.tire.gain.gain.setTargetAtTime(Math.min(0.28, Math.max(0, p.slip - 0.35) * 0.55 + (p.braking && spd > 20 ? 0.06 : 0)), t, 0.05)
    this.tire.filt.frequency.setTargetAtTime(1300 + spd * 22, t, 0.1)
    this.wind.gain.gain.setTargetAtTime(Math.min(0.3, (spd / 60) ** 1.6 * 0.4), t, 0.1)
    this.wind.filt.frequency.setTargetAtTime(300 + spd * 22, t, 0.1)
    this.amb.gain.gain.setTargetAtTime(0.05 + rt.trafficNear * 0.05, t, 0.3)

    // siren: two-tone wail, gain from nearest police distance
    const sw = 700 + Math.sin(performance.now() / 1000 * 5.5) * 280
    this.siren.o.frequency.setTargetAtTime(sw, t, 0.02)
    this.siren.gain.gain.setTargetAtTime(rt.sirenNear * 0.09, t, 0.1)
  }
}

export const sfx = new Sfx()

/** Wire gameplay events to sounds once. */
let wired = false
export function wireAudioEvents() {
  if (wired) return
  wired = true
  onPlayEvent((e) => {
    if (e.type === 'crash') sfx.crash(e.impact)
    else if (e.type === 'ped-hit') sfx.thump()
    else if (e.type === 'horn') sfx.horn()
  })
  const unlock = () => sfx.unlock()
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock, { passive: true })
}
