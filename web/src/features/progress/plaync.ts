// Optional character lookup via NCSOFT's public character search on plaync.com (the website, not the game client).
// Search: api-search.plaync.com (name -> characters), detail: aion2.plaync.com/api/character/info (class, CP, titles).
// Both are fetched by the host (OverlayForm "plaync" -> GameData.PlayNc): the search API rejects foreign origins and
// the detail API sends no CORS headers. Without a host (unit tests) the page fetches directly.
// Linked profiles are stored per character name in U.pnc (settings.json via saveUi), the region in U.pncRegion.
import { U, V, saveUi, bump, type Any } from '@/core/state'
import { host, onHost } from '@/core/host'
import { on } from '@/core/bus'
import { lang, t } from '@/core/i18n'
import { toast } from '@/core/toast'

export type Region = 'eu' | 'nae'
export const REGIONS: Region[] = ['eu', 'nae']
/** One search result. `id` = characterId exactly as the search returns it (URL-encoded). */
export type Hit = { id: string; name: string; level: number | null; serverId: number; server: string; race: number | null; img: string; region: Region }
/** A linked character's website profile. */
export type Profile = Hit & {
  cls: string; cp: number | null; title: string
  titles: { owned: number; total: number } | null
  titleCats: { cat: string; owned: number; total: number }[]
  at: number
}

const SEARCH = 'https://api-search.plaync.com/aion2global/search/v2/character'
const DETAIL = 'https://aion2.plaync.com/api/character/info'
const IMG = 'https://profileimg.plaync.com'
/** Auto refresh on app start when the data is older than this. */
export const MAX_AGE = 4 * 3600e3

// ---------------------------------------------------------------- parsing (pure)

/** "<strong>Mar</strong>" -> "Mar" (the search highlights the match). */
export const stripTags = (s: unknown) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
/** "/game_profile_images/..." -> absolute URL on profileimg.plaync.com. */
export const imgUrl = (p: unknown) => {
  const s = String(p ?? '')
  return !s ? '' : /^https?:\/\//.test(s) ? s : IMG + (s.startsWith('/') ? '' : '/') + s
}
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null)
const sameId = (a: string, b: string) => { try { return decodeURIComponent(a) === decodeURIComponent(b) } catch { return a === b } }

export function parseSearch(json: Any, region: Region): Hit[] {
  return (Array.isArray(json?.list) ? json.list : []).filter((x: Any) => x?.characterId && x?.serverId != null).map((x: Any): Hit => ({
    id: String(x.characterId), name: stripTags(x.name), level: num(x.level), serverId: Number(x.serverId), server: String(x.serverName ?? ''),
    race: num(x.race), img: imgUrl(x.profileImageUrl), region: x.region === 'nae' || x.region === 'eu' ? x.region : region,
  }))
}

/** True if the detail answer carries no character (it then has every field null). */
export const emptyDetail = (d: Any) => !d?.profile?.characterName && d?.profile?.characterLevel == null

/** Website detail -> profile; every field the detail lacks (null) comes from the search hit. */
export function mapProfile(d: Any, hit: Hit, at = Date.now()): Profile {
  const p = d?.profile || {}, tt = d?.title || {}
  const owned = num(tt.ownedCount), total = num(tt.totalCount)
  return {
    ...hit,
    name: stripTags(p.characterName) || hit.name,
    level: num(p.characterLevel) ?? hit.level,
    server: p.serverName || hit.server,
    race: num(p.raceId) ?? hit.race,
    img: imgUrl(p.profileImage) || hit.img,
    cls: String(p.className ?? ''),
    cp: num(p.combatPower),
    title: String(p.titleName ?? ''),
    titles: owned != null && total != null ? { owned, total } : null,
    titleCats: (Array.isArray(tt.titleList) ? tt.titleList : []).filter((x: Any) => num(x?.ownedCount) != null && num(x?.totalCount) != null)
      .map((x: Any) => ({ cat: String(x.equipCategory ?? ''), owned: x.ownedCount, total: x.totalCount })),
    at,
  }
}

export const searchUrl = (name: string, region: Region) =>
  `${SEARCH}?keyword=${encodeURIComponent(name.trim())}&region=${region}&localeInfo=en-US&size=20`
/** The id goes in as the search returned it (already encoded). */
export const detailUrl = (h: Pick<Hit, 'id' | 'serverId' | 'region'>) =>
  `${DETAIL}?lang=${lang() === 'de' ? 'de-DE' : 'en-US'}&characterId=${h.id}&serverId=${h.serverId}&region=${h.region}`

// ---------------------------------------------------------------- transport

let seq = 0
const waiting = new Map<number, (m: Any) => void>()
onHost('plaync', m => { const f = waiting.get(m.id); if (f) { waiting.delete(m.id); f(m) } })

async function getJson(url: string): Promise<Any> {
  if (!(window as Any).chrome?.webview) {
    const r = await fetch(url)
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.json()
  }
  const id = ++seq
  const m = await new Promise<Any>((res, rej) => {
    waiting.set(id, res)
    host({ type: 'plaync', id, url })
    setTimeout(() => { if (waiting.delete(id)) rej(new Error('timeout')) }, 20000)
  })
  if (!m.status || m.status >= 400 || m.body == null) throw new Error(m.status ? 'HTTP ' + m.status : 'offline')
  return JSON.parse(m.body)
}

// ---------------------------------------------------------------- state

export const region = (): Region => (U.pncRegion === 'nae' ? 'nae' : 'eu')
export const profileOf = (char: string): Profile | undefined => U.pnc?.[char]
/** Transient: refresh running / last error per character. */
export const busy = new Set<string>()
export const errors: Record<string, string> = {}

export async function search(name: string, r: Region = region()): Promise<Hit[]> {
  return parseSearch(await getJson(searchUrl(name, r)), r)
}

function store(char: string, p: Profile) {
  U.pnc ||= {}
  U.pnc[char] = p
  saveUi(['pnc'])
}

/** Link a character to a search hit: shows the search data at once, then loads the detail. */
export function link(char: string, hit: Hit) {
  store(char, mapProfile(null, hit))
  bump()
  return refresh(char)
}

export function unlink(char: string) {
  if (U.pnc?.[char]) { delete U.pnc[char]; saveUi(['pnc']) }
  delete errors[char]
  bump()
}

/** Load the website profile again. Failures keep the stored data; `quiet` = no toast (auto refresh). */
export async function refresh(char: string, quiet = false) {
  const p = profileOf(char)
  if (!p || busy.has(char)) return
  busy.add(char); delete errors[char]; bump()
  try {
    const d = await getJson(detailUrl(p))
    let hit: Hit = p
    // some characters have no website detail: take the level etc. from a fresh search instead
    if (emptyDetail(d)) hit = (await search(p.name, p.region)).find(h => sameId(h.id, p.id)) ?? p
    if (profileOf(char)?.id === p.id) store(char, mapProfile(d, hit))
  } catch {
    errors[char] = t('pnc.err')
    if (!quiet) toast(t('pnc.err'), t('pnc.errSub'))
  } finally {
    busy.delete(char); bump()
  }
}

/** On app start: refresh linked characters whose data is older than MAX_AGE, one after the other, quietly. */
export async function autoRefresh(now = Date.now()) {
  for (const [char, p] of Object.entries((U.pnc || {}) as Record<string, Profile>))
    if (!(now - (p.at || 0) < MAX_AGE)) await refresh(char, true)
}
on('init', () => { if (!V.pncAuto) { V.pncAuto = true; setTimeout(() => void autoRefresh(), 3000) } })

// ---------------------------------------------------------------- display

/** "vor 5 min" / "vor 3 h" / "vor 2 Tagen". */
export function ago(at: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000))
  return m < 1 ? t('pnc.now') : m < 60 ? t('pnc.min', { n: m }) : m < 2880 ? t('pnc.hours', { n: Math.round(m / 60) }) : t('pnc.days', { n: Math.round(m / 1440) })
}
/** "Lv 45 · Gladiator · 12.345 CP". */
export const infoLine = (p: Profile) => [p.level != null ? t('pnc.lv', { n: p.level }) : '', p.cls, p.cp ? t('pnc.cp', { n: p.cp.toLocaleString(lang() === 'de' ? 'de-DE' : 'en-GB') }) : ''].filter(Boolean).join(' · ')
export const raceName = (r: number | null) => (r === 1 || r === 2 ? t('pnc.race.' + r) : '')
/** "Beritra · Asmodier · Titel 13/297". */
export const infoLine2 = (p: Profile) => [p.server, raceName(p.race), p.titles ? t('pnc.titles', { n: p.titles.owned, total: p.titles.total }) : ''].filter(Boolean).join(' · ')
/** Tooltip: source and age. */
export const sourceTip = (p: Profile) => `${t('pnc.source')} · ${t('pnc.stand', { age: ago(p.at) })}`
