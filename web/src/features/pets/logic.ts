// Planning: which soul pets are still missing on a map, which mobs drop them and where to farm.
import { G, NEED, S, U, V, bump, type Any } from '@/core/state'
import { zoneAt, zoneOfSpawn, nearestZone } from '@/core/data'
import { t } from '@/core/i18n'
import { emit } from '@/core/bus'

export const PALETTE = ['#5fd0e0', '#f0a050', '#b48cff', '#74d68a', '#ff7a8a', '#e8c872', '#6fa8ff', '#f78fd0', '#9be86f', '#ffb36b']
export const SORTS = ['prio', 'near', 'spawns', 'name'] as const

export function petInfo(id: number) {
  const lv = S.state.levels[id] || 0, souls = lv >= 3 ? 0 : S.state.souls[id] || 0, need = NEED[lv] || 0
  let rest = lv >= 3 ? 0 : need - souls
  for (let l = lv + 1; l < 3; l++) rest += NEED[l]
  return { lv, souls, need, done: lv >= 3, left: Math.max(0, need - souls), rest }
}

export const mobOk = (mob: Any) => !(U.hideNamed && (mob.named || mob.r !== 'Normal')) && mob.lv >= U.lvMin && mob.lv <= U.lvMax
export const soulPets = (): Any[] => G.pets.filter((p: Any) => !p.ng || (S.state.levels[p.id] || 0) > 0)

export function computeTargets(m: Any): Any[] {
  const out: Any[] = []
  for (const p of soulPets()) {
    const info = petInfo(p.id)
    if (info.done && !U.showLv3) continue
    const mobs = p.npc.filter((id: Any) => m.species[id]).map((id: Any) => ({ id, ...m.species[id], count: m.byId.get(id)?.length || 0 }))
      .filter((mob: Any) => mob.count > 0 && mobOk(mob))
    if (!mobs.length) continue
    const spawns = mobs.reduce((s: number, mob: Any) => s + mob.count, 0)
    const prio = info.done ? -1 : (3 - info.lv) * 100 + info.souls / info.need * 100
    out.push({ p, ...info, mobs, spawns, prio })
  }
  const by = ({
    prio: (a: Any, b: Any) => b.prio - a.prio || b.spawns - a.spawns,
    near: (a: Any, b: Any) => (a.done - b.done) || a.left - b.left || b.prio - a.prio,
    spawns: (a: Any, b: Any) => b.spawns - a.spawns,
    name: (a: Any, b: Any) => a.p.n.localeCompare(b.p.n),
  } as Record<string, (a: Any, b: Any) => number>)[U.sort] || ((a: Any, b: Any) => b.prio - a.prio)
  out.sort(by)
  out.forEach((x, i) => { x.col = PALETTE[i % PALETTE.length]; x.area = bestArea(m, x) })
  return out
}

function bestArea(m: Any, tg: Any) {
  const cnt = new Map<string, number>(), open = t('zone.open')
  for (const mob of tg.mobs) for (const i of m.byId.get(+mob.id) || []) { const z = zoneOfSpawn(m, i); cnt.set(z, (cnt.get(z) || 0) + 1) }
  let best = '', n = 0
  for (const [z, c] of cnt) if (c > n || (c === n && best === open)) { best = z; n = c }
  return { name: best, n }
}

// Farm spots: spawn clusters of needed mobs. Per pet, spawns count up to (souls still missing + 4) so a pet that needs
// one more soul doesn't dominate; unlocks weigh double; several needed pets at one spot get a bonus.
export const R = 75
export function computeSpots(m: Any, targets: Any[]): Any[] {
  const live = targets.filter(x => !x.done)
  if (!live.length) return []
  const pts: number[][] = []
  live.forEach((x, ti) => { for (const mob of x.mobs) for (const i of m.byId.get(+mob.id) || []) pts.push([m.xs[i], m.zs[i], ti]) })
  const hash = new Map<number, number[]>(), key = (a: number, b: number) => a * 100003 + b
  for (let k = 0; k < pts.length; k++) {
    const h = key(Math.floor(pts[k][0] / R), Math.floor(pts[k][1] / R))
    let a = hash.get(h); if (!a) hash.set(h, a = []); a.push(k)
  }
  const near = (x: number, z: number) => {
    const out: number[][] = [], gx = Math.floor(x / R), gz = Math.floor(z / R)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
      for (const k of hash.get(key(gx + dx, gz + dz)) || []) { const p = pts[k]; if ((p[0] - x) ** 2 + (p[1] - z) ** 2 <= R * R) out.push(p) }
    return out
  }
  const weight = (x: Any) => (x.lv === 0 ? 2 : x.lv === 1 ? 1.2 : 1)
  const score = (ps: number[][]) => {
    const per = new Map<number, number>()
    for (const p of ps) per.set(p[2], (per.get(p[2]) || 0) + 1)
    let s = 0
    for (const [ti, c] of per) s += weight(live[ti]) * Math.min(c, live[ti].left + 4)
    return { s: s * (1 + 0.35 * (per.size - 1)), per }
  }
  // Candidates: centroids of small cells.
  const cells = new Map<number, number[]>(), C = R / 2
  for (const p of pts) {
    const h = key(Math.floor(p[0] / C), Math.floor(p[1] / C))
    let c = cells.get(h); if (!c) cells.set(h, c = [0, 0, 0]); c[0] += p[0]; c[1] += p[1]; c[2]++
  }
  const cand: Any[] = [...cells.values()].map(([x, z, n]) => {
    const ps = near(x / n, z / n)
    const cx = ps.reduce((s, p) => s + p[0], 0) / ps.length, cz = ps.reduce((s, p) => s + p[1], 0) / ps.length
    return { x: cx, z: cz, ...score(ps), n: ps.length }
  }).sort((a, b) => b.s - a.s)
  const spots: Any[] = []
  for (const c of cand) {
    if (spots.length >= 8) break
    if (spots.some(s => (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < (R * 2.6) ** 2)) continue
    c.name = zoneAt(m, c.x, c.z) || nearestZone(m, c.x, c.z)
    if (spots.filter(s => s.name === c.name).length >= 2) continue
    c.pets = [...c.per].map(([ti, n]: number[]) => ({ t: live[ti], n })).sort((a, b) => b.t.prio - a.t.prio)
    spots.push(c)
  }
  const top = spots[0]?.s || 1
  spots.forEach((s, i) => { s.rank = i + 1; s.rel = s.s / top })
  return spots
}

/** Mobs of a target grouped by name (variants with different levels/ids merged), most spawns first. */
export function mobGroups(tg: Any): Any[] {
  const g = new Map<string, Any>()
  for (const mob of tg.mobs) {
    const k = mob.n; let e = g.get(k)
    if (!e) g.set(k, e = { n: mob.n, lv: [mob.lv, mob.lv], count: 0, mob, ids: [] })
    e.lv = [Math.min(e.lv[0], mob.lv), Math.max(e.lv[1], mob.lv)]; e.count += mob.count; e.ids.push(mob.id)
  }
  return [...g.values()].sort((a, b) => b.count - a.count)
}
export const lvTxt = (lv: number[]) => (lv[0] === lv[1] ? `Lv ${lv[0]}` : `Lv ${lv[0]}–${lv[1]}`)

/** Add/remove a pet from the multi-selection (map highlight, "find spot"). */
export function toggleMulti(id: number) {
  if (V.multi.has(id)) V.multi.delete(id); else V.multi.add(id)
  V.spot = V.cube = null
  recompute(); emit('fit'); emit('draw')
}
export function clearMulti() { V.multi.clear(); V.spotsSel = false; recompute(); emit('fit'); emit('draw') }
/** Spots for the selected pets only; the best one is selected on the map. */
export function spotsForSelection() {
  V.spotsSel = true; V.sel = null; V.cube = null
  recompute()
  V.spot = V.spots[0]?.rank ?? null
}

/** Rebuild targets + spots for the current map ('recompute' handler; the map feature repaints afterwards). */
export function recompute() {
  const m = G.md[U.map]
  if (m) {
    V.targets = computeTargets(m)
    for (const id of V.multi) if (!V.targets.some((x: Any) => x.p.id === id)) V.multi.delete(id)
    if (!V.multi.size) V.spotsSel = false
    // "Find spot" for a multi-selection: spots computed from the selected pets only.
    V.spots = computeSpots(m, V.spotsSel ? V.targets.filter((x: Any) => V.multi.has(x.p.id)) : V.targets)
    if (V.sel && !V.targets.some((x: Any) => x.p.id === V.sel)) V.sel = null
    if (V.spot && !V.spots.some((s: Any) => s.rank === V.spot)) V.spot = null
  }
  bump()
}
