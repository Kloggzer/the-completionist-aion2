// Achievements. Definitions: aion2.app (web/public/achievements.json, via tools/fetch_achievements.py).
// Progress: S.state.ach = {id: [counter, tier, last change ms]}.
import { S, U, G, bump, type Any } from '@/core/state'
import { host } from '@/core/host'
import { t, lang } from '@/core/i18n'
import { toast } from '@/core/toast'

/** [difficulty below, i18n key]; band index 3 = done. */
export const ACH_BANDS: [number, string][] = [[35, 'progress.band.easy'], [65, 'progress.band.medium'], [101, 'progress.band.hard']]

fetch('achievements.json').then(r => r.json()).then(d => {
  G.ach = d.achievements; G.achById = new Map(G.ach.map((a: Any) => [a.id, a]))
  bump()
}).catch(() => {})

/** Localised field of an achievement or tier (name/objective/category), falls back to German. */
export const loc = (o: Any, f: string): string => (lang() === 'en' && o?.[f + '_en']) || o?.[f + '_de'] || ''

export type AchRow = { a: Any; val: number; reached: number; next: Any; done: boolean; frac: number; diff: number }

export function achRows(): AchRow[] {
  if (!G.ach) return []
  const st = S.state.ach || {}
  // Faction chosen in the tab's bar; until then guessed from the ids with progress (Asmodian 4xx / Elyos 3xx).
  const fac = U.faction ? (U.faction === 'all' ? null : U.faction) : achFaction()
  return G.ach.filter((a: Any) => !fac || a.faction === fac).map((a: Any) => {
    const val = st[a.id]?.[0] ?? 0, reached = a.tiers.filter((x: Any) => val >= x.goal).length, next = a.tiers[reached] || null
    const prev = reached ? a.tiers[reached - 1].goal : 0
    return { a, val, reached, next, done: !next, frac: next ? Math.min(1, (val - prev) / Math.max(1, next.goal - prev)) : 1, diff: next ? next.difficulty : 101 }
  })
}

/** Faction known from the progress entries (null: none yet). */
export function achFaction(): string | null {
  const ids = Object.keys(S.state.ach || {})
  return ids.some(k => k[0] === '4') ? 'Asmodian' : ids.some(k => k[0] === '3') ? 'Elyos' : null
}

/** Set an achievement's counter (the tier follows from the goals). The host stores it and answers with 'achUpd'. */
export function setAch(a: Any, val: number) {
  val = Math.max(0, Math.round(val))
  host({ type: 'setAch', id: a.id, val, tier: a.tiers.filter((x: Any) => val >= x.goal).length })
}

/** Open achievements for the tab badge (0 while the definitions are not loaded). */
export const achOpenCount = () => (G.ach ? achRows().filter(r => !r.done).length : 0)

export function onAchUpd(items: Any[]) {
  const st = S.state.ach || (S.state.ach = {})
  for (const [id, val, tier, ts] of items) {
    const a = G.achById?.get(id), known = !!st[id], before = st[id]?.[0] ?? 0
    st[id] = [val, tier, ts]
    if (!a || !U.toasts || !known) continue
    const x = a.tiers.find((x: Any) => before < x.goal && val >= x.goal)
    if (x) toast(t('progress.achToast', { name: loc(a, 'name') }), t('progress.achTier', { n: x.tier }), 1, true)
  }
  bump()
}
