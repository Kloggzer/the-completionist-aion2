// Overview ("Übersicht"), flat: status line, four KPI tiles, "up next" rows, then "open today" next to "farm here" /
// "almost done". Every block links to its tab; the common actions (+1, bell) work right here.
import { Clock, Plus, Skull, User, type LucideIcon } from 'lucide-react'
import { G, S, U, V, useApp, type Any } from '@/core/state'
import { selectMap, mapName } from '@/core/data'
import { goTab } from '@/core/nav'
import { hm, fmt, t } from '@/core/i18n'
import { cn } from '@/lib/utils'
import { Bar, BarInfo, BellBtn, Columns, META, More, Note, Page, ROW, ROW_CLICK, ROW_ICON, ROWS, Sect, TILE, TILE_CLICK, TITLE, SUB, TONE } from '@/components/kit'
import { Portrait } from '@/components/Portrait'
import { soulPets } from '@/features/pets/logic'
import { allBosses, fbStatus, occOn, occurrences, timerName, timerWhere, toggleBossBell, toggleTimer } from '@/features/events/events'
import { KIND_ICON } from '@/features/events/TimerTab'
import { CHECK, CHECK_ICON, CHECK_ICON_DEFAULT, TIER, TIER_TONE, charKey, checkCount, checkSet, nextReset, resetIn, type Kind, type Per } from '@/features/progress/checklist'
import { alerts } from '@/features/progress/alerts'
import { AlertList } from '@/features/progress/ChargeRows'
import { achRows, loc } from '@/features/progress/achievements'

const leftTxt = (ms: number, now: number) => {
  const m = Math.round((ms - now) / 60000)
  return m <= 0 ? t('home.now') : m < 60 ? t('timer.inMin', { m }) : t('timer.inHMin', { h: Math.floor(m / 60), m: m % 60 })
}

// ---------------------------------------------------------------- data

type Next = { ms: number; key: string; Icon: LucideIcon; por?: number; name: string; where: string; due: boolean; go: () => void; bell: boolean; toggle: () => void }

/** Enabled events and field bosses (current map + belled ones), by time. */
function upNext(now: number, n: number): Next[] {
  const evs = (G.timers || []).filter((ev: Any) => ev.kind !== 'reset')
    .flatMap((ev: Any) => occurrences(ev, now - 60e3, now + 864e5).filter(ms => occOn(ev, ms)).map(ms => ({ ms, ev }))).sort((a: Any, b: Any) => a.ms - b.ms).slice(0, n)
  const bosses = nextBosses(n)
  return [
    ...evs.map(({ ms, ev }: Any) => ({ ms, key: ev.id + ms, Icon: KIND_ICON[ev.kind] || Clock, name: timerName(ev), where: timerWhere(ev), due: false,
      go: () => goTab('timer'), bell: true, toggle: () => toggleTimer(ev) })),
    ...bosses.map(({ b, s }) => ({ ms: s.due!, key: b.key, Icon: Skull, por: bossPor(b), name: b.name, due: s.k === 'due',
      where: b.map === U.map ? '' : mapName(G.maps.find((m: Any) => m.key === b.map)?.name || ''),
      go: () => { if (b.map !== U.map) selectMap(b.map); goTab('boss') }, bell: !!U.bossBells?.[b.key], toggle: () => toggleBossBell(b.key) })),
  ].sort((a, b) => a.ms - b.ms).slice(0, n)
}
/** Portrait index of a field boss (its species on the boss's map). */
const bossPor = (b: Any): number | undefined => G.md[b.map]?.species?.[b.id]?.por

function nextBosses(n: number) {
  return allBosses().filter(b => b.map === U.map || U.bossBells?.[b.key])
    .map(b => ({ b, s: fbStatus(b) })).filter(x => (x.s.k === 'wait' || x.s.k === 'due') && x.s.due)
    .sort((a, c) => a.s.due! - c.s.due!).slice(0, n)
}

/** Checklist entries of the logged-in character (own + server items). */
function checkItems() {
  const out: { id: string; max: number; per: Per; kind: Kind; c: number }[] = []
  for (const [kind, items] of CHECK) for (const [id, max, per] of items) out.push({ id, max, per, kind, c: checkCount(id, per, kind) })
  return out
}

// ---------------------------------------------------------------- blocks

function Kpi({ label, value, sub, tab, frac, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tab: string; frac?: number; tone?: 'cyan' | 'gold' | 'green' }) {
  return (
    <button onClick={() => goTab(tab)} data-tip={t('home.open', { tab: t('tab.' + tab) })} className={cn(TILE, TILE_CLICK, 'pb-1')}>
      <span className="text-[10.5px] font-semibold tracking-wider text-dim uppercase">{label}</span>
      <span className={cn(TITLE, 'mt-0.5 truncate text-[13.5px]')}>{value}</span>
      {sub != null && <span className={cn(SUB, 'truncate')}>{sub}</span>}
      <Bar frac={frac ?? 0} tone={tone} className={cn('mt-auto mb-0', frac == null && 'invisible')} />
    </button>
  )
}

function NextRows({ rows, now }: { rows: Next[]; now: number }) {
  if (!G.timers) return <Note>{t('timer.loading')}</Note>
  if (!rows.length) return <Note>{t('home.next.none')}</Note>
  return <div className={ROWS}>{rows.map(r => (
    <div key={r.key} className={cn(ROW, ROW_CLICK, 'pr-0')} onClick={r.go} data-tip={r.name + (r.where ? ' · ' + r.where : '')}>
      <b className="w-10 flex-none font-normal tabular-nums">{hm(r.ms)}</b>
      {r.por != null ? <Portrait por={r.por} size={22} className="-my-1" /> : <span className={cn(ROW_ICON, 'text-muted-foreground')}><r.Icon /></span>}
      <span className="min-w-0 flex-1 truncate">{r.name}{r.where && <i className="ml-1 text-[11px] not-italic text-dim">{r.where}</i>}</span>
      <span className={cn('flex-none text-[11px] whitespace-nowrap text-cyan tabular-nums', (r.due || r.ms - now < 10 * 60e3) && 'font-semibold text-gold')}>
        {r.due ? t('home.due') : leftTxt(r.ms, now)}
      </span>
      <BellBtn on={r.bell} onClick={e => { e.stopPropagation(); r.toggle() }} tip={r.bell ? t('timer.bellOn') : t('timer.bellOff')} />
    </div>
  ))}</div>
}

function OpenToday() {
  // Most important first: priority tier, then daily before weekly, then the most advanced.
  const all = checkItems(), open = all.filter(o => o.c < o.max)
    .sort((a, b) => (TIER[a.id] ?? 2) - (TIER[b.id] ?? 2) || (a.kind === b.kind ? 0 : a.kind === 'd' ? -1 : 1) || b.c / b.max - a.c / a.max)
  return <>
    <Sect sub={'· ' + t('home.important')} right={<More onClick={() => goTab('check')}>{t('home.allN', { n: all.length })}</More>}>{t('home.openToday')}</Sect>
    <div className={ROWS}>
      {!open.length && <Note className={TONE.ok}>✓ {t('chk.everything')}</Note>}
      {open.slice(0, 5).map(o => {
        const I = CHECK_ICON[o.id] || CHECK_ICON_DEFAULT, tier = TIER[o.id] ?? 2
        return (
        <div key={o.id} className={ROW} data-tip={[t('progress.sect.' + o.kind), t('chk.tier.' + tier), t('progress.tip.' + o.id)].filter(Boolean).join(' · ')}>
          <span className={cn(ROW_ICON, TIER_TONE[tier] === 'gold' ? 'text-gold' : TIER_TONE[tier] === 'cyan' ? 'text-cyan' : 'text-dim')}><I /></span>
          <span className="min-w-0 flex-1 truncate">{t('progress.item.' + o.id)}</span>
          <span className={META}>{o.c}/{o.max}</span>
          <button onClick={() => checkSet(o.id, o.per, o.kind, o.max, o.c + 1)} data-tip={t('home.plus')}
            className="-mr-1 grid size-6 flex-none place-items-center rounded-sm border text-muted-foreground hover:border-gold/50 hover:text-gold"><Plus className="size-3.5" /></button>
        </div>
      )})}
    </div>
  </>
}

function FarmHere() {
  const spot = V.spots[0]
  return <>
    <Sect right={<More onClick={() => goTab('targets')}>{t('tab.targets')}</More>}>{t('home.farm')}</Sect>
    <div className={ROWS}>
      {spot && (
        <div className={cn(ROW, ROW_CLICK)} data-tip={spot.pets.map((p: Any) => p.t.p.n).join(', ')}
          onClick={() => { V.spot = spot.rank; V.cube = null; goTab('spots', `[data-spot="${spot.rank}"]`) }}>
          <span className="w-10 flex-none text-[10.5px] tracking-wide text-dim uppercase">{t('home.spot')}</span>
          <Portrait por={spot.pets[0]?.t.mobs[0]?.por} size={22} className="-my-1" />
          <span className="min-w-0 flex-1 truncate">{spot.name}</span>
          <span className={META}>{t('pets.spot.pets.other', { n: spot.pets.length })}</span>
        </div>
      )}
      {!spot && <Note>{t('home.farm.none')}</Note>}
    </div>
  </>
}

function AlmostDone({ rows }: { rows: Any[] }) {
  return <>
    <Sect right={<More onClick={() => goTab('ach')}>{t('tab.ach')}</More>}>{t('home.almost')}</Sect>
    <div className={ROWS}>
      {!rows.length && <Note>{t('home.ach.none')}</Note>}
      {rows.map(r => (
        <div key={r.a.id} className={cn(ROW, ROW_CLICK)} data-tip={r.next ? loc(r.next, 'objective') : ''}
          onClick={() => { V.achSel = r.a.id; goTab('ach', `[data-ach="${r.a.id}"]`) }}>
          <span className="min-w-0 flex-1 truncate">{loc(r.a, 'name')}</span>
          <span className={META}><b className="font-semibold text-foreground">{fmt(r.val)}</b>/{fmt(r.next.goal)}</span>
          <Bar frac={r.frac} className="my-0 w-10" />
        </div>
      ))}
    </div>
  </>
}

export function HomeTab() {
  useApp()
  const now = Date.now(), m = G.md[U.map]
  const sp = soulPets(), have = sp.filter((p: Any) => (S.state.levels[p.id] || 0) > 0).length
  const missing = V.targets.filter((x: Any) => !x.done).length
  const items = checkItems(), done = items.filter(o => o.c >= o.max).length
  const boss = nextBosses(1)[0]
  const rows = G.ach ? achRows() : [], open = rows.filter(r => !r.done)
  const close = open.filter(r => r.val > 0 && r.frac < 1).sort((a, b) => b.frac - a.frac)
  const warn = alerts()
  const name = S.state.charName || (charKey() === 'Standard' ? t('chk.unknownChar') : charKey())
  return (
    <Page w="rows" bar={<BarInfo><User /> {[name, m ? mapName(m.name) : '', t('home.reset', { d: resetIn(nextReset('d')) })].filter(Boolean).join(' · ')}</BarInfo>}>
      {warn.length > 0 && <>
        <Sect sub={'· ' + t('alert.sub')} right={<More onClick={() => { V.chkPage = null; goTab('check') }}>{t('tab.check')}</More>}>{t('alert.title')}</Sect>
        <AlertList alerts={warn.slice(0, 4)} onOpen={() => goTab('check')} />
      </>}
      <div className="grid grid-cols-2 gap-1 px-1.5 pt-1.5 @min-[520px]:grid-cols-4">
        <Kpi tab="targets" label={t('home.kpi.pets')} value={t('home.missing', { n: missing })}
          sub={t('home.pets.have', { have, total: sp.length })} frac={sp.length ? have / sp.length : 0} tone="cyan" />
        <Kpi tab="check" label={t('home.kpi.today')} value={t('home.doneOf', { n: done, total: items.length })} sub={t('home.reset', { d: resetIn(nextReset('d')) })}
          frac={items.length ? done / items.length : 0} />
        <Kpi tab="boss" label={t('home.kpi.boss')} value={boss ? <>{hm(boss.s.due!)} <span className={boss.s.k === 'due' ? 'text-gold' : 'text-cyan'}>
          {boss.s.k === 'due' ? t('home.due') : leftTxt(boss.s.due!, now)}</span></> : '–'} sub={boss ? boss.b.name : t('home.kpi.noBoss')} />
        <Kpi tab="ach" label={t('home.kpi.ach')} value={G.ach ? t('home.kpi.close', { n: close.filter(r => r.frac >= 0.5).length }) : '–'}
          sub={G.ach ? t('chk.openN', { n: open.length }) : ''} />
      </div>
      {/* Overlay: one column; from 520 px "up next" full width over two columns; from 900 px two, from 1300 px three columns side by side. */}
      <Columns className="@min-[520px]:grid-cols-2">
        <div className="@min-[520px]:col-span-2 @min-[900px]:col-span-1">
          <Sect right={<More onClick={() => goTab('timer')}>{t('home.allTimers')}</More>}>{t('home.next')}</Sect>
          <NextRows rows={upNext(now, 5)} now={now} />
        </div>
        <div><OpenToday /></div>
        <div><FarmHere /><AlmostDone rows={close.slice(0, 3)} /></div>
      </Columns>
    </Page>
  )
}
