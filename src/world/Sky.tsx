import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color, DirectionalLight, FogExp2, HemisphereLight, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3, BackSide,
  type Texture, type WebGLRenderTarget,
} from 'three'
import { GRAPHICS } from '../config/game'
import { clamp, lerp } from '../core/math'
import { rt } from '../core/runtime'
import { useStore } from '../core/store'

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  gl_Position = p.xyww;
}`
const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uNight; uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.32 + pow(s, 3.0) * 0.1) * (1.0 - uNight);
  float m = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.75, 0.82, 1.0) * pow(m, 1400.0) * 3.0 * uNight;
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.3) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.7);
    float c = smoothstep(0.52, 0.82, n) * smoothstep(0.01, 0.22, d.y);
    vec3 cc = mix(vec3(1.0), uHorizon * 1.15 + 0.1, 0.35) * (1.0 - uNight * 0.92);
    col = mix(col, cc, c * 0.62);
  }
  if (uNight > 0.02 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.12) * 120.0;
    float st = step(0.9975, hash(floor(sp)));
    col += vec3(st) * uNight * smoothstep(0.0, 0.25, d.y) * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`

function makeSkyMaterial() {
  return new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
    uniforms: {
      uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color() }, uNight: { value: 0 }, uTime: { value: 0 },
    },
  })
}

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const C = {
  zenDay: new Color('#2a64c8'), horDay: new Color('#a9cdf0'), zenNight: new Color('#02040c'), horNight: new Color('#0a1226'),
  zenDusk: new Color('#2b3f7a'), horDusk: new Color('#ff8a4a'),
}

/** Procedural sky, sun/moon lighting, fog and image-based reflections that follow a day/night cycle. */
export function Sky() {
  const { gl, scene } = useThree()
  const quality = useStore((s) => s.save.settings.graphics)
  const mat = useMemo(() => makeSkyMaterial(), [])
  const sphere = useRef<Mesh>(null)
  const sun = useRef<DirectionalLight>(null)
  const moon = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const envRT = useRef<WebGLRenderTarget | null>(null)
  const envClock = useRef(99)
  const pm = useMemo(() => new PMREMGenerator(gl), [gl])
  const envScene = useMemo(() => {
    const s = new Scene()
    const m = new Mesh(new SphereGeometry(50, 24, 16), mat.clone())
    s.add(m)
    return s
  }, [mat])
  const tmp = useMemo(() => ({ zen: new Color(), hor: new Color(), sunC: new Color(), dir: new Vector3() }), [])

  useEffect(() => {
    scene.fog = new FogExp2('#a9cdf0', GRAPHICS[quality].fog)
    return () => { scene.fog = null; scene.environment = null; envRT.current?.dispose(); pm.dispose() }
  }, [scene, quality, pm])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    rt.timeOfDay = (rt.timeOfDay + dt / 900) % 1
    const ang = (rt.timeOfDay - 0.25) * Math.PI * 2
    tmp.dir.set(Math.cos(ang) * 0.85, Math.sin(ang), 0.45).normalize()
    const e = tmp.dir.y
    const dayF = smooth(-0.08, 0.3, e)
    const dusk = clamp(1 - Math.abs(e) / 0.28, 0, 1) * (e > -0.15 ? 1 : 0)
    const night = 1 - smooth(-0.16, 0.06, e)
    rt.night += (night - rt.night) * Math.min(1, dt * 2)

    tmp.zen.copy(C.zenNight).lerp(C.zenDay, dayF).lerp(C.zenDusk, dusk * 0.6)
    tmp.hor.copy(C.horNight).lerp(C.horDay, dayF).lerp(C.horDusk, dusk * 0.85)
    tmp.sunC.set('#fff3dc').lerp(new Color('#ff9a4a'), dusk)

    const u = mat.uniforms
    u.uZenith.value.copy(tmp.zen); u.uHorizon.value.copy(tmp.hor); u.uSunDir.value.copy(tmp.dir)
    u.uSunColor.value.copy(tmp.sunC); u.uNight.value = rt.night; u.uTime.value = state.clock.elapsedTime
    if (sphere.current) sphere.current.position.copy(state.camera.position)

    const fog = scene.fog as FogExp2 | null
    if (fog) fog.color.copy(tmp.hor).multiplyScalar(0.92 + 0.08 * dayF)

    const fx = rt.player?.x ?? 0, fz = rt.player?.z ?? 0
    if (sun.current) {
      const L = sun.current
      L.position.set(fx + tmp.dir.x * 160, Math.max(tmp.dir.y, 0.08) * 160, fz + tmp.dir.z * 160)
      L.target.position.set(fx, 0, fz)
      L.target.updateMatrixWorld()
      L.color.copy(tmp.sunC)
      L.intensity = 3.4 * smooth(-0.02, 0.22, e)
    }
    if (moon.current) {
      moon.current.position.set(fx - tmp.dir.x * 100, 90, fz - tmp.dir.z * 100)
      moon.current.target.position.set(fx, 0, fz)
      moon.current.target.updateMatrixWorld()
      moon.current.intensity = 0.55 * rt.night
    }
    if (hemi.current) {
      hemi.current.color.copy(tmp.zen).lerp(new Color('#ffffff'), 0.4)
      hemi.current.groundColor.set('#4b4a44').lerp(new Color('#0b0c10'), rt.night)
      hemi.current.intensity = lerp(0.18, 0.55, dayF)
    }
    scene.environmentIntensity = lerp(0.22, 0.85, dayF)

    // refresh reflections every few seconds
    envClock.current += dt
    if (envClock.current > 6) {
      envClock.current = 0
      const m = envScene.children[0] as Mesh
      const mm = m.material as ShaderMaterial
      mm.uniforms.uZenith.value.copy(tmp.zen); mm.uniforms.uHorizon.value.copy(tmp.hor)
      mm.uniforms.uSunDir.value.copy(tmp.dir); mm.uniforms.uSunColor.value.copy(tmp.sunC)
      mm.uniforms.uNight.value = rt.night
      const old = envRT.current
      envRT.current = pm.fromScene(envScene, 0, 0.1, 100)
      scene.environment = envRT.current.texture as Texture
      old?.dispose()
    }
  })

  const g = GRAPHICS[quality]
  const sm = g.shadowMap
  const ext = quality === 'high' ? 90 : 70
  return (
    <>
      <mesh ref={sphere} material={mat} renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[900, 32, 20]} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#bcd4f5', '#4b4a44', 0.5]} />
      <directionalLight
        ref={sun}
        castShadow={g.shadows}
        shadow-mapSize={[sm, sm]}
        shadow-camera-left={-ext} shadow-camera-right={ext} shadow-camera-top={ext} shadow-camera-bottom={-ext}
        shadow-camera-near={10} shadow-camera-far={420}
        shadow-bias={-0.0003} shadow-normalBias={0.06}
        intensity={3}
      />
      <directionalLight ref={moon} color="#8fa8ff" intensity={0} />
    </>
  )
}
