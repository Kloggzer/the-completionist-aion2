// Game data: pets, map index, per-map monsters/mapdata (served by the host from its cache at /data/).
import { host, onHost } from './host'
import { G, U, V, saveUi, bump, type Any } from './state'
import { emit } from './bus'
import { t } from './i18n'

const DATA = '/data/'

export async function getJson(path: string): Promise<Any> {
  const r = await fetch(DATA + path, { cache: 'no-store' })
  if (!r.ok) throw new Error(path + ' ' + r.status)
  return r.json()
}

export function showMapMsg(msg: string) { V.mapMsg = msg || ''; bump() }

/** Map display name in the UI language. */
export const mapName = (name: string) => { const k = 'map.' + name, v = t(k); return v === k ? name : v }

export async function loadBase() {
  try {
    const [pets, idx] = await Promise.all([getJson('pets.json'), getJson('maps/index.json')])
    G.pets = pets.pets
    G.petById = new Map(G.pets.map((p: Any) => [p.id, p]))
    G.maps = idx.maps.filter((m: Any) => m.global?.state === 'open' && m.files?.includes('monsters.json'))
    if (!U.map || !G.maps.some((m: Any) => m.key === U.map)) U.map = G.maps.find((m: Any) => m.key === 'World_D_A')?.key || G.maps[0]?.key
    bump()
    emit('base')
    await selectMap(U.map)
    // Per-map data for the map picker counts and field bosses, loaded in the background.
    for (const m of G.maps) if (!G.md[m.key]) await ensureMap(m.key).catch(() => {})
    G.force = false
    emit('allMaps')
    bump()
  } catch (e: Any) { showMapMsg(t('data.failed', { err: e.message })) }
}

const mapBase = (key: string) => `maps/${key}/`

export function ensureMap(key: string, force?: boolean): Promise<Any> {
  force = force || G.force
  if (G.md[key] && !force) return Promise.resolve(G.md[key])
  return new Promise((resolve, reject) => {
    G.loading[key] = async (ok: boolean) => {
      delete G.loading[key]
      try {
        const [mon, md] = await Promise.all([getJson(mapBase(key) + 'monsters.json'), getJson(mapBase(key) + 'mapdata.json')])
        const meta = G.maps.find((m: Any) => m.key === key)
        G.md[key] = buildMap(key, meta, mon, md)
        resolve(G.md[key])
      } catch (e) { reject(ok ? e : new Error(t('data.download'))) }
    }
    host({ type: 'needMap', key, force: !!force })
  })
}

function buildMap(key: string, meta: Any, mon: Any, md: Any) {
  const flat = md.monsters, n = flat.length / 4
  const ids = new Int32Array(n), xs = new Float32Array(n), zs = new Float32Array(n), byId = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    ids[i] = flat[i * 4]; xs[i] = flat[i * 4 + 1]; zs[i] = flat[i * 4 + 3]
    let a = byId.get(ids[i]); if (!a) byId.set(ids[i], a = []); a.push(i)
  }
  const zones = (md.subzones || []).filter((z: Any) => z.poly?.length > 2 && z.n).map((z: Any) => {
    let a = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
    for (let i = 0; i < z.poly.length; i++) {
      const [x, y] = z.poly[i], [x2, y2] = z.poly[(i + 1) % z.poly.length]
      a += x * y2 - x2 * y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, y); z1 = Math.max(z1, y)
    }
    return { n: z.n, c: z.c, poly: z.poly, area: Math.abs(a) / 2, bb: [x0, x1, z0, z1] }
  })
  const world = Math.max(...zones.map((z: Any) => z.area), 1)
  const m: Any = {
    key, name: meta?.name || key, grid: meta?.grid || { x0: -3072, extent_m: 6144 }, species: mon.species, ids, xs, zs, byId,
    zones: zones.filter((z: Any) => z.area < world * 0.5 || zones.length < 3), named: md.named || [], relief: null, zoneCache: new Map(),
  }
  m.cubes = (md.cubes || []).map((c: Any, gi: number) => {
    const pts = c.pos.map((p: number[]) => [p[0], p[2]])
    const cx = pts.reduce((s: number, p: number[]) => s + p[0], 0) / pts.length, cz = pts.reduce((s: number, p: number[]) => s + p[1], 0) / pts.length
    // heights (m) per spot, null when the source has none
    return { key: c.s, gi, pts, hs: c.pos.map((p: (number | null)[]) => p[1]), cx, cz, col: `hsl(${gi * 47 % 360} 75% 62%)` }
  })
  const nameCount: Record<string, number> = {}
  for (const c of m.cubes) {
    const zn = zoneAt(m, c.cx, c.cz) || prettyCube(c.key)
    nameCount[zn] = (nameCount[zn] || 0) + 1
    c.name = zn; c.idx = nameCount[zn]
  }
  for (const c of m.cubes) if (nameCount[c.name] > 1) c.name += ' ' + String.fromCharCode(64 + c.idx)
  loadImg(m, 'relief.png', img => { m.relief = img })
  return m
}

function loadImg(m: Any, file: string, done: (img: HTMLImageElement) => void, fail?: () => void) {
  const img = new Image()
  img.onload = () => { done(img); if (U.map === m.key) emit('draw') }
  if (fail) img.onerror = fail
  img.src = DATA + mapBase(m.key) + file
}

/** Map background in the chosen style ("Kartenstil"): the coloured map (rendered by the host once per world map,
 *  until then the relief) or the hill-shaded relief. Only the shown map keeps its large coloured image. */
export function loadMapArt(key: string, force?: boolean) {
  for (const k in G.md) if (k !== key && G.md[k].art) { G.md[k].art = null; G.md[k].artFile = '' }
  const m = G.md[key]
  if (!m || U.mapStyle === 'relief' || (m.artFile && !force)) return
  m.artFile = 'pending'
  host({ type: 'needArt', key, force: !!force })
}

/** The image's top-left pixel (open sea): the canvas fills the area around the image with it. */
function cornerColour(img: HTMLImageElement) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 1
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0, 4, 4, 0, 0, 1, 1)
    const [r, g, b] = x.getImageData(0, 0, 1, 1).data
    return `rgb(${r} ${g} ${b})`
  } catch { return '' }
}

onHost('artReady', r => {
  const m = G.md[r.key]
  if (!m || m.artFile !== 'pending') return
  if (!r.file) { m.artFile = 'none'; return } // no voxels / offline: the relief stays
  m.artFile = r.file
  loadImg(m, r.file, img => { if (m.artFile === r.file) { m.art = img; m.artBg = cornerColour(img) } }, () => { m.artFile = 'none' })
})

const prettyCube = (s: string) => s.replace(/^EnvObj_[A-Z]\d_/, '').replace(/_HiddenBox.*$/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')

function inPoly(x: number, z: number, poly: number[][]) {
  let ins = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins
  }
  return ins
}

/** Smallest named area containing the point ('' if none). */
export function zoneAt(m: Any, x: number, z: number): string {
  let best: Any = null
  for (const zn of m.zones)
    if (x >= zn.bb[0] && x <= zn.bb[1] && z >= zn.bb[2] && z <= zn.bb[3] && (!best || zn.area < best.area) && inPoly(x, z, zn.poly)) best = zn
  return best?.n || ''
}
export function zoneOfSpawn(m: Any, i: number): string {
  let v = m.zoneCache.get(i)
  if (v === undefined) m.zoneCache.set(i, v = zoneAt(m, m.xs[i], m.zs[i]) || t('zone.open'))
  return v
}
export function nearestZone(m: Any, x: number, z: number): string {
  let best = '', d = 1e18
  for (const zn of m.zones) { const dd = (zn.c[0] - x) ** 2 + (zn.c[1] - z) ** 2; if (dd < d) { d = dd; best = zn.n } }
  return best ? t('zone.near', { zone: best }) : t('zone.open')
}

/** Start view for screenshots/tests (--view settings|site|spots). */
export let startView = ''
export function setStartView(v: string) { startView = v || '' }

export async function selectMap(key: string) {
  U.map = key; saveUi(['map'])
  V.sel = V.spot = V.cube = null
  showMapMsg(t('data.loadingMap'))
  try {
    await ensureMap(key)
    if (U.map !== key) return
    showMapMsg('')
    loadMapArt(key)
    emit('recompute')
    emit('fit')
    emit('mapShown', key)
    if (startView === 'settings') { V.settingsOpen = true; bump() }
    else if (startView === 'site') host({ type: 'site', on: true, map: U.map })
    else if (startView === 'spots') { U.tab = 'spots'; bump() }
    startView = ''
  } catch (e: Any) { showMapMsg(t('data.mapFailed', { err: e.message })) }
}

onHost('dataReady', m => { G.force = !!m.refreshed; if (m.ok) loadBase(); else showMapMsg(t('data.unreachable')) })
onHost('mapReady', m => G.loading[m.key]?.(m.ok))
