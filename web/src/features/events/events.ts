// Timers / calendar / announcer and field bosses (respawn counted from the kill).
import { G, U, V, saveUi, bump, type Any } from '@/core/state'
import { host } from '@/core/host'
import { getJson, zoneAt } from '@/core/data'
import { hm, lang, locale, t } from '@/core/i18n'
import { say } from '@/core/tts'

// ---------------------------------------------------------------- timers / calendar / announcer
// Schedule from aion2maps (assets/timers.json): times are minutes after midnight on the given weekdays (0 = Sunday)
// in the server region's time zone (EU = Europe/Berlin); the resets carry their own zone.
const TIMER_DE: Record<string, string> = { 'Spacetime Rift': 'Raum-Zeit-Riss', 'Dimensional Invasion': 'Dimensions-Invasion', 'Shugo Festival': 'Shugo-Festival',
  'Artifact Siege': 'Artefakt-Belagerung', 'Daily reset': 'Daily-Reset', 'Weekly reset': 'Weekly-Reset' }
const TIMER_DEFAULT_ON = (ev: Any) => ev.kind === 'boss' || ev.kind === 'rift' || ev.kind === 'abyss'
const MAP_SHORT: Record<string, string> = { Abyss_Reshanta_A: 'Reshanta', World_D_A: 'Altgard', World_L_A: 'Verteron' }

export const lead = () => U.timerLead ?? 10

const tzParts = (tz: string, ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
  const g = (k: string) => +p.find(x => x.type === k)!.value
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') }
}
const tzOffset = (tz: string, ms: number) => { const a = tzParts(tz, ms); return Date.UTC(a.y, a.mo - 1, a.d, a.h, a.mi, a.s) - Math.floor(ms / 1000) * 1000 }
const zonedMs = (tz: string, y: number, mo: number, d: number, min: number) => { const guess = Date.UTC(y, mo - 1, d, 0, min); return guess - tzOffset(tz, guess - tzOffset(tz, guess)) }

export function loadTimers() {
  return getJson('timers.json').then(tm => {
    const tz = (tm.regions || []).find((r: Any) => r.key === 'EU')?.tz || 'Europe/Berlin'
    G.timers = (tm.events || []).map((e: Any) => ({ ...e, tz: e.tz || tz }))
    if (tm.resets?.tz) G.timers.push({ id: 'daily', kind: 'reset', name: 'Daily reset', times: [tm.resets.daily], days: [0, 1, 2, 3, 4, 5, 6], tz: tm.resets.tz },
      { id: 'weekly', kind: 'reset', name: 'Weekly reset', times: [tm.resets.weekly], days: [tm.resets.weekly_day], tz: tm.resets.tz })
    bump()
    announceTick()
  }).catch(() => {})
}

// Bells on two levels: the series (every occurrence of an event, U.timerOn[ev.id], default per kind) and single
// occurrences (U.timerOnce[ev.id|ms]: true = announce this one even if the series is off, false = mute this one).
// Precedence: occurrence override, then series, then the kind default.
/** Series bell: every occurrence of the event. */
export const timerOn = (ev: Any): boolean => U.timerOn?.[ev.id] ?? TIMER_DEFAULT_ON(ev)
export const onceKey = (ev: Any, ms: number) => ev.id + '|' + ms
/** Override of one occurrence (undefined = follows the series). */
export const onceOf = (ev: Any, ms: number): boolean | undefined => U.timerOnce?.[onceKey(ev, ms)]
/** Is this occurrence announced? */
export const occOn = (ev: Any, ms: number): boolean => onceOf(ev, ms) ?? timerOn(ev)
/** Drop overrides that equal the series again or whose time has passed. */
export function cleanOnce(now = Date.now()) {
  const o = U.timerOnce
  if (!o) return
  for (const k of Object.keys(o)) {
    const i = k.lastIndexOf('|'), id = k.slice(0, i), ms = +k.slice(i + 1), ev = G.timers?.find((e: Any) => e.id === id)
    if (ms < now - 3600e3 || (ev && o[k] === timerOn(ev))) delete o[k]
  }
}
export function toggleTimer(ev: Any) { U.timerOn ||= {}; U.timerOn[ev.id] = !timerOn(ev); cleanOnce(); saveUi(['timerOn', 'timerOnce']); bump() }
/** Toggle one occurrence only. */
export function toggleOnce(ev: Any, ms: number) {
  U.timerOnce ||= {}
  const next = !occOn(ev, ms)
  if (next === timerOn(ev)) delete U.timerOnce[onceKey(ev, ms)]
  else U.timerOnce[onceKey(ev, ms)] = next
  cleanOnce(); saveUi(['timerOnce']); bump()
}
export const TIMER_KINDS = ['boss', 'rift', 'abyss', 'field'] as const
/** All events of a kind announced (series level)? */
export const kindOn = (kind: string) => !!G.timers?.some((e: Any) => e.kind === kind) && G.timers.filter((e: Any) => e.kind === kind).every(timerOn)
/** Switch the series bell of every event of a kind (all on, or all off when all were on). */
export function toggleKind(kind: string) {
  const on = !kindOn(kind)
  U.timerOn ||= {}
  for (const e of G.timers || []) if (e.kind === kind) U.timerOn[e.id] = on
  cleanOnce(); saveUi(['timerOn', 'timerOnce']); bump()
}
/** Events that repeat (at least) hourly: shown as one strip, not as calendar blocks. */
export const hourly = (ev: Any) => ev.times.length >= 12

export function occurrences(ev: Any, from: number, to: number) {
  const out: number[] = [], base = tzParts(ev.tz, from)
  for (let k = -1; k <= 8; k++) {
    const day = new Date(Date.UTC(base.y, base.mo - 1, base.d + k))
    if (!ev.days.includes(day.getUTCDay())) continue
    for (const tm of ev.times) {
      const ms = zonedMs(ev.tz, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), tm)
      if (ms >= from && ms < to) out.push(ms)
    }
  }
  return out
}
export const timerName = (ev: Any): string => (lang() === 'de' && TIMER_DE[ev.name]) || ev.name
export const timerWhere = (ev: Any) => Object.keys(ev.maps || {}).map(k => MAP_SHORT[k] || k).join(' & ')

// Spoken countdown for an occurrence: at the lead time, 5 and 1 minute before. Only the step whose window we are
// in is spoken (starting the app 3 min before an event says "in 1 Minute" later, not all steps at once).
function remind(kind: string, key: string, ms: number, text: string, startText: string) {
  const now = Date.now(), steps = [...new Set([lead(), 5, 1])].sort((a, b) => b - a)
  scheduleStart(kind, key, ms, startText)
  V.said ||= new Set()
  steps.forEach((m, i) => {
    const from = ms - m * 60e3, to = i + 1 < steps.length ? ms - steps[i + 1] * 60e3 : ms
    const k = key + '|' + m
    if (now >= from && now < to && !V.said.has(k)) { V.said.add(k); say(kind, m === 1 ? t('timer.say1', { name: text }) : t('timer.say', { name: text, n: m })) }
  })
}

// The moment itself: "pling – pling – plong" (2 s, 1 s before, at the start) and "… startet jetzt".
// The ticks run every 10 s, so the exact moment is scheduled with timers once it is less than 30 s away.
function scheduleStart(kind: string, key: string, ms: number, text: string) {
  const left = ms - Date.now()
  V.starts ||= new Set()
  if (left <= 0 || left > 30e3 || V.starts.has(key)) return
  V.starts.add(key)
  const sound = U.startChime !== false
  if (sound) for (const s of [2, 1]) if (left > s * 1000) setTimeout(() => host({ type: 'chime', kind: 'pling' }), left - s * 1000)
  setTimeout(() => {
    if (sound) host({ type: 'chime', kind: 'plong' })
    say(kind, text)
  }, left)
}

// Announce enabled events `lead` minutes ahead, once per occurrence (also while the overlay is hidden).
export function announceTick() {
  if (!G.timers) return
  const now = Date.now(), ld = lead() * 60e3
  V.announced ||= new Set()
  for (const ev of G.timers) {
    if (ev.kind === 'reset') continue
    for (const ms of occurrences(ev, now, now + ld)) {
      if (!occOn(ev, ms)) continue
      const key = ev.id + '|' + ms
      remind('timer', key, ms, timerName(ev), t('timer.sayStart', { name: timerName(ev) }))
      if (V.announced.has(key)) continue
      V.announced.add(key)
      const where = timerWhere(ev)
      host({ type: 'announce', key, title: timerName(ev), sub: t('timer.sub', { at: hm(ms) }) + (where ? ' · ' + where : ''), at: ms, sound: U.soundTimer !== false })
    }
  }
}

// ---------------------------------------------------------------- field bosses (respawn counted from the kill)
// Respawn minutes per boss (couga54.github.io/aion2-guides, Global). The game respawns within ~10 min after that.
const FB_RESPAWN: Record<string, number> = {
  'Melted Danar': 30, 'Black Warrior Aed': 30, 'Faithful Rajit': 30, 'Berserker Vargor': 60, 'Blood Warrior Lannar': 90,
  'Predator Garsan': 120, 'Deceiver Trid': 120, 'Blue Wave Kelpina': 120, 'Advisor Resana': 180, 'High Overseer Nutah': 120,
  'Special Operations Leader Linx': 180, 'Desecrator Newbold': 240, 'Specter Archon Axios': 240, 'Addicted Hardirun': 180,
  'Executioner Barthien': 240, 'Drakan Battalion Weapon Guruta': 360, 'Veteran Shujakan': 180, 'Visionary Karuka': 240,
  'Dark Shadow Vishwada': 360, 'Sharp Shylak': 360, 'Immortal Gartua': 720,
  'Kernon of the West': 30, 'Neikel of the East': 30, 'Rotten Kutar': 30, 'Blooming Korin': 60, 'Bodyguard Teegant': 90,
  'Kusan the Mad Gladiator': 120, 'Ritualist Garshim': 120, 'Bloodfang Pnyn': 180, 'Furious Saursus': 180, 'Scholar Aulla': 120,
  'Chaser Taulo': 120, 'Forest Warrior Aullamu': 120, 'Heretic Layla': 180, 'Black Tentacle Lawa': 120, 'Centurion Demiros': 120,
  'Divine Ansas': 360, 'Harvest Manager Moshav': 180, "Sentinel K'nash": 120, 'Researcher Setram': 180, 'Phantasm Kasia': 360,
  'Eternal Gartua': 360,
}
// Same name on both sides, different interval.
const FB_RESPAWN_MAP: Record<string, Record<string, number>> = { World_D_A: { 'Silent Dartan': 360, 'Soul Ruler Kashapa': 360, 'High Commander Lagta': 720 },
  World_L_A: { 'Silent Dartan': 180, 'Soul Ruler Kashapa': 360, 'High Commander Lagta': 360 } }
export const FB_WINDOW = 10 // min

// Field bosses of a map: named species with a known interval; location from mapdata's named markers.
export function fieldBosses(m: Any): Any[] {
  if (!m) return []
  if (m.fb) return m.fb
  const out: Any[] = []
  for (const [id, sp] of Object.entries<Any>(m.species)) {
    const mins = FB_RESPAWN_MAP[m.key]?.[sp.n] ?? FB_RESPAWN[sp.n]
    if (!mins || !sp.named) continue
    const pin = (m.named || []).find((n: Any) => n.n === sp.n)
    out.push({ id: +id, name: sp.n, key: sp.n, lv: sp.lv, mins, map: m.key, x: pin?.x, z: pin?.z, where: pin ? zoneAt(m, pin.x, pin.z) : '' })
  }
  return m.fb = out
}

// Abyss bosses (Chaotic Lower Reshanta): no respawn interval; status from the timer schedule (Watcher Kaira, Nahma,
// the Executors), else unknown. One entry per named marker (Nahma has three);
// `key` (state, bell) is unique, `name` is the species name. The Dimensional Cores are skipped.
export const ABYSS = 'Abyss_Reshanta_A'
export function abyssBosses(): Any[] {
  const m = G.md[ABYSS]
  if (!m) return []
  if (m.ab) return m.ab
  const nth: Record<string, number> = {}, out: Any[] = []
  ;(m.named || []).forEach((pin: Any) => {
    if (/Dimensional Core/.test(pin.n)) return
    const ids = Object.entries<Any>(m.species).filter(([, sp]) => sp.n === pin.n && (sp.named || sp.r === 'Hero')).map(([id]) => +id).sort((a, b) => a - b)
    if (!ids.length) return
    const k = nth[pin.n] = (nth[pin.n] || 0) + 1, dup = m.named.filter((x: Any) => x.n === pin.n).length > 1
    const id = ids[k - 1] ?? ids[0]
    out.push({ id, name: pin.n, key: dup ? pin.n + ' #' + k : pin.n, n: dup ? k : 0, lv: m.species[id].lv, mins: 0, map: ABYSS,
      x: pin.x, z: pin.z, where: zoneAt(m, pin.x, pin.z), abyss: true })
  })
  return m.ab = out
}
export const allBosses = () => [...Object.values<Any>(G.md).flatMap(fieldBosses), ...abyssBosses()]

/** Short card title: "Kaira", "Nahma 2"; the rest of the name ("Watcher", "the Spirit King") goes to the sub line. */
export function bossShort(b: Any): { short: string; rest: string } {
  const [head, ...tail] = b.name.split(','), w = head.trim().split(' ')
  return { short: w.pop() + (b.n ? ' ' + b.n : ''), rest: [w.join(' '), tail.join(',').trim()].filter(Boolean).join(' ') }
}

/** Timer event that schedules a boss (abyss bosses). */
export const bossEvent = (b: Any): Any | undefined =>
  G.timers?.find((ev: Any) => ev.kind === 'boss' && ev.maps?.[b.map]?.bosses?.some((x: Any) => x.n === b.name))
/** Next scheduled spawn of an abyss boss (or the current one within the spawn window). */
function scheduled(b: Any, now = Date.now()): { ev: Any; ms: number } | null {
  const ev = b.abyss && bossEvent(b)
  if (!ev) return null
  const ms = occurrences(ev, now - FB_WINDOW * 60e3, now + 8 * 864e5).sort((x, y) => x - y)[0]
  return ms ? { ev, ms } : null
}
/** "21:00", or "Sa 21:00" when more than 20 h away. */
export const whenTxt = (ms: number) => (ms - Date.now() > 20 * 3600e3 ? new Date(ms).toLocaleDateString(locale(), { weekday: 'short' }) + ' ' : '') + hm(ms)

export const fbState = (key: string): Any => (U.bossState ||= {})[key] ||= {}

/** "getötet": the respawn is estimated from this moment. */
export function killBoss(key: string) { const st = fbState(key); st.kill = Date.now(); saveUi(['bossState']); bump() }
export function toggleBossBell(key: string) { U.bossBells ||= {}; U.bossBells[key] = !U.bossBells[key]; saveUi(['bossBells']); bump() }

export type FbStatus = { k: 'wait' | 'due' | 'stale' | 'unknown'; t: string; due?: number; sched?: boolean }
const leftTxt = (m: number) => (m >= 1440 ? t('boss.leftD', { d: Math.floor(m / 1440), h: Math.floor(m % 1440 / 60) })
  : m >= 60 ? t('boss.leftH', { h: Math.floor(m / 60), m: m % 60 }) : t('boss.left', { m: m % 60 }))

export function fbStatus(b: Any): FbStatus {
  const st = fbState(b.key), now = Date.now()
  if (!b.mins) { // abyss: timer schedule or unknown
    const sc = scheduled(b, now)
    if (!sc) return { k: 'unknown', t: t('boss.unknown') }
    if (sc.ms <= now) return { k: 'due', t: t('boss.dueSched', { at: hm(sc.ms) }), due: sc.ms, sched: true }
    return { k: 'wait', t: t('boss.waitSched', { at: whenTxt(sc.ms), left: leftTxt(Math.round((sc.ms - now) / 60e3)) }), due: sc.ms, sched: true }
  }
  if (!st.kill) return { k: 'unknown', t: t('boss.unknown') }
  const due = st.kill + b.mins * 60e3
  if (now < due) return { k: 'wait', t: t('boss.wait', { at: hm(due), left: leftTxt(Math.round((due - now) / 60e3)) }), due }
  if (now < due + FB_WINDOW * 60e3) return { k: 'due', t: t('boss.due', { at: hm(due), to: hm(due + FB_WINDOW * 60e3) }), due }
  return { k: 'stale', t: t('boss.stale', { at: hm(due) }), due }
}

// Drop summary per boss NpcData id: [{n: group, g: grade, il: [min, max], p: chance}] (from aion2maps drops + items).
export function loadDrops() {
  fetch('bossdrops.json').then(r => r.json()).then(d => { G.drops = d; bump() }).catch(() => {})
}

export function announceBosses() {
  const ld = lead() * 60e3, now = Date.now()
  V.announced ||= new Set()
  for (const b of allBosses()) {
    if (!U.bossBells?.[b.key]) continue
    const st = fbState(b.key), sc = !b.mins ? scheduled(b, now) : null
    // A scheduled time whose timer occurrence is announced anyway is not announced twice.
    if (sc && occOn(sc.ev, sc.ms)) continue
    const due = sc ? sc.ms : st.kill && b.mins ? st.kill + b.mins * 60e3 : 0
    if (!due) continue
    const key = 'fb|' + b.key + '|' + due
    if (now < due) remind('boss', key, due, t('boss.spawns', { boss: b.name.split(' ').pop() }), t('boss.sayStart', { boss: b.name.split(' ').pop() }))
    if (now < due - ld || now > due + FB_WINDOW * 60e3 || V.announced.has(key)) continue
    V.announced.add(key)
    host({ type: 'announce', key, title: b.name, sub: t('boss.sub', { at: hm(due) }) + (b.where ? ' · ' + b.where : ''), at: due, sound: U.soundTimer !== false })
  }
}
