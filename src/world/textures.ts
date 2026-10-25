import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { mulberry32 } from '../core/math'

/** All textures are drawn procedurally on canvases — no downloads, nothing can fail to load. */

const make = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return { c, g: c.getContext('2d')! }
}

function finish(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}): Texture {
  const t = new CanvasTexture(c)
  if (opts.repeat !== false) { t.wrapS = t.wrapT = RepeatWrapping }
  if (opts.srgb !== false) t.colorSpace = SRGBColorSpace
  t.anisotropy = opts.aniso ?? 8
  t.needsUpdate = true
  return t
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number, dark = true) {
  const r = mulberry32(seed)
  const img = g.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount
    d[i] = Math.max(0, Math.min(255, d[i] + n))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n))
  }
  g.putImageData(img, 0, 0)
  void dark
}

export interface MapPair { map: Texture; emissive: Texture | null }

// -------------------------------------------------------------------- facades
interface GridOpts { cols: number; rows: number; cw: number; ch: number; lit: number; seed: number }
function windowSheet(o: GridOpts, bg: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  cell: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean, r: () => number) => void,
  glow: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) => void): MapPair {
  const W = o.cols * o.cw, H = o.rows * o.ch
  const a = make(W, H), e = make(W, H)
  bg(a.g, W, H)
  e.g.fillStyle = '#000'; e.g.fillRect(0, 0, W, H)
  const r = mulberry32(o.seed)
  for (let j = 0; j < o.rows; j++)
    for (let i = 0; i < o.cols; i++) {
      const lit = r() < o.lit
      cell(a.g, i * o.cw, j * o.ch, o.cw, o.ch, lit, r)
      if (lit) glow(e.g, i * o.cw, j * o.ch, o.cw, o.ch, r)
    }
  return { map: finish(a.c), emissive: finish(e.c) }
}

const warm = (r: () => number) => {
  const k = 0.65 + r() * 0.35
  return `rgb(${Math.round(255 * k)},${Math.round(214 * k)},${Math.round(140 * k)})`
}

/** Curtain-wall glass tower. tile = 4 bays x 4 floors */
export function glassFacade(seed: number): MapPair {
  return windowSheet(
    { cols: 4, rows: 4, cw: 128, ch: 128, lit: 0.45, seed },
    (g, w, h) => { g.fillStyle = '#c9d1d9'; g.fillRect(0, 0, w, h) },
    (g, x, y, w, h, lit, r) => {
      const m = 4
      g.fillStyle = '#9aa4ae'; g.fillRect(x, y, w, h)
      const gr = g.createLinearGradient(0, y, 0, y + h * 0.8)
      const k = 0.85 + r() * 0.15
      gr.addColorStop(0, `rgb(${Math.round(176 * k)},${Math.round(205 * k)},${Math.round(232 * k)})`)
      gr.addColorStop(1, `rgb(${Math.round(60 * k)},${Math.round(84 * k)},${Math.round(112 * k)})`)
      g.fillStyle = gr; g.fillRect(x + m, y + m, w - m * 2, h * 0.76)
      g.fillStyle = '#7f8993'; g.fillRect(x + m, y + h * 0.82, w - m * 2, h * 0.14) // spandrel
      if (lit) { g.fillStyle = 'rgba(255,230,170,0.35)'; g.fillRect(x + m, y + m, w - m * 2, h * 0.76) }
    },
    (g, x, y, w, h, r) => { g.fillStyle = warm(r); g.fillRect(x + 6, y + 6, w - 12, h * 0.72) },
  )
}

/** Brick apartment block with balconies. */
export function brickFacade(seed: number): MapPair {
  return windowSheet(
    { cols: 4, rows: 4, cw: 128, ch: 128, lit: 0.4, seed },
    (g, w, h) => {
      g.fillStyle = '#d2c3b4'; g.fillRect(0, 0, w, h)
      const r = mulberry32(seed + 9)
      for (let y = 0; y < h; y += 8) {
        for (let x = (y / 8) % 2 ? -16 : 0; x < w; x += 32) {
          const k = 0.88 + r() * 0.16
          g.fillStyle = `rgb(${Math.round(205 * k)},${Math.round(190 * k)},${Math.round(175 * k)})`
          g.fillRect(x + 1, y + 1, 30, 6)
        }
      }
    },
    (g, x, y, w, h, lit, r) => {
      const wx = x + w * 0.22, wy = y + h * 0.2, ww = w * 0.56, wh = h * 0.5
      g.fillStyle = '#f2efe9'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8)
      const gr = g.createLinearGradient(0, wy, 0, wy + wh)
      gr.addColorStop(0, '#8ea6bd'); gr.addColorStop(1, '#2d3f52')
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh)
      g.fillStyle = '#f2efe9'; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh)
      g.fillStyle = '#b9b2a6'; g.fillRect(wx - 7, wy + wh + 4, ww + 14, 6) // sill
      if (lit) { g.fillStyle = 'rgba(255,225,160,0.4)'; g.fillRect(wx, wy, ww, wh) }
      if (r() < 0.35) { // balcony slab + rail
        g.fillStyle = '#a9a39a'; g.fillRect(x + 6, y + h * 0.84, w - 12, 8)
        g.strokeStyle = '#2c2f33'; g.lineWidth = 2
        for (let i = 0; i <= 8; i++) { const px = x + 10 + (i * (w - 20)) / 8; g.beginPath(); g.moveTo(px, y + h * 0.66); g.lineTo(px, y + h * 0.84); g.stroke() }
        g.beginPath(); g.moveTo(x + 8, y + h * 0.66); g.lineTo(x + w - 8, y + h * 0.66); g.stroke()
      }
    },
    (g, x, y, w, h, r) => { g.fillStyle = warm(r); g.fillRect(x + w * 0.22, y + h * 0.2, w * 0.56, h * 0.5) },
  )
}

/** Concrete office with ribbon windows. */
export function officeFacade(seed: number): MapPair {
  return windowSheet(
    { cols: 4, rows: 4, cw: 128, ch: 128, lit: 0.5, seed },
    (g, w, h) => { g.fillStyle = '#d7d8d6'; g.fillRect(0, 0, w, h); speckle(g, w, h, 14, seed) },
    (g, x, y, w, h, lit) => {
      const wy = y + h * 0.22, wh = h * 0.5
      g.fillStyle = '#a9adb2'; g.fillRect(x, y + h * 0.9, w, h * 0.1)
      const gr = g.createLinearGradient(0, wy, 0, wy + wh)
      gr.addColorStop(0, '#6c8196'); gr.addColorStop(1, '#27323d')
      g.fillStyle = gr; g.fillRect(x + 4, wy, w - 8, wh)
      g.fillStyle = '#c7c9c8'; g.fillRect(x + w / 2 - 2, wy, 4, wh)
      if (lit) { g.fillStyle = 'rgba(255,228,165,0.38)'; g.fillRect(x + 4, wy, w - 8, wh) }
    },
    (g, x, y, w, h, r) => { g.fillStyle = warm(r); g.fillRect(x + 6, y + h * 0.22, w - 12, h * 0.5) },
  )
}

const SHOPS = ['CAFE', 'PHARMACY', 'MARKET', 'BOOKS', 'BAKERY', 'TAILOR', 'FASHION', 'GADGETS', 'SALON', 'DELI', 'HARDWARE', 'FLORIST']
/** Ground-floor storefronts. tile = 3 shops wide (12 m) x 4.2 m */
export function shopFacade(seed: number): MapPair {
  const W = 768, H = 256
  const a = make(W, H), e = make(W, H)
  const r = mulberry32(seed)
  a.g.fillStyle = '#cfc8bd'; a.g.fillRect(0, 0, W, H)
  e.g.fillStyle = '#000'; e.g.fillRect(0, 0, W, H)
  const hues = [8, 28, 48, 150, 200, 265, 330, 175]
  for (let i = 0; i < 3; i++) {
    const x = i * 256
    const hue = hues[Math.floor(r() * hues.length)]
    // sign band
    a.g.fillStyle = `hsl(${hue},55%,34%)`; a.g.fillRect(x + 8, 10, 240, 54)
    a.g.fillStyle = '#fff'; a.g.font = 'bold 30px Arial, sans-serif'; a.g.textAlign = 'center'; a.g.textBaseline = 'middle'
    const name = SHOPS[Math.floor(r() * SHOPS.length)]
    a.g.fillText(name, x + 128, 38)
    e.g.fillStyle = `hsl(${hue},70%,45%)`; e.g.fillRect(x + 8, 10, 240, 54)
    e.g.fillStyle = '#fff'; e.g.font = 'bold 30px Arial, sans-serif'; e.g.textAlign = 'center'; e.g.textBaseline = 'middle'; e.g.fillText(name, x + 128, 38)
    // awning
    for (let k = 0; k < 8; k++) { a.g.fillStyle = k % 2 ? '#f4f1ea' : `hsl(${hue},60%,45%)`; a.g.fillRect(x + 12 + k * 29, 68, 29, 22) }
    // window + door
    const dx = r() < 0.5 ? x + 24 : x + 150
    a.g.fillStyle = '#222a31'; a.g.fillRect(x + 14, 96, 228, 148)
    const gr = a.g.createLinearGradient(0, 96, 0, 244); gr.addColorStop(0, '#9fb4c7'); gr.addColorStop(1, '#3b4b59')
    a.g.fillStyle = gr; a.g.fillRect(x + 20, 102, 216, 136)
    a.g.fillStyle = '#242a30'; a.g.fillRect(dx, 102, 84, 142)
    a.g.fillStyle = 'rgba(180,220,255,0.55)'; a.g.fillRect(dx + 6, 108, 72, 124)
    a.g.fillStyle = '#b8bcc0'; a.g.fillRect(dx + 60, 168, 4, 22)
    e.g.fillStyle = r() < 0.7 ? '#ffd9a0' : '#bfe3ff'
    e.g.fillRect(x + 20, 102, 216, 136)
    e.g.globalAlpha = 0.6; e.g.fillStyle = '#000'; e.g.fillRect(dx, 102, 84, 142); e.g.globalAlpha = 1
  }
  speckle(a.g, W, H, 8, seed)
  return { map: finish(a.c), emissive: finish(e.c) }
}

/** House walls (neutral stucco; tinted by vertex colour). front=true adds the door. */
export function houseWall(front: boolean, seed: number): MapPair {
  const W = 512, H = 256
  const a = make(W, H), e = make(W, H)
  a.g.fillStyle = '#f1ece4'; a.g.fillRect(0, 0, W, H)
  speckle(a.g, W, H, 20, seed)
  e.g.fillStyle = '#000'; e.g.fillRect(0, 0, W, H)
  const r = mulberry32(seed)
  const win = (x: number, y: number, w: number, h: number) => {
    a.g.fillStyle = '#e9e6df'; a.g.fillRect(x - 6, y - 6, w + 12, h + 12)
    const gr = a.g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9db3c8'); gr.addColorStop(1, '#2e3d4c')
    a.g.fillStyle = gr; a.g.fillRect(x, y, w, h)
    a.g.fillStyle = '#e9e6df'; a.g.fillRect(x + w / 2 - 2, y, 4, h); a.g.fillRect(x, y + h / 2 - 2, w, 4)
    a.g.fillStyle = '#7a756d'; a.g.fillRect(x - 10, y + h + 6, w + 20, 6)
    if (r() < 0.6) { e.g.fillStyle = warm(r); e.g.fillRect(x, y, w, h) }
  }
  if (front) {
    win(40, 70, 110, 96)
    win(360, 70, 110, 96)
    a.g.fillStyle = '#4a3324'; a.g.fillRect(215, 64, 82, 192)
    a.g.fillStyle = '#6b4a34'; a.g.fillRect(223, 72, 66, 80); a.g.fillRect(223, 160, 66, 90)
    a.g.fillStyle = '#d8b04a'; a.g.fillRect(278, 170, 6, 6)
    a.g.fillStyle = '#d9d4ca'; a.g.fillRect(205, 56, 102, 8)
  } else {
    win(70, 70, 110, 96)
    win(330, 70, 110, 96)
  }
  return { map: finish(a.c), emissive: finish(e.c) }
}

export function corrugated(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#b9bec4'; g.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 8) { g.fillStyle = x % 16 ? '#aab0b7' : '#c9ced4'; g.fillRect(x, 0, 4, 256) }
  g.fillStyle = '#8c929a'; g.fillRect(0, 120, 256, 3)
  speckle(g, 256, 256, 14, 5)
  return finish(c)
}

export function roofTiles(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#8f4a33'; g.fillRect(0, 0, 256, 256)
  const r = mulberry32(3)
  for (let y = 0; y < 256; y += 16)
    for (let x = (y / 16) % 2 ? -12 : 0; x < 256; x += 24) {
      const k = 0.8 + r() * 0.4
      g.fillStyle = `rgb(${Math.round(150 * k)},${Math.round(80 * k)},${Math.round(55 * k)})`
      g.fillRect(x + 1, y + 1, 22, 14)
    }
  return finish(c)
}

export function gravelRoof(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#8b8d8f'; g.fillRect(0, 0, 256, 256)
  speckle(g, 256, 256, 60, 8)
  g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 3
  g.strokeRect(2, 2, 252, 252)
  return finish(c)
}

// -------------------------------------------------------------------- ground
export function asphalt(): Texture {
  const { c, g } = make(512, 512)
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 512, 512)
  speckle(g, 512, 512, 38, 1)
  const r = mulberry32(44)
  g.strokeStyle = 'rgba(15,15,15,0.5)'; g.lineWidth = 1.5
  for (let i = 0; i < 9; i++) {
    g.beginPath(); let x = r() * 512, y = r() * 512; g.moveTo(x, y)
    for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y) }
    g.stroke()
  }
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(20,20,22,${0.08 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, 6.3); g.fill() }
  return finish(c)
}

export function sidewalk(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#a7a39b'; g.fillRect(0, 0, 256, 256)
  speckle(g, 256, 256, 26, 2)
  g.strokeStyle = '#7d7a73'; g.lineWidth = 2
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke() }
  return finish(c)
}

export function paver(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#b9aea0'; g.fillRect(0, 0, 256, 256)
  const r = mulberry32(12)
  for (let y = 0; y < 256; y += 32)
    for (let x = (y / 32) % 2 ? -16 : 0; x < 256; x += 32) {
      const k = 0.9 + r() * 0.2
      g.fillStyle = `rgb(${Math.round(190 * k)},${Math.round(176 * k)},${Math.round(158 * k)})`
      g.fillRect(x + 1.5, y + 1.5, 29, 29)
    }
  return finish(c)
}

export function grass(): Texture {
  const { c, g } = make(512, 512)
  g.fillStyle = '#4d7a3a'; g.fillRect(0, 0, 512, 512)
  const r = mulberry32(77)
  for (let i = 0; i < 9000; i++) {
    const k = 0.7 + r() * 0.6
    g.fillStyle = `rgba(${Math.round(60 * k)},${Math.round(110 * k)},${Math.round(45 * k)},0.55)`
    g.fillRect(r() * 512, r() * 512, 2, 3 + r() * 3)
  }
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(30,60,20,${0.05 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * 512, r() * 512, 30 + r() * 80, 20 + r() * 50, 0, 0, 6.3); g.fill() }
  return finish(c)
}

export function dirtGround(): Texture {
  const { c, g } = make(256, 256)
  g.fillStyle = '#7a6a52'; g.fillRect(0, 0, 256, 256)
  speckle(g, 256, 256, 40, 15)
  return finish(c)
}

/** Soft radial gradient used for light pools / headlight glow. */
export function glowTexture(): Texture {
  const { c, g } = make(128, 128)
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
  return finish(c, { repeat: false })
}

/** Road markings sheet is drawn as geometry; this is the pedestrian crossing stripes (alpha). */
export function skidTexture(): Texture {
  const { c, g } = make(64, 64)
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64)
  return finish(c, { repeat: false })
}
