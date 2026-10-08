// Map canvas: spawns, farm spots, Hidden Cube candidates, area labels; pan / zoom / hover / click.
// The painting stays imperative: MapView hands over its canvas (attachCanvas), everything else works on module state.
import { G, U, V, saveUi, bump, selIds, type Any } from '@/core/state'
import { emit } from '@/core/bus'
import { CANVAS_ICONS } from './canvasIcons'

import { R } from '@/features/pets/logic'

// ---------------------------------------------------------------- map canvas

let cv: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D = null as Any
export const view = { cx: 0, cz: 0, s: 0.05, w: 1, h: 1 }

export function attachCanvas(c: HTMLCanvasElement | null) {
  cv = c
  if (c) { ctx = c.getContext('2d')!; sizeCanvas() }
}

export function sizeCanvas() {
  if (!cv) return
  const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1
  if (!r.width || !r.height) return // section hidden (list-only view)
  view.w = r.width; view.h = r.height
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (fitPending) fit()
  draw()
}

const sx = (x: number) => (x - view.cx) * view.s + view.w / 2, sz = (z: number) => (z - view.cz) * view.s + view.h / 2
const wx = (px: number) => (px - view.w / 2) / view.s + view.cx, wz = (py: number) => (py - view.h / 2) / view.s + view.cz

function selection(): number[][] | null {
  const m = G.md[U.map]
  if (!m) return null
  if (V.spot) { const s = V.spots.find((x: Any) => x.rank === V.spot); if (s) return [[s.x - R * 2.2, s.z - R * 2.2], [s.x + R * 2.2, s.z + R * 2.2]] }
  if (V.cube) { const c = m.cubes.find((x: Any) => x.key === V.cube); if (c) return c.pts }
  const ids = selIds(), ts = ids.size ? V.targets.filter((x: Any) => ids.has(x.p.id)) : V.targets.filter((x: Any) => !x.done)
  const pts: number[][] = []
  for (const tg of ts) for (const mob of tg.mobs) for (const i of m.byId.get(+mob.id) || []) pts.push([m.xs[i], m.zs[i]])
  if (!pts.length) for (let i = 0; i < m.xs.length; i += 7) pts.push([m.xs[i], m.zs[i]])
  return pts
}

let fitPending = false // fit() while the canvas had no size (list-only view): redo once it has one
export function fit() {
  fitPending = view.w <= 1
  const pts = selection()
  if (!pts?.length || view.w <= 1) return
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const pad = 80
  view.cx = (x0 + x1) / 2; view.cz = (z0 + z1) / 2
  view.s = Math.min(1.2, Math.min(view.w / (x1 - x0 + pad * 2), view.h / (z1 - z0 + pad * 2)))
  draw()
}

// Lucide icons on the canvas: the SVG elements of CANVAS_ICONS[name] as one Path2D (24x24 units), cached.
const ICON_PATHS: Record<string, Path2D> = {}
function iconPath(name: string) {
  if (ICON_PATHS[name]) return ICON_PATHS[name]
  const p = new Path2D(), src = CANVAS_ICONS[name] || ''
  for (const [, d] of src.matchAll(/<path d="([^"]+)"/g)) p.addPath(new Path2D(d))
  for (const [, cx, cy, r] of src.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)) { const c = new Path2D(); c.arc(+cx, +cy, +r, 0, 7); p.addPath(c) }
  return ICON_PATHS[name] = p
}
// Icon centred at (x, y), `size` px, coloured stroke on a dark disc for contrast on the relief.
function drawIcon(name: string, x: number, y: number, size: number, color: string, disc = true) {
  ctx.save()
  if (disc) { ctx.fillStyle = '#0b1220cc'; ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, 7); ctx.fill() }
  ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 24, size / 24)
  ctx.lineWidth = disc ? 2.4 : 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color; ctx.stroke(iconPath(name))
  ctx.restore()
}

let raf = 0
export function draw() {
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint() })
}

function paint() {
  if (!cv || !ctx || view.w <= 1) return
  const m = G.md[U.map]
  ctx.clearRect(0, 0, view.w, view.h)
  if (!m) return
  const g = m.grid, ext = g.extent_m, x0 = g.x0
  // background: the coloured map (Kartenstil "Karte") once loaded, else the relief; around it its sea colour
  const art = U.mapStyle !== 'relief' && m.art, bg = art || m.relief
  ctx.fillStyle = (art && m.artBg) || '#1a3248'; ctx.fillRect(0, 0, view.w, view.h)
  if (bg) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bg, sx(x0), sz(x0), ext * view.s, ext * view.s) }

  const ids = selIds(), dim = ids.size || V.spot || V.cube
  // Spawns of needed mobs.
  if (U.layers.spawns) {
    const r = Math.max(1.6, Math.min(4, view.s * 4))
    const shown = V.targets.filter((x: Any) => !x.done) // every pet still needed (filters: toolbar / settings)
    for (const tg of ids.size ? V.targets.filter((x: Any) => ids.has(x.p.id)) : shown) {
      const on = !dim || ids.has(tg.p.id)
      if (ids.size && !on) continue
      ctx.fillStyle = tg.col; ctx.globalAlpha = on ? (V.spot || V.cube ? 0.55 : 0.95) : 0.3
      for (const mob of tg.mobs) {
        const named = mob.named || mob.r !== 'Normal'
        for (const i of m.byId.get(+mob.id) || []) {
          const x = sx(m.xs[i]), y = sz(m.zs[i])
          if (x < -5 || y < -5 || x > view.w + 5 || y > view.h + 5) continue
          if (view.s >= 0.45) drawIcon('skull', x, y, named ? 16 : 12, tg.col) // street level: skulls in the pet's colour
          else if (named) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 1.4, -r * 1.4, r * 2.8, r * 2.8); ctx.restore() }
          else { ctx.beginPath(); ctx.arc(x, y, ids.size ? r * 1.3 : r, 0, 7); ctx.fill() }
        }
      }
    }
    ctx.globalAlpha = 1
  }

  // Area labels.
  if (U.layers.labels) {
    ctx.font = '600 11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a0d14cc'
    const placed: number[][] = []
    for (const z of [...m.zones].sort((a: Any, b: Any) => b.area - a.area)) {
      const wpx = (z.bb[1] - z.bb[0]) * view.s, tw = ctx.measureText(z.n).width
      if (wpx < tw * 0.9) continue
      const x = sx(z.c[0]), y = sz(z.c[1])
      if (x < 0 || y < 0 || x > view.w || y > view.h) continue
      if (placed.some(p => Math.abs(p[0] - x) < (p[2] + tw) / 2 + 4 && Math.abs(p[1] - y) < 14)) continue
      placed.push([x, y, tw])
      ctx.fillStyle = '#e9edf5'; ctx.strokeText(z.n, x, y); ctx.fillText(z.n, x, y)
    }
  }

  // Farm spots.
  if (U.layers.spots || V.spot) {
    for (const s of V.spots) {
      if (V.spot && V.spot !== s.rank) continue
      const x = sx(s.x), y = sz(s.z), rr = Math.max(9, R * view.s)
      const on = !ids.size || s.pets.some((p: Any) => ids.has(p.t.p.id))
      ctx.globalAlpha = on ? 1 : 0.35
      ctx.lineWidth = V.spot === s.rank ? 2.5 : 1.6; ctx.strokeStyle = '#e8c872'; ctx.fillStyle = '#e8c87218'
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.arc(x, y - rr, 8, 0, 7); ctx.fill()
      ctx.fillStyle = '#1b1607'; ctx.font = '700 10px "Segoe UI"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.rank, x, y - rr + 0.5)
    }
    ctx.globalAlpha = 1
  }
  // Hidden cubes. Candidate spots: Lucide cube icon at every zoom level (smaller when zoomed out).
  if (U.layers.cubes || V.cube) {
    const near = view.s >= 0.35
    for (const c of m.cubes) {
      if (V.cube && V.cube !== c.key) continue
      for (const [x, z] of c.pts) {
        const px = sx(x), py = sz(z)
        if (px < -10 || py < -10 || px > view.w + 10 || py > view.h + 10) continue
        // Zoomed out a whole map has hundreds of spots: small, translucent and without the dark disc.
        const far = !near && !V.cube
        ctx.globalAlpha = far ? 0.6 : 1
        drawIcon('box', px, py, V.cube ? 18 : near ? 15 : Math.max(6, Math.min(9, view.s * 40)), '#d9a8ff', !far)
        ctx.globalAlpha = 1
      }
    }
  }
}

// ---------------------------------------------------------------- pan / zoom / hover / click

export type Tip = { x: number; y: number; it: Any } | null
let tipFn: (tip: Tip) => void = () => {}
export function onTip(f: (tip: Tip) => void) { tipFn = f }

let drag: Any = null
export function pointerDown(e: PointerEvent) {
  drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false }
  cv?.setPointerCapture(e.pointerId)
}
export function pointerMove(e: PointerEvent) {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; if (cv) cv.style.cursor = 'grabbing'; tipFn(null) }
    if (drag.moved) { view.cx = drag.cx - dx / view.s; view.cz = drag.cz - dy / view.s; draw() }
    return
  }
  hover(e)
}
export function pointerUp(e: PointerEvent) {
  const d = drag; drag = null
  if (cv) cv.style.cursor = ''
  if (d && !d.moved) click(e)
}
export const pointerLeave = () => tipFn(null)
export function wheel(e: WheelEvent) { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.25 : 0.8) }
export const dblClick = (e: MouseEvent) => zoomAt(e.offsetX, e.offsetY, 2)
export const zoomIn = () => zoomAt(view.w / 2, view.h / 2, 1.5)
export const zoomOut = () => zoomAt(view.w / 2, view.h / 2, 1 / 1.5)

function zoomAt(px: number, py: number, f: number) {
  const x = wx(px), z = wz(py)
  view.s = Math.min(3, Math.max(0.02, view.s * f))
  view.cx = x - (px - view.w / 2) / view.s; view.cz = z - (py - view.h / 2) / view.s
  draw()
}

function pick(px: number, py: number): Any {
  const m = G.md[U.map]
  if (!m) return null
  let best: Any = null, bd = 12 * 12
  const test = (x: number, z: number, item: Any) => { const d = (sx(x) - px) ** 2 + (sz(z) - py) ** 2; if (d < bd) { bd = d; best = item } }
  if (U.layers.spots || V.spot) for (const s of V.spots) {
    if (!V.spot || V.spot === s.rank) {
      test(s.x, s.z, { spot: s })
      const rr = Math.max(9, R * view.s), d = (sx(s.x) - px) ** 2 + (sz(s.z) - rr - py) ** 2 // the rank badge
      if (d < 100) { bd = 0; best = { spot: s } }
    }
  }
  if (U.layers.cubes || V.cube) for (const c of m.cubes) if (!V.cube || V.cube === c.key) c.pts.forEach(([x, z]: number[], i: number) => test(x, z, { cube: c, h: c.hs?.[i] }))
  const ids = selIds()
  if (U.layers.spawns) for (const tg of ids.size ? V.targets.filter((x: Any) => ids.has(x.p.id)) : V.targets.filter((x: Any) => !x.done)) {
    for (const mob of tg.mobs) for (const i of m.byId.get(+mob.id) || []) test(m.xs[i], m.zs[i], { t: tg, mob, i })
  }
  return best
}

function hover(e: PointerEvent) {
  const it = pick(e.offsetX, e.offsetY)
  if (cv) cv.style.cursor = it ? 'pointer' : ''
  tipFn(it ? { x: e.offsetX, y: e.offsetY, it } : null)
}

function click(e: PointerEvent) {
  const it = pick(e.offsetX, e.offsetY)
  if (!it) { if (V.sel || V.spot || V.cube) { V.sel = V.spot = V.cube = null; bump(); draw() } return }
  if (it.spot) { V.spot = it.spot.rank; V.sel = null; V.cube = null; U.tab = 'spots' }
  else if (it.cube) { V.cube = it.cube.key; V.sel = V.spot = null }
  else { V.multi.add(it.t.p.id); V.sel = null; V.spot = V.cube = null; U.tab = 'targets'; V.spotsSel = false; emit('recompute') }
  saveUi(['tab']); bump(); draw()
  // After the list re-rendered (bump is batched per frame): bring the selected entry into view.
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('[data-sel="true"], .sel')?.scrollIntoView({ block: 'nearest' })))
}

export function mergeSiteCubes(cubes: Any) {
  let changed = false
  for (const [key, names] of Object.entries<string[]>(cubes || {})) {
    const cur = new Set(U.cubes[key] || [])
    for (const n of names) if (!cur.has(n)) { cur.add(n); changed = true }
    U.cubes[key] = [...cur]
  }
  if (changed) { saveUi(['cubes']); bump(); draw() }
}
