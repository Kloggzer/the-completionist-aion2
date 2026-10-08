// Unit tests for pure logic: checklist resets, event occurrences, farm spot ranking.
import { describe, expect, it } from 'vitest'
import { U, V, setU, DEF_UI, NEED } from '@/core/state'
import { addChar, lastReset, nextReset, renameChar } from '@/features/progress/checklist'
import { occurrences } from '@/features/events/events'
import { computeSpots, R } from '@/features/pets/logic'

setU(structuredClone(DEF_UI))

describe('checklist resets (07:00 UTC, weekly on Wednesday)', () => {
  it('daily reset is today 07:00 UTC after 07:00, yesterday before', () => {
    expect(lastReset('d', new Date('2026-10-07T08:00:00Z')).toISOString()).toBe('2026-10-07T07:00:00.000Z')
    expect(lastReset('d', new Date('2026-10-07T06:59:00Z')).toISOString()).toBe('2026-10-06T07:00:00.000Z')
  })
  it('weekly reset is the last Wednesday 07:00 UTC', () => {
    expect(lastReset('w', new Date('2026-10-07T08:00:00Z')).toISOString()).toBe('2026-10-07T07:00:00.000Z') // Wednesday
    expect(lastReset('w', new Date('2026-10-07T06:00:00Z')).toISOString()).toBe('2026-09-30T07:00:00.000Z')
    expect(lastReset('w', new Date('2026-10-12T12:00:00Z')).toISOString()).toBe('2026-10-07T07:00:00.000Z') // Monday
  })
  it('next reset is one period after the last one', () => {
    expect(nextReset('d').getTime() - lastReset('d').getTime()).toBe(864e5)
    expect(nextReset('w').getTime() - lastReset('w').getTime()).toBe(7 * 864e5)
  })
})

describe('event occurrences', () => {
  const ev = { tz: 'Europe/Berlin', days: [3], times: [20 * 60] } // Wednesdays 20:00 Berlin
  it('converts zoned times (CEST = UTC+2)', () => {
    const from = Date.parse('2026-10-05T00:00:00Z')
    expect(occurrences(ev, from, from + 7 * 864e5).map(ms => new Date(ms).toISOString())).toEqual(['2026-10-07T18:00:00.000Z'])
  })
  it('handles winter time (CET = UTC+1)', () => {
    const from = Date.parse('2026-11-02T00:00:00Z')
    expect(occurrences(ev, from, from + 7 * 864e5).map(ms => new Date(ms).toISOString())).toEqual(['2026-11-04T19:00:00.000Z'])
  })
})

describe('farm spot ranking', () => {
  // Synthetic map: species 1 (pet A, not unlocked) at cluster west, species 2 (pet B, Lv2) at cluster east.
  function map(ptsA: number, ptsB: number) {
    const pts: number[][] = []
    for (let i = 0; i < ptsA; i++) pts.push([1, -1000 + i, 0])
    for (let i = 0; i < ptsB; i++) pts.push([2, 1000 + i, 0])
    const byId = new Map<number, number[]>()
    pts.forEach(([id], i) => byId.set(id, [...(byId.get(id) || []), i]))
    return { xs: pts.map(p => p[1]), zs: pts.map(p => p[2]), byId, zones: [], named: [] }
  }
  const tg = (id: number, lv: number, souls: number) => ({ p: { id, n: 'P' + id }, lv, souls, need: NEED[lv], left: NEED[lv] - souls, done: false, prio: (3 - lv) * 100, mobs: [{ id }] })

  it('unlocks weigh double: 10 unlock spawns beat 15 level spawns', () => {
    const s = computeSpots(map(10, 15), [tg(1, 0, 0), tg(2, 2, 0)])
    expect(s[0].x).toBeLessThan(0) // west cluster (pet 1, unlock) first
    expect(s[0].rel).toBe(1)
  })
  it('a nearly finished pet only counts missing souls + 4', () => {
    // pet 2 needs one more soul: 30 spawns count as 5; pet 1 (Lv2, needs 75) 8 spawns count 8
    const s = computeSpots(map(8, 30), [tg(1, 2, 0), tg(2, 2, 74)])
    expect(s[0].x).toBeLessThan(0)
  })
  it('groups spawns within R into one spot and ranks top 8 at most', () => {
    const s = computeSpots(map(5, 5), [tg(1, 0, 0), tg(2, 0, 0)])
    expect(s.length).toBe(2)
    expect(R).toBe(75)
  })
  it('uses the current filters only through the targets it is given', () => {
    expect(computeSpots(map(5, 5), [])).toEqual([])
    expect(U.lvMin).toBe(1); expect(V.multi.size).toBe(0)
  })
})

describe('charges (projected from one reading)', async () => {
  const { CHARGES, chargeNow, chargeFullIn, chargeLight, setCharge } = await import('@/features/progress/charges')
  const odyle = CHARGES.find(d => d.id === 'odyle')!, nightmare = CHARGES.find(d => d.id === 'nightmare')!
  it('odyle: +15 every 3 h, capped at 560 (840 with membership)', () => {
    U.member = false
    setCharge(odyle, 500, 'A')
    const at = U.charges['odyle|A'].at
    expect(chargeNow(odyle, 'A', at + 2.9 * 3600e3)).toBe(500)
    expect(chargeNow(odyle, 'A', at + 3 * 3600e3)).toBe(515)
    expect(chargeNow(odyle, 'A', at + 30 * 3600e3)).toBe(560)
    U.member = true
    expect(chargeNow(odyle, 'A', at + 30 * 3600e3)).toBe(650)
    U.member = false
  })
  it('odyle: light turns red within 12 h of the cap, yellow within 36 h', () => {
    setCharge(odyle, 530, 'B')                       // 2 ticks = 6 h to full
    expect(chargeLight(odyle, 'B')).toBe('red')
    setCharge(odyle, 380, 'B')                       // 12 ticks = 36 h
    expect(chargeLight(odyle, 'B')).toBe('yellow')
    setCharge(odyle, 100, 'B')
    expect(chargeLight(odyle, 'B')).toBe('green')
    expect(chargeFullIn(odyle, 'B')).toBeGreaterThan(36 * 3600e3)
  })
  it('nightmare: +2 per daily reset, banks up to 14', () => {
    setCharge(nightmare, 4, 'C')
    const at = U.charges['nightmare|C'].at
    expect(chargeNow(nightmare, 'C', at + 1000)).toBe(4)
    expect(chargeNow(nightmare, 'C', at + 3 * 864e5)).toBe(10)
    expect(chargeNow(nightmare, 'C', at + 10 * 864e5)).toBe(14)
    setCharge(nightmare, 14, 'C')
    expect(chargeLight(nightmare, 'C')).toBe('red')
  })
})

describe('timer bells: occurrence override, then series, then kind default', async () => {
  const { G } = await import('@/core/state')
  const ev = await import('@/features/events/events')
  const boss = { id: 'b', kind: 'boss', name: 'Watcher Kaira', times: [60], days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }
  const shugo = { id: 's', kind: 'field', name: 'Shugo Festival', times: Array.from({ length: 24 }, (_, h) => h * 60), days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC' }
  const reset = () => { G.timers = [boss, shugo]; U.timerOn = {}; U.timerOnce = {} }
  const soon = Date.now() + 3600e3
  it('kind default: bosses on, field events off', () => {
    reset()
    expect(ev.occOn(boss, soon)).toBe(true)
    expect(ev.occOn(shugo, soon)).toBe(false)
    expect(ev.hourly(shugo)).toBe(true)
    expect(ev.hourly(boss)).toBe(false)
  })
  it('series bell overrides the kind default, the occurrence bell overrides the series', () => {
    reset()
    ev.toggleTimer(shugo)
    expect(ev.occOn(shugo, soon)).toBe(true)
    ev.toggleOnce(shugo, soon)                       // mute just this one
    expect(ev.onceOf(shugo, soon)).toBe(false)
    expect(ev.occOn(shugo, soon)).toBe(false)
    expect(ev.occOn(shugo, soon + 3600e3)).toBe(true)
    ev.toggleOnce(boss, soon); ev.toggleOnce(boss, soon) // back to the series: no override left
    expect(ev.onceOf(boss, soon)).toBe(undefined)
  })
  it('once on while the series is off; overrides equal to the series or in the past are dropped', () => {
    reset()
    ev.toggleOnce(shugo, soon)
    expect(ev.occOn(shugo, soon)).toBe(true)
    expect(ev.occOn(shugo, soon + 3600e3)).toBe(false)
    ev.toggleTimer(shugo)                            // series on: the "on once" override is redundant now
    expect(ev.onceOf(shugo, soon)).toBe(undefined)
    U.timerOnce = { ['s|' + (Date.now() - 2 * 3600e3)]: true }
    ev.cleanOnce()
    expect(Object.keys(U.timerOnce)).toEqual([])
  })
  it('kind toggle switches every series of the kind', () => {
    reset()
    expect(ev.kindOn('boss')).toBe(true)
    ev.toggleKind('boss')
    expect(ev.kindOn('boss')).toBe(false)
    expect(ev.occOn(boss, soon)).toBe(false)
    ev.toggleKind('field')
    expect(ev.timerOn(shugo)).toBe(true)
  })
  it('announcer follows the occurrence bell', () => {
    reset()
    const posted: { type: string; key?: string }[] = []
    ;(globalThis as Record<string, unknown>).chrome = { webview: { postMessage: (m: { type: string }) => posted.push(m) } }
    const next = ev.occurrences(shugo, Date.now() + 60e3, Date.now() + 3600e3 + 60e3)[0]
    U.timerLead = 60
    ev.announceTick()
    expect(posted.some(m => m.key?.startsWith('s|'))).toBe(false) // series off by default
    ev.toggleOnce(shugo, next)
    ev.announceTick()
    expect(posted.some(m => m.key === 's|' + next)).toBe(true)
    delete (globalThis as Record<string, unknown>).chrome
  })
})

describe('characters by hand', () => {
  it('rename moves the list and the charge readings', () => {
    U.checklist = { srv: {}, chars: { Alt: { supplyEmergency: { c: 1, at: Date.now() } } } }
    U.charges = { 'odyle|Alt': { v: 100, at: 1 }, 'shugo|srv': { v: 3, at: 1 } }
    expect(renameChar('Alt', 'Neu')).toBe(true)
    expect(U.checklist.chars.Alt).toBeUndefined()
    expect(U.checklist.chars.Neu.supplyEmergency.c).toBe(1)
    expect(U.charges['odyle|Neu'].v).toBe(100)
    expect(U.charges['shugo|srv'].v).toBe(3)
  })
  it('refuses empty and duplicate names', () => {
    expect(addChar('  ')).toBe(false)
    expect(addChar('Neu')).toBe(false)
    expect(renameChar('Neu', 'Standard')).toBe(false)
  })
  it('counts are entered by hand and drop back to 0 after the reset', async () => {
    const { checkCount, checkSet } = await import('@/features/progress/checklist')
    U.checklist = { srv: { dailyDungeons: { c: 9, at: lastReset('w').getTime() - 1000 } }, chars: {} }
    expect(checkCount('dailyDungeons', 'server', 'w')).toBe(0) // from the previous week
    checkSet('dailyDungeons', 'server', 'w', 14, 20)
    expect(checkCount('dailyDungeons', 'server', 'w')).toBe(14) // capped at the maximum
  })
})
