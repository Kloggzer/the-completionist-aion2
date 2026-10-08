import { Award, Castle, Clock, Coins, Compass, Crown, Gamepad2, Gem, Hammer, HeartCrack, ListChecks, LogIn, PawPrint, Pickaxe, ScrollText, Shield, Skull, Sparkles, Star, Swords, Tornado, TrendingUp, Trophy, Users, type LucideIcon } from 'lucide-react'
import { S, U, G, V, bump, saveUi, useApp, type Any } from '@/core/state'
import { Portrait } from '@/components/Portrait'
import { t, fmt } from '@/core/i18n'
import { cn } from '@/lib/utils'
import { ACH_BANDS, achFaction, achRows, loc, setAch, type AchRow } from './achievements'
import { AppSelect } from '@/components/AppSelect'
import { Bar, BarInfo, BarRight, CHIP, CHIP_ON, Empty, Hint, Page, Sect, rich, T_BODY, T_FOOT, T_META, T_PORTRAIT, T_SUB, T_TITLE, TILE, TILE_CLICK, TILE_P, TILE_SEL, TileIcon, grid, type BoxTone } from '@/components/kit'

/** Expanded tile: counter −/+ (1 and 10). Tiers are ticked in the tier list below. */
function AchEdit({ r }: { r: AchRow }) {
  const max = r.a.tiers.at(-1)?.goal ?? 0, steps = max >= 20 ? [10, 1] : [1]
  const b = 'h-6 min-w-7 flex-none rounded-sm border px-1 text-[11px] text-muted-foreground tabular-nums transition-colors hover:border-gold/50 hover:text-gold disabled:pointer-events-none disabled:opacity-30'
  const set = (v: number) => setAch(r.a, Math.min(max, v))
  return (
    <div data-ach-edit className="mt-1.5 flex items-center gap-1 rounded-sm border border-cyan/25 bg-cyan/[0.04] px-1.5 py-1 text-[12px]" onClick={e => e.stopPropagation()}>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{t('ach.set')}</span>
      {steps.map(d => <button key={-d} className={b} disabled={r.val <= 0} onClick={() => set(r.val - d)}>−{d}</button>)}
      <output className="min-w-10 text-center font-semibold text-foreground tabular-nums">{fmt(r.val)}</output>
      {[...steps].reverse().map(d => <button key={d} className={b} disabled={r.val >= max} onClick={() => set(r.val + d)}>+{d}</button>)}
    </div>
  )
}

// Icon per objective type; colour per category. Field boss / NPC kills show the boss portrait when the target
// can be matched to a species of a loaded map (the target name is German, species names English: the boss's own
// name is the last word in both, e.g. "Schweigender Dartan" / "Silent Dartan").
const TYPE_ICON: Record<string, LucideIcon> = {
  Explore: Compass, DungeonClear: Castle, DungeonTask: ListChecks, KillNpc: Skull, KillFieldBoss: Crown, KillPlayer: Swords,
  Enhance: Sparkles, Pet: PawPrint, Collect: Gem, Craft: Hammer, MiniGame: Gamepad2, Gather: Pickaxe, Quest: ScrollText,
  Daevanion: Star, Economy: Coins, Social: Users, Death: HeartCrack, PCLevel: TrendingUp, Login: LogIn, PlayTime: Clock,
  ItemLevel: Shield, Invasion: Tornado,
}
const CAT: Record<string, { tone: BoxTone; key: string }> = {
  Abenteuer: { tone: 'cyan', key: 'adv' },
  Leben: { tone: 'green', key: 'life' },
  Kampf: { tone: 'red', key: 'fight' },
  Herausforderung: { tone: 'purple', key: 'chal' },
}
let porByName: Map<string, number> | null = null, porMaps = 0
function bossPortrait(a: Any): number | null {
  if (!a.target || (a.objective_type !== 'KillFieldBoss' && a.objective_type !== 'KillNpc')) return null
  const n = Object.keys(G.md).length
  if (!porByName || porMaps !== n) {
    porByName = new Map(); porMaps = n
    for (const m of Object.values<Any>(G.md)) for (const sp of Object.values<Any>(m.species || {}))
      if ((sp.named || sp.r !== 'Normal') && sp.por != null) porByName.set(String(sp.n).split(' ').pop()!.toLowerCase(), sp.por)
  }
  return porByName.get(String(a.target).split(' ').pop()!.toLowerCase()) ?? null
}

function AchIcon({ a }: { a: Any }) {
  const por = bossPortrait(a)
  if (por != null) return <Portrait por={por} size={null} className={T_PORTRAIT} />
  return <TileIcon icon={TYPE_ICON[a.objective_type] || Trophy} tone={CAT[a.category_de]?.tone || 'gold'} />
}

/** One dot per tier: reached green, current cyan, open dim. */
function Pips({ n, reached }: { n: number; reached: number }) {
  return <span className="flex items-center gap-[3px]">{Array.from({ length: n }, (_, i) =>
    <i key={i} className={cn('size-[5px] rounded-full', i < reached ? 'bg-green' : i === reached ? 'bg-cyan' : 'bg-white/15')} />)}</span>
}

function Tile({ r }: { r: AchRow }) {
  const a = r.a, sel = V.achSel === a.id, x = r.next, title = x?.rewards?.title, kina = x?.rewards?.kina
  const tip = [`${loc(a, 'name')} – ${loc(a, 'category')}`, x && loc(x, 'objective'),
    title && `${t('progress.titleReward')}: ${title.name}${title.stats ? ' (' + Object.entries(title.stats).map(([k, v]) => k + ' ' + v).join(', ') + ')' : ''}`,
    a.tags?.length ? a.tags.map((g: string) => t('progress.tag.' + g)).join(' · ') : ''].filter(Boolean).join('\n')
  return (
    <div data-ach={a.id} data-tip={tip} onClick={() => { V.achSel = sel ? null : a.id; bump() }}
      className={cn(TILE, TILE_CLICK, TILE_P, r.done && 'opacity-55', sel && cn(TILE_SEL, 'col-span-full opacity-100'))}>
      <AchIcon a={a} />
      <div className={T_BODY}>
        <span className={cn(T_TITLE, sel && 'whitespace-normal')}>{loc(a, 'name')}</span>
        <div className={cn(T_SUB, sel && 'line-clamp-none')}>{x ? loc(x, 'objective') : t('progress.achAll')}</div>
        <div className={T_FOOT}>
          <Bar frac={r.frac} />
          <div className={T_META}>
            <span>{x ? <><b className="font-semibold text-foreground">{fmt(r.val)}</b>/{fmt(x.goal)}</> : <b className="text-green">✓</b>}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              {title && <Award className="size-3.5 flex-none text-gold" aria-label={t('progress.titleReward')} />}
              {!!kina && <span className="flex items-center gap-0.5 text-dim"><Coins className="size-3" />{kina >= 1000 ? Math.round(kina / 1000) + 'k' : kina}</span>}
              <Pips n={a.tiers.length} reached={r.reached} />
            </span>
          </div>
        </div>
        {sel && <AchEdit r={r} />}
        {sel && (
          <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {a.tiers.map((y: Any, i: number) => {
              const ok = i < r.reached, now = i === r.reached
              // A tier row ticks the tier (counter = its goal); the last reached one unticks (previous goal).
              const back = i ? a.tiers[i - 1].goal : 0, tick = !ok || i === r.reached - 1
              return (
                <div key={i} data-tier={i + 1} data-tip={tick ? t(ok ? 'ach.untickTip' : 'ach.tickTip', { goal: fmt(ok ? back : y.goal) }) : undefined}
                  onClick={tick ? e => { e.stopPropagation(); setAch(a, ok ? back : y.goal) } : undefined}
                  className={cn('flex flex-wrap items-baseline gap-1.5', ok && 'text-dim', now && 'text-foreground', tick && 'cursor-pointer rounded-sm hover:bg-white/5')}>
                  <b className={cn('w-3.5 text-dim', ok && 'text-green', now && 'text-cyan')}>{ok ? '☑' : '☐'}</b>
                  {loc(y, 'objective')} <span className="text-foreground tabular-nums">{fmt(y.goal)}</span>
                  {y.rewards?.title && <em className="flex items-center gap-1 text-gold not-italic"><Award className="size-3" /> {y.rewards.title.name}</em>}
                  {y.rewards?.kina ? <i className="text-dim not-italic">{fmt(y.rewards.kina)} Kina</i> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function AchTab() {
  useApp()
  if (!G.ach) return <Empty>{t('progress.achLoading')}</Empty>
  const has = Object.keys(S.state.ach || {}).length > 0
  let rows = achRows()
  const open = rows.filter(r => !r.done).length
  if (U.achCat) rows = rows.filter(r => CAT[r.a.category_de]?.key === U.achCat)
  if (!U.achDone) rows = rows.filter(r => !r.done)
  rows.sort((x, y) => x.diff - y.diff || y.frac - x.frac)
  // group into difficulty bands (rows are sorted, done rows have diff 101 and come last)
  const bands: { b: number; rows: AchRow[] }[] = []
  for (const r of rows) {
    const b = r.done ? 3 : ACH_BANDS.findIndex(([max]) => r.diff < max)
    if (bands.at(-1)?.b !== b) bands.push({ b, rows: [] })
    bands.at(-1)!.rows.push(r)
  }
  const bar = <>
    <BarInfo>{t('progress.achOpen', { n: open })}</BarInfo>
    <BarRight>
      <AppSelect value={U.faction || achFaction() || 'all'} tip={t('ach.faction')} className="h-6 text-xs"
        options={['all', 'Elyos', 'Asmodian'].map(f => ({ value: f, label: t('ach.faction.' + f) }))}
        onChange={v => { U.faction = v; saveUi(['faction']); bump() }} />
      {[['', 'all'], ...Object.values(CAT).map(c => [c.key, c.key])].map(([k, l]) => (
        <button key={l} onClick={() => { U.achCat = k || null; saveUi(['achCat']); bump() }} className={cn(CHIP, (U.achCat || '') === k && CHIP_ON)}>{t('progress.cat.' + l)}</button>
      ))}
      <button onClick={() => { U.achDone = !U.achDone; saveUi(['achDone']); bump() }} className={cn(CHIP, U.achDone && CHIP_ON)}>
        {t('progress.achShowDone')}
      </button>
    </BarRight>
  </>
  return (
    <Page bar={bar}>
      {!has && <Hint tone="cyan">{rich(t('ach.manualHint'))}</Hint>}
      {bands.map(({ b, rows }) => (
        <div key={b}>
          <Sect>{b === 3 ? t('progress.band.done') : t(ACH_BANDS[b][1])}</Sect>
          <div className={grid('pet')}>
            {rows.map(r => <Tile key={r.a.id} r={r} />)}
          </div>
        </div>
      ))}
    </Page>
  )
}
