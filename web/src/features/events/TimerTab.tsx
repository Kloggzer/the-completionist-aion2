// "Timer" tab as a week calendar: day columns (2 at overlay width, up to 7 on wide windows) on a 00–24 h axis with the
// events as blocks at their time, coloured by kind. Events that repeat every hour (Shugo festival, invasion) would
// drown the calendar: they are one row each above it (series bell), in the calendar only as small ticks.
// Clicking a block opens a small popover with both bells: this occurrence only, or the whole series.
import { useEffect, useState } from 'react'
import { Bell, BellDot, BellOff, ChevronLeft, ChevronRight, Clock, RefreshCw, Skull, Swords, Tent, Tornado, type LucideIcon } from 'lucide-react'
import { G, U, V, saveUi, bump, useApp, type Any } from '@/core/state'
import { hm, locale, t } from '@/core/i18n'
import { cn } from '@/lib/utils'
import { BOX, BarInfo, BarRight, BellBtn, CHIP, CHIP_ON, Empty, Page, ROW, ROW_ICON, ROWS, Sect, type BoxTone } from '@/components/kit'
import { TIMER_KINDS, hourly, kindOn, lead, occOn, occurrences, onceOf, timerName, timerOn, timerWhere, toggleKind, toggleOnce, toggleTimer } from './events'

export const KIND_ICON: Record<string, LucideIcon> = { boss: Skull, rift: Tornado, field: Tent, abyss: Swords, reset: RefreshCw }
export const KIND_TONE: Record<string, BoxTone> = { boss: 'red', rift: 'purple', abyss: 'gold', field: 'cyan', reset: 'dim' }
const TXT: Record<string, string> = { red: 'text-red', purple: 'text-purple', gold: 'text-gold', cyan: 'text-cyan', dim: 'text-dim', green: 'text-green' }
const DOT: Record<string, string> = { red: 'bg-red', purple: 'bg-purple', gold: 'bg-gold', cyan: 'bg-cyan', dim: 'bg-dim', green: 'bg-green' }
const H = 30, BLOCK = 20, DAYS = 7 // px per hour, block height, rendered days
// Day columns shown per page width (the first two always).
const SHOW = ['flex', 'flex', 'hidden @min-[560px]:flex', 'hidden @min-[800px]:flex', 'hidden @min-[1040px]:flex', 'hidden @min-[1280px]:flex', 'hidden @min-[1500px]:flex']

/** Short block label: boss names by their last word ("Kaira", "Tamasa · Argo · Kaira"). */
const shortName = (ev: Any) => (ev.kind === 'boss' ? ev.name.split(', ').map((n: string) => n.split(' ').pop()).join(' · ') : timerName(ev))
const leftTxt = (ms: number, now: number) => {
  const m = Math.round((ms - now) / 60000)
  return m <= 0 ? t('timer.running') : m < 60 ? t('timer.inMin', { m }) : m < 1440 ? t('timer.inHMin', { h: Math.floor(m / 60), m: m % 60 }) : ''
}

type Occ = { ev: Any; ms: number; top: number; lane: number; lanes: number }

/** Blocks of one day with side-by-side lanes where they overlap. */
function dayBlocks(from: number, to: number): Occ[] {
  const out: Occ[] = []
  for (const ev of G.timers) {
    if (ev.kind === 'reset') continue
    for (const ms of occurrences(ev, from, to))
      if (hourly(ev) ? onceOf(ev, ms) === true : U.timerAll || occOn(ev, ms)) out.push({ ev, ms, top: (ms - from) / 3600e3 * H, lane: 0, lanes: 1 })
  }
  out.sort((a, b) => a.ms - b.ms || a.ev.id.localeCompare(b.ev.id))
  let cluster: Occ[] = [], ends: number[] = [], end = -1
  const close = () => { for (const o of cluster) o.lanes = ends.length; cluster = []; ends = [] }
  for (const o of out) {
    if (o.top >= end) close()
    let lane = ends.findIndex(e => e <= o.top)
    if (lane < 0) { lane = ends.length; ends.push(0) }
    ends[lane] = o.top + BLOCK; o.lane = lane; cluster.push(o); end = Math.max(end, o.top + BLOCK)
  }
  close()
  return out
}

type Pop = { ev: Any; ms: number; x: number; y: number; up: boolean }

function Block({ o, now, sel, onOpen }: { o: Occ; now: number; sel: boolean; onOpen: (o: Occ, r: DOMRect) => void }) {
  const { ev, ms } = o, on = occOn(ev, ms), once = onceOf(ev, ms), tone = KIND_TONE[ev.kind] || 'dim', I = KIND_ICON[ev.kind] || Clock
  const BellI = once === true ? BellDot : once === false ? BellOff : on ? Bell : null
  const past = ms + 10 * 60e3 < now, where = timerWhere(ev)
  const state = once === true ? t('timer.st.once') : once === false ? t('timer.st.muted') : on ? t('timer.st.on') : t('timer.st.off')
  return (
    <button data-occ={ev.id + '|' + ms} data-tip={`${hm(ms)} ${timerName(ev)}${where ? ' · ' + where : ''}\n${state}`}
      onClick={e => onOpen(o, e.currentTarget.getBoundingClientRect())}
      style={{ top: o.top, height: BLOCK, left: `calc(9px + (100% - 11px) * ${o.lane} / ${o.lanes})`, width: `calc((100% - 11px) / ${o.lanes} - 2px)` }}
      className={cn('absolute z-[1] flex min-w-0 items-center gap-1 overflow-hidden rounded-sm border px-1 text-left text-[11px] leading-none transition-[filter] hover:brightness-125',
        BOX[tone], !on && 'border-dashed opacity-50', past && 'opacity-40', sel && 'z-[2] ring-1 ring-foreground')}>
      <I className="size-3 flex-none" strokeWidth={2} />
      <b className="flex-none font-semibold text-foreground tabular-nums">{hm(ms)}</b>
      <span className="min-w-0 flex-1 truncate text-foreground/85">{shortName(ev)}</span>
      {BellI && <BellI className="size-3 flex-none" />}
    </button>
  )
}

/** Bell popover of one occurrence: this one only / every occurrence of the event. */
function BellPop({ p, onClose }: { p: Pop; onClose: () => void }) {
  const { ev, ms } = p, once = onceOf(ev, ms), on = occOn(ev, ms), series = timerOn(ev), I = KIND_ICON[ev.kind] || Clock
  const where = timerWhere(ev), day = new Date(ms).toLocaleDateString(locale(), { weekday: 'short', day: '2-digit', month: '2-digit' })
  const W = 240, left = Math.max(8, Math.min(p.x, innerWidth - W - 8))
  const row = (active: boolean, label: string, sub: string, tip: string, click: () => void, dot?: boolean) => (
    <button onClick={click} data-tip={tip}
      className={cn('flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition-colors hover:bg-white/5', active ? 'border-gold/50 bg-gold/10' : 'border-border')}>
      {active ? (dot ? <BellDot className="size-4 flex-none text-gold" /> : <Bell className="size-4 flex-none text-gold" />) : <BellOff className="size-4 flex-none text-dim" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
      <b className={cn('flex-none text-[11px]', active ? 'text-gold' : 'text-dim')}>{active ? t('timer.on') : t('timer.off')}</b>
    </button>
  )
  return (
    <div data-calpop className="fixed z-40 flex flex-col gap-1 rounded-sm border bg-popover p-1.5 shadow-lg shadow-black/50"
      style={{ left, width: W, ...(p.up ? { bottom: innerHeight - p.y + 4 } : { top: p.y + 4 }) }}>
      <div className="flex items-center gap-1.5 px-0.5 pb-0.5">
        <I className={cn('size-3.5 flex-none', TXT[KIND_TONE[ev.kind] || 'dim'])} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{timerName(ev)}</span>
        <button onClick={onClose} className="rounded-sm px-1 text-[11px] text-muted-foreground hover:bg-white/10 hover:text-foreground">✕</button>
      </div>
      <div className="truncate px-0.5 pb-1 text-[11px] text-muted-foreground tabular-nums">{day} · {hm(ms)}{where ? ' · ' + where : ''}</div>
      {row(on, t('timer.once'), once === undefined ? t('timer.onceFollows') : once ? t('timer.onceOn') : t('timer.onceMuted'), t('timer.onceTip'), () => toggleOnce(ev, ms), once === true)}
      {row(series, t('timer.series', { name: shortName(ev) }), t('timer.seriesSub', { n: ev.times.length }), t('timer.seriesTip'), () => toggleTimer(ev))}
    </div>
  )
}

function DayCol({ k, from, now, pop, onOpen }: { k: number; from: number; now: number; pop: Pop | null; onOpen: (o: Occ, r: DOMRect) => void }) {
  const d = new Date(from), to = new Date(from); to.setDate(to.getDate() + 1)
  const today = now >= from && now < to.getTime(), blocks = dayBlocks(from, to.getTime())
  // Daily and weekly reset fall on the same time: one line, one label.
  const resetAt = new Map<number, string[]>()
  for (const ev of G.timers.filter((e: Any) => e.kind === 'reset')) for (const ms of occurrences(ev, from, to.getTime())) resetAt.set(ms, [...(resetAt.get(ms) || []), timerName(ev)])
  const ticks = G.timers.filter(hourly).flatMap((ev: Any) => occurrences(ev, from, to.getTime()).filter(ms => occOn(ev, ms)).map(ms => ({ ev, ms })))
  return (
    <div data-day={k} className={cn('min-w-0 flex-1 flex-col border-l', SHOW[k])}>
      <div className={cn('sticky top-(--bar-h) z-[3] flex h-7 items-center justify-center gap-1 border-b bg-card text-[11.5px] font-semibold tabular-nums', today ? 'text-gold' : 'text-muted-foreground')}>
        {today ? t('timer.today') : d.toLocaleDateString(locale(), { weekday: 'short' })}
        <span className="font-normal text-dim">{d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })}</span>
      </div>
      <div className="relative" style={{ height: 24 * H, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${H - 1}px, rgb(255 255 255 / 0.05) ${H - 1}px ${H}px)` }}>
        {today && <>
          <i className="absolute inset-x-0 top-0 bg-black/20" style={{ height: (now - from) / 3600e3 * H }} />
          <i data-now className="absolute inset-x-0 z-[2] h-px bg-red shadow-[0_0_4px_var(--red)]" style={{ top: (now - from) / 3600e3 * H }}>
            <i className="absolute -top-[3px] -left-[3px] size-[7px] rounded-full bg-red" />
          </i>
        </>}
        {[...resetAt].map(([ms, names]) => (
          <i key={ms} data-tip={`${hm(ms)} ${names.join(' · ')}`} className="absolute inset-x-0 border-t border-dashed border-dim/70" style={{ top: (ms - from) / 3600e3 * H }}>
            <span className="absolute right-1 -top-[13px] max-w-[calc(100%-12px)] truncate text-[9.5px] text-dim not-italic">{names.join(' · ')}</span>
          </i>
        ))}
        {ticks.map(({ ev, ms }: Any) => (
          <i key={ev.id + ms} className={cn('absolute left-[2px] h-[3px] w-[5px] rounded-[1px] opacity-70', DOT[KIND_TONE[ev.kind] || 'dim'])} style={{ top: (ms - from) / 3600e3 * H - 1 }} />
        ))}
        {blocks.map(o => <Block key={o.ev.id + o.ms} o={o} now={now} sel={!!pop && pop.ev === o.ev && pop.ms === o.ms} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

/** Hourly events: one row each (series bell, next time); in the calendar only as ticks. */
function HourlyRows({ now }: { now: number }) {
  const evs = G.timers.filter((ev: Any) => ev.kind !== 'reset' && hourly(ev))
  if (!evs.length) return null
  return <>
    <Sect sub={'· ' + t('timer.hourlySub')}>{t('timer.hourly')}</Sect>
    <div className={cn(ROWS, 'grid @min-[900px]:grid-cols-2 @min-[900px]:gap-x-4')}>
      {evs.map((ev: Any) => {
        const on = timerOn(ev), next = occurrences(ev, now - 5 * 60e3, now + 3 * 3600e3).sort((a, b) => a - b)[0], I = KIND_ICON[ev.kind] || Clock
        const mins = [...new Set(ev.times.map((m: number) => ':' + String(m % 60).padStart(2, '0')))].join(' ')
        return (
          <div key={ev.id} className={cn(ROW, 'pr-0')}>
            <span className={cn(ROW_ICON, TXT[KIND_TONE[ev.kind] || 'dim'])}><I /></span>
            <span className={cn('min-w-0 flex-1 truncate', !on && 'text-muted-foreground')}>{timerName(ev)}<i className="ml-1 text-[11px] not-italic text-dim">{t('timer.everyHour', { m: mins })}</i></span>
            {next && <span className="flex-none text-[11px] whitespace-nowrap text-cyan tabular-nums">{hm(next)} · {leftTxt(next, now)}</span>}
            <BellBtn on={on} onClick={() => toggleTimer(ev)} tip={on ? t('timer.bellOn') : t('timer.bellOff')} />
          </div>
        )
      })}
    </div>
  </>
}

export function TimerTab() {
  useApp()
  const [pop, setPop] = useState<Pop | null>(null), ready = !!G.timers
  // Start at the current time; close the popover on any click elsewhere or when the list scrolls.
  useEffect(() => { document.querySelector('[data-now]')?.scrollIntoView({ block: 'center' }) }, [ready])
  // Day headers stick right below the page bar, whose height depends on how often its chips wrap.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-bar]'), cal = document.querySelector<HTMLElement>('[data-cal]')
    if (!bar || !cal) return
    const ro = new ResizeObserver(() => cal.style.setProperty('--bar-h', bar.offsetHeight + 'px'))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [ready])
  useEffect(() => {
    if (!pop) return
    const down = (e: MouseEvent) => { const el = e.target as HTMLElement; if (!el.closest('[data-calpop], [data-occ]')) setPop(null) }
    const list = document.querySelector('[data-list]'), sc = () => setPop(null)
    document.addEventListener('mousedown', down); list?.addEventListener('scroll', sc)
    return () => { document.removeEventListener('mousedown', down); list?.removeEventListener('scroll', sc) }
  }, [pop])
  if (!G.timers) return <Empty>{t('timer.loading')}</Empty>
  const now = Date.now(), start = V.calStart || 0
  const day0 = new Date(); day0.setHours(0, 0, 0, 0); day0.setDate(day0.getDate() + start)
  const days = Array.from({ length: DAYS }, (_, k) => { const d = new Date(day0); d.setDate(d.getDate() + k); return d.getTime() })
  const go = (n: number) => { V.calStart = Math.max(0, Math.min(DAYS, start + n)); setPop(null); bump() }
  const open = (o: Occ, r: DOMRect) => {
    if (pop && pop.ev === o.ev && pop.ms === o.ms) return setPop(null)
    const up = r.bottom + 150 > innerHeight
    setPop({ ev: o.ev, ms: o.ms, x: r.left, y: up ? r.top : r.bottom, up })
  }
  const range = (ms: number) => new Date(ms).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })
  const bar = <>
    <BarInfo tip={t('timer.leadTip')}>{t('timer.leadInfo', { n: lead() })}</BarInfo>
    <BarRight>
      {TIMER_KINDS.filter(k => G.timers.some((e: Any) => e.kind === k)).map(k => {
        const on = kindOn(k)
        return (
          <button key={k} onClick={() => toggleKind(k)} data-tip={t(on ? 'timer.kindOff' : 'timer.kindOn', { kind: t('timer.kind.' + k) })} className={cn(CHIP, on && CHIP_ON)}>
            <i className={cn('size-2 flex-none rounded-[2px]', DOT[KIND_TONE[k]])} />{t('timer.kind.' + k)}{on ? <Bell className="text-gold" /> : <BellOff className="text-dim" />}
          </button>
        )
      })}
      <button onClick={() => { U.timerAll = !U.timerAll; saveUi(['timerAll']); bump() }} data-tip={t('timer.allTip')} className={cn(CHIP, U.timerAll && CHIP_ON)}>{t('timer.all')}</button>
    </BarRight>
  </>
  const nav = 'grid h-6 min-w-6 place-items-center rounded-sm border px-1.5 text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5'
  return (
    <Page bar={bar}>
      <HourlyRows now={now} />
      <Sect sub={'· ' + range(days[0]) + ' – ' + range(days[DAYS - 1])} right={<>
        <button className={nav} disabled={start <= 0} onClick={() => go(-1)} data-tip={t('timer.prev')}><ChevronLeft /></button>
        <button className={nav} disabled={start === 0} onClick={() => go(-start)}>{t('timer.today')}</button>
        <button className={nav} disabled={start >= DAYS} onClick={() => go(1)} data-tip={t('timer.next')}><ChevronRight /></button>
      </>}>{t('timer.calendar')}</Sect>
      <div data-cal className="mx-1.5 flex rounded-sm border bg-card/60 [--bar-h:33px]">
        <div className="w-9 flex-none">
          <div className="sticky top-(--bar-h) z-[3] h-7 border-b bg-card" />
          <div className="relative" style={{ height: 24 * H }}>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-1 text-[10px] text-dim tabular-nums" style={{ top: h * H + 2 }}>{String(h).padStart(2, '0')}</span>
            ))}
          </div>
        </div>
        {days.map((from, k) => <DayCol key={from} k={k} from={from} now={now} pop={pop} onOpen={open} />)}
      </div>
      {pop && <BellPop p={pop} onClose={() => setPop(null)} />}
    </Page>
  )
}
