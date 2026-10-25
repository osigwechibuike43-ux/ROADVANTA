import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending, Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry,
  Quaternion, Vector3, type BufferGeometry, type Material, type Texture,
} from 'three'
import { VEHICLES } from '../config/vehicles'
import { mulberry32 } from '../core/math'
import { rt } from '../core/runtime'
import { signal } from '../sim/nav'
import { parkedCarGeometry } from '../vehicles/models'
import { buildBuildings, type BuildingBatches } from './buildings'
import { city, EXTENT, CURB } from './city'
import { buildGround, type GroundBatches } from './roads'
import * as P from './props'
import * as T from './textures'

const CAR_STYLES = ['hatch', 'sedan', 'suv', 'coupe'] as const

interface Lit { mat: MeshStandardMaterial; k: number }

function litMat(pair: T.MapPair, rough: number, metal: number, k = 1.5): { m: MeshStandardMaterial; lit: Lit } {
  const m = new MeshStandardMaterial({ map: pair.map, ...(pair.emissive ? { emissiveMap: pair.emissive } : {}), emissive: new Color('#ffffff'), emissiveIntensity: 0, vertexColors: true, roughness: rough, metalness: metal })
  return { m, lit: { mat: m, k } }
}

function useWorldAssets() {
  return useMemo(() => {
    const lits: Lit[] = []
    const mk = (pair: T.MapPair, rough: number, metal: number, k?: number) => { const r = litMat(pair, rough, metal, k); lits.push(r.lit); return r.m }
    const plain = (map: Texture | null, rough: number, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) =>
      new MeshStandardMaterial({ ...(map ? { map } : {}), vertexColors: true, roughness: rough, metalness: 0, ...extra })
    const bm: Record<keyof BuildingBatches, Material> = {
      glass0: mk(T.glassFacade(11), 0.22, 0.55), glass1: mk(T.glassFacade(23), 0.22, 0.55), glass2: mk(T.glassFacade(37), 0.22, 0.55), glass3: mk(T.glassFacade(51), 0.22, 0.55),
      brick: mk(T.brickFacade(5), 0.9, 0), office: mk(T.officeFacade(8), 0.7, 0.05), shop: mk(T.shopFacade(4), 0.55, 0.05, 2.4),
      houseFront: mk(T.houseWall(true, 21), 0.9, 0, 1.4), houseSide: mk(T.houseWall(false, 22), 0.9, 0, 1.4),
      warehouse: plain(T.corrugated(), 0.65, { metalness: 0.35 }), roofFlat: plain(T.gravelRoof(), 0.95), roofTile: plain(T.roofTiles(), 0.85),
      plain: plain(null, 0.85), dark: plain(null, 0.6, { metalness: 0.2 }), container: plain(T.corrugated(), 0.55, { metalness: 0.3 }),
    }
    const gm: Record<keyof GroundBatches, Material> = {
      asphalt: plain(T.asphalt(), 0.93), marks: plain(null, 0.7, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      slab: plain(T.sidewalk(), 0.9), curb: plain(null, 0.9), lawn: plain(T.grass(), 1), paver: plain(T.paver(), 0.85), parking: plain(T.asphalt(), 0.93),
      water: new MeshStandardMaterial({ color: '#2d7592', roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.88, vertexColors: false }),
      barrier: plain(null, 0.8), stone: plain(null, 0.9),
    }
    const grassTex = T.grass()
    grassTex.repeat.set(500, 500)
    const ground = new MeshStandardMaterial({ map: grassTex, roughness: 1, color: '#9aa88a' })
    return { lits, bm, gm, ground, glow: T.glowTexture() }
  }, [])
}

export function World() {
  const { gl } = useThree()
  const assets = useWorldAssets()
  const bB = useMemo(() => buildBuildings(), [])
  const gB = useMemo(() => buildGround(), [])
  const fences = useMemo(() => P.fenceGeometry(), [])
  const lensMeshes = useRef<{ r: InstancedMesh; y: InstancedMesh; g: InstancedMesh } | null>(null)
  const lampMat = useRef<MeshBasicMaterial>(null)
  const poolMat = useRef<MeshBasicMaterial>(null)
  const signalClock = useRef(0)

  // anisotropy for crisp road markings
  useEffect(() => {
    const max = gl.capabilities.getMaxAnisotropy()
    const set = (m: Material) => { const t = (m as MeshStandardMaterial).map; if (t) t.anisotropy = Math.min(8, max) }
    Object.values(assets.bm).forEach(set); Object.values(assets.gm).forEach(set)
  }, [gl, assets])

  // ---- instanced props --------------------------------------------------
  const instances = useMemo(() => {
    const dummy = new Object3D()
    const make = (geo: BufferGeometry, mat: Material, spots: { x: number; z: number; rot: number; s?: number }[], y = 0) => {
      const m = new InstancedMesh(geo, mat, Math.max(1, spots.length))
      spots.forEach((s, i) => {
        dummy.position.set(s.x, y, s.z)
        dummy.rotation.set(0, s.rot, 0)
        dummy.scale.setScalar(s.s ?? 1)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      })
      m.count = spots.length
      m.instanceMatrix.needsUpdate = true
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      return m
    }
    const vcMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 })
    const leafMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
    const out: Object3D[] = []
    for (let v = 0; v < 3; v++) out.push(make(P.treeGeometry(v), leafMat, city.trees.filter((t) => t.v === v).map((t) => ({ x: t.x, z: t.z, rot: t.rot, s: t.s })), CURB))
    // distant forest ring (visual only)
    const r = mulberry32(5)
    const forest: { x: number; z: number; rot: number; s: number }[] = []
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2
      const side = r()
      const d = EXTENT + 6 + r() * 170
      const x = Math.cos(a) * d * 1.0, z = Math.sin(a) * d * 1.0
      void side
      if (Math.abs(x) < EXTENT + 4 && Math.abs(z) < EXTENT + 4) continue
      forest.push({ x, z, rot: r() * 6, s: 1.4 + r() * 1.5 })
    }
    out.push(make(P.treeGeometry(2), leafMat, forest, 0))
    out.push(make(P.lampGeometry(), vcMat, city.lamps, CURB))
    const head = make(P.lampHeadGeometry(), new MeshBasicMaterial({ color: '#555' }), city.lamps, CURB)
    head.castShadow = false
    out.push(head)
    out.push(make(P.busStopGeometry(), vcMat, city.busStops, CURB))
    out.push(make(P.benchGeometry(), vcMat, city.benches, CURB))
    out.push(make(P.binGeometry(), vcMat, city.bins, CURB))
    out.push(make(P.hydrantGeometry(), vcMat, city.hydrants, CURB))
    out.push(make(P.signalPoleGeometry(), vcMat, P.signalHeads.map((h) => ({ x: h.x, z: h.z, rot: h.rot })), CURB))
    // parked cars: one InstancedMesh per body style with per-instance paint
    const parkedMat = new MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.35, envMapIntensity: 1.1 })
    CAR_STYLES.forEach((style, si) => {
      const list = city.parked.filter((p) => p.style === si)
      if (!list.length) return
      const m = make(parkedCarGeometry(VEHICLES[si === 3 ? 3 : si], style), parkedMat, list.map((p) => ({ x: p.x, z: p.z, rot: p.rot })), CURB)
      list.forEach((p, i) => m.setColorAt(i, new Color(p.color)))
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      out.push(m)
    })
    return { out, head }
  }, [])

  // street-light pools on the ground
  const pools = useMemo(() => {
    const geo = new PlaneGeometry(13, 13).rotateX(-Math.PI / 2)
    const mat = new MeshBasicMaterial({ map: assets.glow, color: '#ffd9a0', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: true })
    const m = new InstancedMesh(geo, mat, city.lamps.length)
    const q = new Quaternion(), s = new Vector3(1, 1, 1), mtx = new Matrix4()
    city.lamps.forEach((l, i) => {
      mtx.compose(new Vector3(l.x + Math.cos(l.rot) * 1.75, CURB + 0.06, l.z - Math.sin(l.rot) * 1.75), q, s)
      m.setMatrixAt(i, mtx)
    })
    m.frustumCulled = false
    return { m, mat }
  }, [assets])

  // traffic-light lenses
  const lens = useMemo(() => {
    const geo = new PlaneGeometry(0.22, 0.22)
    const mats = ['#ff2a1a', '#ffb81a', '#2bff6a'].map((c) => new MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: DoubleSide, name: c }))
    const meshes = mats.map((mat, k) => {
      const m = new InstancedMesh(geo, mat, P.signalHeads.length)
      const mtx = new Matrix4(), q = new Quaternion(), e = new Object3D()
      P.signalHeads.forEach((h, i) => {
        e.position.set(h.x, CURB + 5.4 - k * 0.36, h.z)
        e.rotation.set(0, h.rot, 0)
        e.translateZ(0.2)
        e.updateMatrix()
        mtx.copy(e.matrix)
        m.setMatrixAt(i, mtx)
        m.setColorAt(i, new Color('#101010'))
      })
      void q
      m.frustumCulled = false
      return m
    })
    return meshes
  }, [])
  lensMeshes.current = { r: lens[0], y: lens[1], g: lens[2] }

  useFrame((_, dt) => {
    const night = rt.night
    // windows glow at night
    for (const l of assets.lits) l.mat.emissiveIntensity = night * l.k
    if (instances.head.material) (instances.head.material as MeshBasicMaterial).color.setRGB(0.35 + night * 0.65, 0.33 + night * 0.55, 0.28 + night * 0.25)
    pools.mat.opacity = Math.min(0.55, night * 0.6)
    pools.m.visible = night > 0.04
    // signals update a few times per second
    signalClock.current -= dt
    if (signalClock.current <= 0) {
      signalClock.current = 0.2
      const dark = new Color('#0a0a0a')
      const cols = [new Color('#ff3a2a'), new Color('#ffc21a'), new Color('#32ff72')]
      P.signalHeads.forEach((h, i) => {
        const st = signal(h.gx, h.gz, h.axis, rt.time)
        const on = st === 'red' ? 0 : st === 'yellow' ? 1 : 2
        for (let k = 0; k < 3; k++) lens[k].setColorAt(i, k === on ? cols[k] : dark)
      })
      lens.forEach((m) => { if (m.instanceColor) m.instanceColor.needsUpdate = true })
    }
  })

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 0]} material={assets.ground} receiveShadow>
        <planeGeometry args={[3600, 3600]} />
      </mesh>
      {(Object.keys(gB) as (keyof GroundBatches)[]).map((k) =>
        gB[k].empty ? null : (
          <mesh key={k} geometry={gB[k].toGeometry(k !== 'water')} material={assets.gm[k]} receiveShadow castShadow={k === 'stone' || k === 'barrier'} frustumCulled={false} />
        ),
      )}
      {(Object.keys(bB) as (keyof BuildingBatches)[]).map((k) =>
        bB[k].empty ? null : (
          <mesh key={k} geometry={bB[k].toGeometry()} material={assets.bm[k]} castShadow receiveShadow frustumCulled={false} />
        ),
      )}
      {!fences.empty && <mesh geometry={fences.toGeometry()} material={assets.bm.plain} castShadow receiveShadow frustumCulled={false} />}
      {instances.out.map((o, i) => <primitive key={i} object={o} />)}
      <primitive object={pools.m} />
      {lens.map((m, i) => <primitive key={i} object={m} />)}
      <Showroom />
    </group>
  )
}

/** Circular presentation pad outside the city where the menu/garage car turns. */
export const SHOWROOM = { x: 0, z: -(EXTENT + 120) }
function Showroom() {
  const ref = useRef<Mesh>(null)
  useFrame(() => { if (ref.current) (ref.current.material as MeshStandardMaterial).emissiveIntensity = 0.1 + rt.night * 0.9 })
  return (
    <group position={[SHOWROOM.x, 0, SHOWROOM.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[34, 64]} />
        <meshStandardMaterial color="#25282d" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
        <ringGeometry args={[11.5, 12, 64]} />
        <meshStandardMaterial color="#ff6a2b" emissive="#ff6a2b" emissiveIntensity={0.2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#1a1c20" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  )
}
