import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Quaternion, SpotLight, Vector3, CylinderGeometry, ConeGeometry, PlaneGeometry, InstancedBufferAttribute, type BufferGeometry,
} from 'three'
import { GRAPHICS } from '../config/game'
import { effectiveSpec, getVehicle } from '../config/vehicles'
import { clamp, damp, dampAngle } from '../core/math'
import { emit, rt } from '../core/runtime'
import { customOf, useStore } from '../core/store'
import { readInput, resetSteer, onKeyPress } from '../core/input'
import { peds, updatePeds } from '../sim/pedestrians'
import { fleet } from '../sim/fleet'
import { updateTraffic } from '../sim/traffic'
import { newInput, stepVehicle } from '../vehicles/physics'
import { resolveCollisions } from '../vehicles/collision'
import { makeRig, poseRig } from '../vehicles/factory'
import type { CarRig } from '../vehicles/models'
import { city, collidersNear, EXTENT } from '../world/city'
import { SHOWROOM } from '../world/World'
import { applyPlayerSpec, enterMenu, frozenInput, hookEvents, hudSnapshot, playerBody, respawnPlayer, S, startFromRequest, updateSession } from './session'
import { sfx } from '../core/audio'

const STEP = 1 / 60
const input = newInput()
const near: number[] = []

/* ------------------------------------------------------------------ simulation */
export const dev: { auto: ((i: typeof input, dt: number) => void) | null } = { auto: null }

export function simulate(dtRaw: number) {
  const st = useStore.getState()
  const gfx = GRAPHICS[st.save.settings.graphics]
  if (st.request && st.request.nonce !== S.nonce) startFromRequest(st.request)
  rt.paused = st.screen !== 'playing'
  const dt = Math.min(dtRaw, 0.1)
  rt.fps = damp(rt.fps, 1 / Math.max(dtRaw, 1e-3), 3, dtRaw)

  if (S.phase === 'idle') {
    // showroom turntable
    playerBody.heading += dt * 0.35
    playerBody.pitch = playerBody.roll = 0
    rt.shake = 0
    return
  }
  if (rt.paused) return

  rt.time += dt
  const p = playerBody
  if (dev.auto) dev.auto(input, dt)
  else readInput(input, dt)
  if (S.phase === 'countdown') frozenInput(input)
  else if (S.phase === 'ended') { input.throttle = 0; input.brake = 0.6; input.steer = 0; input.handbrake = false }

  // AI at frame rate
  updateTraffic(dt, gfx.traffic, p)
  updateSession(dt)
  if (S.mode !== 'free' || true) { /* police handled inside session */ }

  // physics sub-steps
  const n = Math.max(1, Math.ceil(dt / STEP))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    stepVehicle(p, input, h)
    for (const a of fleet.agents) stepVehicle(a.body, a.input, h)
    const evs = resolveCollisions(rt.bodies, rt.time)
    for (const e of evs) {
      if (e.a === p || e.b === p) {
        rt.shake = Math.max(rt.shake, clamp(e.impact / 14, 0, 1))
        rt.lastImpact = e.impact
        emit({ type: 'crash', impact: e.impact, x: e.x, z: e.z, kind: e.kind })
      }
    }
    // soft world boundary
    const lim = EXTENT + 50
    if (Math.abs(p.x) > lim) { p.x = clamp(p.x, -lim, lim); p.vx *= -0.2; p.speed *= 0.5 }
    if (Math.abs(p.z) > lim) { p.z = clamp(p.z, -lim, lim); p.vz *= -0.2; p.speed *= 0.5 }
  }
  rt.speedKmh = Math.abs(p.speed) * 3.6
  rt.shake *= Math.exp(-6 * dt)
  updatePeds(dt, gfx.pedestrians, p, rt.bodies)
}

/* ------------------------------------------------------------------ player car */
function PlayerCar() {
  const group = useRef<Group>(null)
  const selected = useStore((s) => (s.screen === 'garage' && s.previewId ? s.previewId : s.save.selected))
  const custom = useStore((s) => s.save.custom[selected])
  const rigRef = useRef<CarRig | null>(null)
  const light = useRef<SpotLight>(null)
  const target = useMemo(() => new Object3D(), [])

  const rig = useMemo(() => {
    const base = getVehicle(selected)
    const c = customOf(useStore.getState().save, base.id)
    applyPlayerSpec()
    const r = makeRig(effectiveSpec(base, c.upgrades), c.color, '#2b6cb0')
    r.paintMats.forEach((m) => m.color.set(c.color))
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, custom])
  rigRef.current = rig
  useEffect(() => () => rig.dispose(), [rig])

  useFrame(() => {
    const r = rigRef.current
    if (!r) return
    const b = playerBody
    poseRig(r, b, rt.night, rt.night > 0.3)
    r.root.visible = !(rt.camera === 2 && S.phase !== 'idle')
    const L = light.current
    if (L) {
      L.visible = rt.night > 0.3 && S.phase !== 'idle'
      L.position.set(b.x + Math.sin(b.heading) * 2, 0.9, b.z + Math.cos(b.heading) * 2)
      target.position.set(b.x + Math.sin(b.heading) * 30, 0, b.z + Math.cos(b.heading) * 30)
      target.updateMatrixWorld()
    }
  })
  return (
    <group ref={group}>
      <primitive object={rig.root} />
      <spotLight ref={light} angle={0.6} penumbra={0.7} intensity={90} distance={55} decay={1.6} color="#fff2d8" target={target} />
      <primitive object={target} />
    </group>
  )
}

/* ------------------------------------------------------------------ camera */
const camPos = new Vector3()
const camLook = new Vector3()
const smoothHeading = { v: 0, init: false }
const camState = { dist: 7.4, h: 2.9, fov: 62, x: 0, y: 3, z: 0, lx: 0, ly: 1, lz: 0, init: false }

function blockedAt(x: number, z: number): boolean {
  collidersNear(x, z, 1, near)
  for (const i of near) {
    const b = city.colliders[i]
    if (b.hx < 2.5 || b.hz < 2.5) continue
    const dx = x - b.x, dz = z - b.z
    const c = Math.cos(b.rot), s = Math.sin(b.rot)
    const lx = dx * c - dz * s, lz = dx * s + dz * c
    if (Math.abs(lx) < b.hx + 0.6 && Math.abs(lz) < b.hz + 0.6) return true
  }
  return false
}

function CameraRig() {
  const { camera } = useThree()
  useEffect(() => onKeyPress('KeyC', () => { if (S.phase !== 'idle' && !rt.paused) rt.camera = (rt.camera + 1) % 3 }), [])
  useFrame((_, dtRaw) => {
    const cam = camera as PerspectiveCamera
    const dt = Math.min(dtRaw, 0.1)
    const b = playerBody
    const settings = useStore.getState().save.settings
    const screen = useStore.getState().screen
    if (S.phase === 'idle') {
      // orbit the showroom car (menus & garage)
      const t = performance.now() / 1000
      const garage = screen === 'garage'
      const r = (garage ? 9.6 : 8.6) * (b.spec.body === 'bus' ? 1.5 : 1)
      const ang = garage ? t * 0.25 + 0.7 : 0.9 + Math.sin(t * 0.15) * 0.35
      camera.position.set(SHOWROOM.x + Math.sin(ang) * r, garage ? 2.1 : 1.7, SHOWROOM.z + Math.cos(ang) * r)
      camera.lookAt(SHOWROOM.x, 0.75, SHOWROOM.z)
      cam.fov = 38; cam.updateProjectionMatrix()
      camState.init = false
      return
    }
    const mode = rt.camera
    const fwdX = Math.sin(b.heading), fwdZ = Math.cos(b.heading)
    if (!smoothHeading.init) { smoothHeading.v = b.heading; smoothHeading.init = true }
    const speed = Math.abs(b.speed)
    // blend heading toward travel direction a little so drifts read well
    smoothHeading.v = dampAngle(smoothHeading.v, b.heading, mode === 2 ? 30 : 5.5, dt)
    const sh = Math.sin(smoothHeading.v), ch = Math.cos(smoothHeading.v)
    const dm = settings.cameraDistance
    let tx: number, ty: number, tz: number, lx: number, ly: number, lz: number, fov: number
    if (mode === 2) {
      const sp = b.spec
      tx = b.x + fwdX * (sp.length * 0.05) ; ty = sp.height * 0.78; tz = b.z + fwdZ * (sp.length * 0.05)
      lx = b.x + fwdX * 30; ly = ty - 0.1; lz = b.z + fwdZ * 30
      fov = 72 + speed * 0.25
    } else {
      const far = mode === 1
      const dist = (far ? 11.5 : 7.4) * dm * (b.spec.body === 'bus' ? 1.5 : 1) + speed * 0.04
      const hgt = (far ? 5.2 : 2.9) * (0.8 + 0.2 * dm) + b.spec.height * 0.3
      let d = dist
      // pull the camera in when buildings are in the way
      for (let k = 1; k <= 8; k++) {
        const f = (dist * k) / 8
        if (blockedAt(b.x - sh * f, b.z - ch * f)) { d = Math.max(2.4, f - dist / 8 - 0.4); break }
      }
      tx = b.x - sh * d; ty = hgt * (d / dist * 0.4 + 0.6); tz = b.z - ch * d
      lx = b.x + sh * 5; ly = b.spec.height * 0.6 + 0.4; lz = b.z + ch * 5
      fov = 60 + clamp(speed * 0.45, 0, 20)
    }
    if (!camState.init) { Object.assign(camState, { x: tx, y: ty, z: tz, lx, ly, lz, init: true }) }
    const k = mode === 2 ? 40 : 11
    camState.x = damp(camState.x, tx, k, dt); camState.y = damp(camState.y, ty, k, dt); camState.z = damp(camState.z, tz, k, dt)
    camState.lx = damp(camState.lx, lx, 14, dt); camState.ly = damp(camState.ly, ly, 14, dt); camState.lz = damp(camState.lz, lz, 14, dt)
    camState.fov = damp(camState.fov, fov, 4, dt)
    const sh2 = rt.shake * 0.35
    camPos.set(camState.x + (Math.random() - 0.5) * sh2, camState.y + (Math.random() - 0.5) * sh2, camState.z + (Math.random() - 0.5) * sh2)
    camLook.set(camState.lx, camState.ly, camState.lz)
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    if (Math.abs(cam.fov - camState.fov) > 0.05) { cam.fov = camState.fov; cam.updateProjectionMatrix() }
  })
  return null
}

/* ------------------------------------------------------------------ pedestrians (instanced) */
const MAXP = 64
function Pedestrians() {
  const refs = useRef<{ torso: InstancedMesh; legs: InstancedMesh; head: InstancedMesh } | null>(null)
  const geos = useMemo(() => {
    const torso = new BoxGeometry(0.46, 0.62, 0.26); torso.translate(0, 1.15, 0)
    const legs = new BoxGeometry(0.34, 0.86, 0.22); legs.translate(0, 0.43, 0)
    const head = new BoxGeometry(0.22, 0.24, 0.22); head.translate(0, 1.62, 0)
    return { torso, legs, head }
  }, [])
  const mats = useMemo(() => ({ m: new MeshStandardMaterial({ roughness: 0.85, metalness: 0 }) }), [])
  const dummy = useMemo(() => new Object3D(), [])
  const col = useMemo(() => new Color(), [])

  useFrame(() => {
    const r = refs.current
    if (!r) return
    const list = peds
    const n = Math.min(list.length, MAXP)
    const t = rt.time
    for (let i = 0; i < n; i++) {
      const p = list[i] as typeof list[number]
      const down = p.down > 0
      const hd = Math.atan2(p.vx, p.vz)
      dummy.position.set(p.x, 0, p.z)
      dummy.rotation.set(down ? -Math.PI / 2 + 0.1 : Math.sin(t * 6 + p.phase) * 0.04, Number.isFinite(hd) ? hd : 0, 0)
      dummy.scale.setScalar(p.scale)
      if (down) dummy.position.y = 0.12
      dummy.updateMatrix()
      r.torso.setMatrixAt(i, dummy.matrix); r.legs.setMatrixAt(i, dummy.matrix); r.head.setMatrixAt(i, dummy.matrix)
      r.torso.setColorAt(i, col.set(p.shirt)); r.legs.setColorAt(i, col.set(p.pants)); r.head.setColorAt(i, col.set(p.skin))
    }
    for (const m of [r.torso, r.legs, r.head]) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })
  const mk = (key: 'torso' | 'legs' | 'head', geo: BufferGeometry) => (
    <instancedMesh
      key={key}
      args={[geo, mats.m, MAXP]}
      frustumCulled={false}
      castShadow
      ref={(m: InstancedMesh | null) => {
        if (!m) return
        m.instanceMatrix.setUsage(DynamicDrawUsage)
        if (!m.instanceColor) m.instanceColor = new InstancedBufferAttribute(new Float32Array(MAXP * 3), 3)
        const cur = refs.current ?? ({} as NonNullable<typeof refs.current>)
        cur[key] = m
        refs.current = cur
      }}
    />
  )
  return <>{mk('torso', geos.torso)}{mk('legs', geos.legs)}{mk('head', geos.head)}</>
}

/* ------------------------------------------------------------------ mission markers + guide arrow */
function Markers() {
  const group = useRef<Group>(null)
  const pool = useMemo(() => {
    const out: { root: Group; ring: Mesh; beam: Mesh; ringMat: MeshBasicMaterial; beamMat: MeshBasicMaterial }[] = []
    for (let i = 0; i < 3; i++) {
      const root = new Group()
      const ringMat = new MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false })
      const beamMat = new MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false })
      const ring = new Mesh(new CylinderGeometry(1, 1, 0.4, 40, 1, true), ringMat)
      const beam = new Mesh(new CylinderGeometry(1, 1, 70, 32, 1, true), beamMat)
      beam.position.y = 35
      ring.position.y = 0.2
      root.add(ring, beam)
      root.visible = false
      out.push({ root, ring, beam, ringMat, beamMat })
    }
    return out
  }, [])
  const arrow = useMemo(() => {
    const g = new Group()
    const m = new MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.9, depthTest: false })
    const cone = new Mesh(new ConeGeometry(0.45, 1.2, 4), m)
    cone.rotation.x = Math.PI / 2
    cone.renderOrder = 10
    g.add(cone)
    g.visible = false
    return g
  }, [])
  useFrame(() => {
    const t = performance.now() / 1000
    const active = S.phase !== 'idle'
    pool.forEach((o, i) => {
      const mk = active ? S.markers[i] : undefined
      o.root.visible = !!mk
      if (!mk) return
      o.root.position.set(mk.x, 0, mk.z)
      const pulse = 1 + Math.sin(t * 3 + i) * 0.04
      o.ring.scale.set(mk.radius * pulse, 1, mk.radius * pulse)
      o.beam.scale.set(mk.radius * 0.85, 1, mk.radius * 0.85)
      o.ringMat.color.set(mk.color); o.beamMat.color.set(mk.color)
      o.beamMat.opacity = i === 0 ? 0.22 : 0.1
      o.ringMat.opacity = i === 0 ? 0.55 : 0.25
    })
    const m0 = active && S.phase === 'running' ? S.markers[0] : undefined
    arrow.visible = !!m0 && rt.camera !== 2
    if (m0) {
      const b = playerBody
      arrow.position.set(b.x, b.spec.height + 2.1 + Math.sin(t * 4) * 0.12, b.z)
      arrow.rotation.y = Math.atan2(m0.x - b.x, m0.z - b.z)
    }
  })
  return (
    <group ref={group}>
      {pool.map((o, i) => <primitive key={i} object={o.root} />)}
      <primitive object={arrow} />
    </group>
  )
}

/* ------------------------------------------------------------------ skid marks */
const MAX_SKID = 600
function SkidMarks() {
  const mesh = useRef<InstancedMesh>(null)
  const state = useRef({ i: 0, last: 0 })
  const geo = useMemo(() => { const g = new PlaneGeometry(0.28, 0.9); g.rotateX(-Math.PI / 2); return g }, [])
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#0a0a0a', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [])
  const m4 = useMemo(() => new Matrix4(), [])
  const q = useMemo(() => new Quaternion(), [])
  const up = useMemo(() => new Vector3(0, 1, 0), [])
  const hidden = useMemo(() => new Matrix4().makeScale(0, 0, 0), [])
  useEffect(() => {
    const m = mesh.current
    if (m) for (let i = 0; i < MAX_SKID; i++) m.setMatrixAt(i, hidden)
  }, [hidden])
  useFrame(() => {
    const m = mesh.current
    if (!m || rt.paused || S.phase === 'idle') return
    const b = playerBody
    const slipping = (b.slip > 0.5 && Math.abs(b.speed) > 6) || (b.braking && Math.abs(b.speed) > 18 && b.input.brake > 0.9)
    if (!slipping || rt.time - state.current.last < 0.035) return
    state.current.last = rt.time
    q.setFromAxisAngle(up, b.heading + b.latSpeed * 0.02)
    const s = Math.sin(b.heading), c = Math.cos(b.heading)
    for (const side of [-1, 1]) {
      const px = b.x + (-c) * side * b.hx * 0.8 - s * b.hz * 0.6
      const pz = b.z + s * side * b.hx * 0.8 - c * b.hz * 0.6
      m4.compose(new Vector3(px, 0.03, pz), q, new Vector3(1, 1, 1))
      m.setMatrixAt(state.current.i, m4)
      state.current.i = (state.current.i + 1) % MAX_SKID
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geo, mat, MAX_SKID]} frustumCulled={false} />
}

/* ------------------------------------------------------------------ loop + HUD bridge */
function Loop() {
  const hudT = useRef(0)
  useEffect(() => {
    hookEvents()
    enterMenu()
    if (import.meta.env.DEV) (window as unknown as { __rv: unknown }).__rv = { S, rt, playerBody, fleet, useStore, peds, simulate, dev }
    const off = [
      onKeyPress('KeyR', () => { if (!rt.paused) { respawnPlayer(); resetSteer() } }),
    ]
    return () => off.forEach((f) => f())
  }, [])
  useFrame((_, dt) => {
    simulate(dt)
    sfx.update(dt)
    hudT.current += dt
    if (hudT.current > 0.09 && S.phase !== 'idle') {
      hudT.current = 0
      useStore.getState().setHud(hudSnapshot())
    }
  }, -10)
  return null
}

export function GameScene() {
  return (
    <>
      <Loop />
      <PlayerCar />
      <primitive object={fleet.group} />
      <Pedestrians />
      <Markers />
      <SkidMarks />
      <CameraRig />
    </>
  )
}
