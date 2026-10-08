// Daily / weekly checklist.
// Per character; items the game limits per server/account are shared by all characters (per: 'server').
// Everything is counted by hand. A count is valid until the next reset: stored with the time of the last change.
import { S, U, saveUi, bump, type Any } from '@/core/state'
import { t } from '@/core/i18n'
import { host } from '@/core/host'
import { Castle, ClipboardList, Crown, DoorOpen, FlaskConical, FlaskRound, Gem, Mountain, Package, PackageOpen, ScrollText, Store, Swords, type LucideIcon } from 'lucide-react'

export type Kind = 'd' | 'w'
export type Per = 'server' | 'char'
/** [id, max, per] – name and tip come from i18n ('progress.item.<id>', 'progress.tip.<id>'). */
export type CheckItem = [string, number, Per]

// Global client values (aion2maps datamine, Oct 2026). Sorted by priority tier within each period.
// Charge-based limits (Nightmare attempts, Shugo keys, Odyle energy, …) live in charges.ts.
export const CHECK: [Kind, CheckItem[]][] = [
  ['d', [
    ['dutyMissions', 5, 'server'],
    ['supplyEmergency', 1, 'char'],
  ]],
  ['w', [
    ['ludra', 1, 'char'],               // one rewarded final-boss kill
    ['dutyCommands', 32, 'server'],
    ['dailyDungeons', 14, 'server'],
    ['odyleCraft', 4, 'char'],
    ['ascensionTrial', 3, 'char'],
    ['battlefieldWins', 3, 'char'],
    ['odyleCraftServer', 16, 'server'], // shared Substance Morph pool on top of the 4 per character
    ['windBreezeShop', 1, 'server'],    // Wind Breeze Merchant (membership)
    ['supplyWeekly', 1, 'char'],
    ['abyssShop', 1, 'char'],
  ]],
]
/** Priority: 1 = must do, 2 = should do, 3 = optional. */
export const TIER: Record<string, 1 | 2 | 3> = {
  dutyMissions: 1, ludra: 1, dutyCommands: 1, dailyDungeons: 1, odyleCraft: 1, ascensionTrial: 1,
  supplyEmergency: 2, battlefieldWins: 2, odyleCraftServer: 2, windBreezeShop: 2, supplyWeekly: 2, abyssShop: 3,
}
/** Icon per entry (tile icon column, overview rows). */
export const CHECK_ICON: Record<string, LucideIcon> = {
  dutyMissions: ClipboardList, supplyEmergency: Package, ludra: Crown, dutyCommands: ScrollText, dailyDungeons: DoorOpen, odyleCraft: FlaskConical, odyleCraftServer: FlaskRound,
  ascensionTrial: Mountain, battlefieldWins: Swords, windBreezeShop: Store, supplyWeekly: PackageOpen, abyssShop: Gem,
}
export const CHECK_ICON_DEFAULT = Castle
/** Colour per priority tier: must = gold, should = cyan, optional = dim. */
export const TIER_TONE = { 1: 'gold', 2: 'cyan', 3: 'dim' } as const
/** Weekly items worth doing on the last day of the lockout (higher item level by then). */
export const LAST_DAY = new Set(['ascensionTrial'])

// Aion 2 Global/EU resets: daily 07:00 UTC, weekly Wednesday 07:00 UTC (game8, aion2timers, metabot).
export function lastReset(kind: Kind, now = new Date()) {
  const r = new Date(now)
  r.setUTCHours(7, 0, 0, 0)
  if (kind === 'd') { if (r > now) r.setUTCDate(r.getUTCDate() - 1); return r }
  r.setUTCDate(r.getUTCDate() - ((r.getUTCDay() - 3 + 7) % 7))
  if (r > now) r.setUTCDate(r.getUTCDate() - 7)
  return r
}
export const nextReset = (kind: Kind) => { const r = lastReset(kind); r.setUTCDate(r.getUTCDate() + (kind === 'd' ? 1 : 7)); return r }
/** Time until a reset as "2 T 5 h" / "5 h 12 min". */
export const resetIn = (d: Date) => {
  const m = Math.max(0, Math.round((d.getTime() - Date.now()) / 60000))
  return m >= 1440 ? t('progress.inDays', { d: Math.floor(m / 1440), h: Math.floor(m % 1440 / 60) }) : t('progress.inHours', { h: Math.floor(m / 60), m: m % 60 })
}

export const charKey = () => S.state.charName || 'Standard'

// `char` = whose list (default: the logged-in character). Server items ignore it.
export function checkSlot(_id: string, per: Per, char = charKey()): Any {
  U.checklist ||= { srv: {}, chars: {} }
  return per === 'server' ? U.checklist.srv : (U.checklist.chars[char] ||= {})
}
/** Count of an entry in the current period (0 after the reset). */
export function checkCount(id: string, per: Per, kind: Kind, char?: string): number {
  // Read without creating the slot: a stale render of a just renamed character must not bring its old name back.
  const e = (per === 'server' ? U.checklist?.srv : U.checklist?.chars?.[char ?? charKey()])?.[id]
  return e && e.at >= lastReset(kind).getTime() ? e.c : 0
}
export function checkSet(id: string, per: Per, _kind: Kind, max: number, c: number, char?: string) {
  checkSlot(id, per, char)[id] = { c: Math.max(0, Math.min(max, c)), at: Date.now() }
  saveUi(['checklist']); bump()
}

/** All items of one owner ('server' or a character), with their period. */
export const itemsOf = (per: Per) => CHECK.flatMap(([kind, items]) => items.filter(i => i[2] === per).map(i => ({ kind, id: i[0], max: i[1], per })))

/** Progress 0..1 of an owner: mean of the item fractions (a half-done 32-quest weekly counts half). */
export function progressOf(per: Per, char?: string, kind?: Kind) {
  const items = itemsOf(per).filter(i => !kind || i.kind === kind)
  if (!items.length) return 1
  return items.reduce((s, i) => s + Math.min(1, checkCount(i.id, per, i.kind, char) / i.max), 0) / items.length
}

/** Set every item of an owner and period to done (or back to 0). */
export function setAll(per: Per, kind: Kind, done: boolean, char?: string) {
  for (const i of itemsOf(per)) if (i.kind === kind) checkSlot(i.id, per, char)[i.id] = { c: done ? i.max : 0, at: Date.now() }
  saveUi(['checklist']); bump()
}

/** Known characters: everyone with a list, plus the active one; active first, then by name. */
export function characters(): string[] {
  U.checklist ||= { srv: {}, chars: {} }
  const cur = S.state.charName
  if (cur && !U.checklist.chars[cur]) { U.checklist.chars[cur] = {}; saveUi(['checklist']) }
  return Object.keys(U.checklist.chars).filter(c => c !== 'Standard' || Object.keys(U.checklist.chars[c]).length)
    .sort((a, b) => (b === cur ? 1 : 0) - (a === cur ? 1 : 0) || a.localeCompare(b))
}

/** Forget a character's list (e.g. a deleted character). */
export function removeChar(char: string) { delete U.checklist?.chars?.[char]; delete U.pnc?.[char]; saveUi(['checklist', 'pnc']); bump() }

// ---------------------------------------------------------------- characters

/** Make a character the active one (the host stores it as the character name). */
export function selectChar(name: string) {
  S.state.charName = name
  host({ type: 'setChar', name })
  bump()
}

/** Add a character and make it active. The very first one takes over the lists kept under "Standard" so far. */
export function addChar(name: string): boolean {
  name = name.trim()
  U.checklist ||= { srv: {}, chars: {} }
  if (!name || name === 'Standard' || U.checklist.chars[name]) return false
  if (!S.state.charName && U.checklist.chars.Standard) return renameChar('Standard', name)
  U.checklist.chars[name] = {}
  saveUi(['checklist'])
  selectChar(name)
  return true
}

/** Rename a character: its list and charge readings move along; the active one stays active. */
export function renameChar(from: string, to: string): boolean {
  to = to.trim()
  U.checklist ||= { srv: {}, chars: {} }
  if (!to || to === 'Standard' || (U.checklist.chars[to] && to !== from)) return false
  if (to === from) return true
  U.checklist.chars[to] = U.checklist.chars[from] || {}
  delete U.checklist.chars[from]
  const ch = U.charges || {}
  for (const k of Object.keys(ch)) if (k.endsWith('|' + from)) { ch[k.slice(0, -from.length) + to] = ch[k]; delete ch[k] }
  if (U.pnc?.[from]) { U.pnc[to] = U.pnc[from]; delete U.pnc[from] } // the website link moves along
  saveUi(['checklist', 'charges', 'pnc'])
  if (S.state.charName === from || (from === 'Standard' && !S.state.charName)) selectChar(to)
  else bump()
  return true
}
