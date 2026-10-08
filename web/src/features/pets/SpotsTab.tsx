// "Spots" tab: ranked farm spots (spawn clusters of needed mobs) for the current map.
import { G, U, V, bump, useApp, type Any } from '@/core/state'
import { emit } from '@/core/bus'
import { t } from '@/core/i18n'
import { cn } from '@/lib/utils'
import { R, mobGroups } from './logic'
import { Empty, SelBar, rich } from './parts'
import { Bar, Hint, LEAD, Page, T_BODY, T_PORTRAIT, T_TITLE, TILE as KTILE, TILE_CLICK, TILE_P, TILE_SEL, grid } from '@/components/kit'
import { Portrait } from '@/components/Portrait'

const GRID = grid('pet'), TILE = cn(KTILE, TILE_CLICK, TILE_P), SEL = TILE_SEL

// Why a spot ranks where it does: how many of its pets you would unlock vs. level (unlocks weigh double).
function reason(s: Any) {
  const un = s.pets.filter((p: Any) => p.t.lv === 0).length, lv = s.pets.length - un
  return [un && t('pets.spot.unlock', { n: un }), lv && t('pets.spot.level', { n: lv })].filter(Boolean).join(' · ')
}

/** Collapsible "how is this ranked?" explanation above the list. */
function HowRanked() {
  if (!U.spotHelp) return null
  const lines = ['src', 'count', 'radius', 'cap', 'weight', 'top']
  return (
    <Hint tone="cyan">
      <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-dim">
        {lines.map(k => <li key={k}>{rich(t('pets.how.' + k, { r: R }))}</li>)}
      </ul>
    </Hint>
  )
}

// Tile like the targets: portrait of the top pet's mob; rank + area, why it ranks there, score bar, the top 3 pets
// (always three line slots + the "more" line, so all spot tiles have the same height; all pets in the tooltip).
function Spot({ s }: { s: Any }) {
  const sel = V.spot === s.rank, pets = s.pets.slice(0, 3), more = s.pets.length - pets.length
  return (
    <div data-spot={s.rank} data-sel={sel || undefined} onClick={() => { V.spot = sel ? null : s.rank; V.sel = null; emit('fit'); bump() }}
      data-tip={[t('pets.spot.tip', { n: s.n, r: R, pets: s.pets.length }), ...s.pets.map(({ t: x, n }: Any) => `${x.p.n}: ${n}× · ${x.souls}/${x.need} (Lv${x.lv})`)].join('\n')} className={cn(TILE, sel && SEL)}>
      <Portrait por={pets[0] && mobGroups(pets[0].t)[0]?.mob.por} size={null} className={T_PORTRAIT} />
      <div className={T_BODY}>
        <div className="flex items-center gap-1.5">
          <span className="grid size-4 flex-none place-items-center rounded-sm bg-gold/15 text-[10.5px] font-bold text-gold">{s.rank}</span>
          <span className={T_TITLE}>{s.name}</span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] font-semibold">{reason(s)}</div>
        <Bar frac={s.rel} tone="gold" />
        <div className="flex flex-col gap-0.5 text-[11.5px]">
          {[0, 1, 2].map(i => {
            const e = pets[i]
            if (!e) return <span key={i} className="h-4" />
            const x = e.t
            return (
              <span key={x.p.id} className="flex h-4 min-w-0 items-center gap-1 text-[#c3cad8]">
                <Portrait por={mobGroups(x)[0]?.mob.por} size={16} className="rounded-[2px]" />
                <span className="flex-none text-[9px]" style={{ color: x.col }}>●</span>
                <span className={cn('min-w-0 flex-1 truncate', x.lv === 0 && 'text-cyan')}>{x.p.n}</span>
                <i className="flex-none text-dim not-italic tabular-nums">{e.n}×</i>
              </span>
            )
          })}
          <span className="h-4 text-dim">{more > 0 ? t('pets.spot.more', { n: more }) : ''}</span>
        </div>
      </div>
    </div>
  )
}

export function SpotsTab() {
  useApp()
  const m = G.md[U.map]
  return <Page>
    <SelBar />
    <HowRanked />
    {!m ? <Empty>{t('data.loading')}</Empty>
      : !V.spots.length ? <Empty>{t('pets.spot.empty', { filter: U.hideNamed ? t('pets.spot.filter') : '' })}</Empty>
        : <div className={cn(GRID, LEAD)}>{V.spots.map((s: Any) => <Spot key={s.rank} s={s} />)}</div>}
  </Page>
}
