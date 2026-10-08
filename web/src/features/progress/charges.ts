// Limited charges that refill over time and stop at a cap: whatever refills above the cap is lost, so the
// warning is about the time until an owner is full. The player enters a value once (or corrects it), the app
// projects it from that reading.
import { U, saveUi, bump } from '@/core/state'
import { lastReset, nextReset, type Per } from './checklist'

export type ChargeDef = {
  id: string; per: Per; tier: 1 | 2 | 3
  cap: () => number
  /** Refill per tick; `every` = ms between ticks, or 'day' = at every daily reset. */
  regen: number; every: number | 'day'
  /** Step of the − / + buttons (Odyle: one cube costs 40). */
  step: number
}

export const CHARGES: ChargeDef[] = [
  { id: 'odyle', per: 'char', tier: 1, cap: () => (U.member ? 840 : 560), regen: 15, every: 3 * 3600e3, step: 40 },
  { id: 'nightmare', per: 'char', tier: 1, cap: () => 14, regen: 2, every: 'day', step: 1 },
  { id: 'shugo', per: 'server', tier: 2, cap: () => (U.member ? 21 : 12), regen: 3, every: 'day', step: 1 },
  { id: 'invasion', per: 'server', tier: 3, cap: () => 7, regen: 1, every: 'day', step: 1 },
]

type Reading = { v: number; at: number }
const key = (d: ChargeDef, char?: string) => d.id + '|' + (d.per === 'server' ? 'srv' : char || '')
const reading = (d: ChargeDef, char?: string): Reading | undefined => (U.charges ||= {})[key(d, char)]

/** Daily resets passed in (from, to]. */
function resetsBetween(from: number, to: number) {
  let n = 0
  for (let r = lastReset('d', new Date(to)).getTime(); r > from; r -= 864e5) n++
  return n
}

/** Projected value now (null without a reading). */
export function chargeNow(d: ChargeDef, char?: string, now = Date.now()): number | null {
  const r = reading(d, char)
  if (!r) return null
  const ticks = d.every === 'day' ? resetsBetween(r.at, now) : Math.floor((now - r.at) / d.every)
  return Math.min(d.cap(), r.v + ticks * d.regen)
}

/** Milliseconds until full (0 = full, null without a reading). */
export function chargeFullIn(d: ChargeDef, char?: string, now = Date.now()): number | null {
  const r = reading(d, char), v = chargeNow(d, char, now)
  if (!r || v == null) return null
  const ticks = Math.ceil((d.cap() - v) / d.regen)
  if (ticks <= 0) return 0
  if (d.every === 'day') return nextReset('d').getTime() - now + (ticks - 1) * 864e5
  return ticks * d.every - (now - r.at) % d.every
}

export type Light = 'red' | 'yellow' | 'green' | 'none'
/** Red: full or full within 12 h (or by the next reset) – refill is being / about to be lost. Yellow: within 36 h. */
export function chargeLight(d: ChargeDef, char?: string, now = Date.now()): Light {
  const ms = chargeFullIn(d, char, now)
  if (ms == null) return 'none'
  const red = d.every === 'day' ? Math.max(12 * 3600e3, nextReset('d').getTime() - now) : 12 * 3600e3
  return ms <= red ? 'red' : ms <= red + 24 * 3600e3 ? 'yellow' : 'green'
}

export function setCharge(d: ChargeDef, v: number, char?: string) {
  (U.charges ||= {})[key(d, char)] = { v: Math.max(0, Math.min(d.cap(), Math.round(v))), at: Date.now() }
  saveUi(['charges']); bump()
}
/** −/+ one step from the projected value (or from 0 without a reading). */
export const stepCharge = (d: ChargeDef, dir: 1 | -1, char?: string) => setCharge(d, (chargeNow(d, char) ?? 0) + dir * d.step, char)

export const chargesOf = (per: Per) => CHARGES.filter(d => d.per === per)
