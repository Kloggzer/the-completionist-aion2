// Small building blocks shared by the targets and spots lists.
import { Check, ChevronDown, Columns2, Globe, Info, List, Map as MapIcon, Search, X } from 'lucide-react'
import { U, V, saveUi, bump, type Any } from '@/core/state'
import { goTab } from '@/core/nav'
import { host } from '@/core/host'
import { emit } from '@/core/bus'
import { t } from '@/core/i18n'
import { AppSelect } from '@/components/AppSelect'
import { cn } from '@/lib/utils'
import { Bar, CHIP, CHIP_ON, ToolbarStrip } from '@/components/kit'
export { Empty } from '@/components/kit'
import { SORTS, clearMulti, mobGroups, recompute, spotsForSelection } from './logic'

export { rich } from '@/components/kit'

export { Sect } from '@/components/kit'

/** Progress bar: cyan while unlocking, gold while levelling. */
export const Pbar = ({ lv, frac, className }: { lv: number; frac: number; className?: string }) => <Bar frac={frac} tone={lv === 0 ? 'cyan' : 'gold'} className={className} />

/** Three level dots. */
export const LvDots = ({ lv }: { lv: number }) => (
  <span className="flex flex-none gap-0.5" data-tip={t('pets.lvTip', { lv })}>
    {[1, 2, 3].map(l => <i key={l} className={cn('size-[7px] rounded-full border border-dim', l <= lv && 'border-gold bg-gold')} />)}
  </span>
)

/** Category/colour marker (rotated square). */
export const Dot = ({ col, className }: { col?: string; className?: string }) => (
  <span className={cn('mt-[5px] size-2 flex-none rotate-45 rounded-[2px]', className)} style={col ? { background: col } : undefined} />
)

// The map picker counts and both lists depend on the filters, so everything is recomputed.
function toggle(f: string) { U[f] = !U[f]; saveUi([f]); emit('recompute') }

const chip = CHIP, chipOn = CHIP_ON

const VIEWS = [['both', Columns2], ['map', MapIcon], ['list', List]] as const
function setView(v: string) { U.view = v; saveUi(['view']); bump(); requestAnimationFrame(() => emit('fit')) }

/** Map / map + list / list switch of the map tabs. */
function ViewSwitch() {
  return (
    <div className="flex h-6 flex-none items-center rounded-sm border bg-background/40 px-px">
      {VIEWS.map(([v, I]) => (
        <button key={v} data-tip={t('hdr.view.' + v)} onClick={() => setView(v)}
          className={cn('grid h-5 w-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground [&_svg]:size-3.5', (U.view || 'both') === v && 'bg-accent text-gold')}><I /></button>
      ))}
    </div>
  )
}

/** Toolbar of the map tabs, between map and list (stays below the map in "map only"). Empty space drags the window. */
export function Toolbar({ kind }: { kind: 'targets' | 'spots' }) {
  const opts = SORTS.map(k => ({ value: k, label: t('pets.sort.' + k) }))
  return (
    <ToolbarStrip>
      {kind === 'targets'
        ? <AppSelect value={U.sort} options={opts} tip={t('pets.sort.tip')} className="h-6 text-xs"
          onChange={v => { U.sort = v; saveUi(['sort']); emit('recompute') }} />
        : <button onClick={() => { U.spotHelp = !U.spotHelp; saveUi(['spotHelp']); bump() }} data-tip={t('pets.how.tip')}
          className={cn('flex min-w-0 items-center gap-1 rounded-sm px-1 hover:text-foreground', U.spotHelp && 'text-cyan hover:text-cyan')}>
          <Info className="size-3.5 flex-none" /><span className="truncate">{t('pets.how')}</span>
          <ChevronDown className={cn('size-3.5 flex-none transition-transform', U.spotHelp && 'rotate-180')} />
        </button>}
      <span data-drag className="h-5 min-w-2 flex-1 cursor-grab" />
      <button className={cn(chip, U.hideNamed && chipOn)} data-tip={t('pets.chip.hideNamed.tip')} onClick={() => toggle('hideNamed')}>{t('pets.chip.hideNamed')}</button>
      {kind === 'targets' && <button className={cn(chip, U.showLv3 && chipOn)} data-tip={t('pets.chip.showLv3.tip')} onClick={() => toggle('showLv3')}>{t('pets.chip.showLv3')}</button>}
      {(U.lvMin > 1 || U.lvMax < 60) && <span data-drag className={cn(chip, chipOn, 'cursor-grab')} data-tip={t('pets.chip.lv.tip')}>Lv {U.lvMin}–{U.lvMax}</span>}
      <ViewSwitch />
    </ToolbarStrip>
  )
}

/** Checkbox of a target tile: only shown while something is selected, so the multi-selection is obvious. */
export const PinBox = ({ on }: { on: boolean }) => (
  <span data-pin className={cn('mt-px ml-auto grid size-4 flex-none place-items-center rounded-[3px] border transition-colors', on ? 'border-gold bg-gold text-[#1b1607]' : 'border-dim/80')}>
    {on && <Check className="size-3 stroke-3" />}
  </span>
)

const barBtn = 'flex flex-none items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[12px] whitespace-nowrap transition-colors [&_svg]:size-3.5'

/** Selection bar above the targets/spots list while pets are multi-selected. */
export function SelBar() {
  if (!V.multi.size) return null
  const sel = V.targets.filter((x: Any) => V.multi.has(x.p.id)), names = sel.map((x: Any) => x.p.n).join(', ')
  const one = sel.length === 1 ? mobGroups(sel[0])[0] : null
  const spotsTab = U.tab === 'spots'
  return (
    <div data-selbar className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-gold/35 bg-[#262112f5] px-2 py-1 text-[12px]">
      <b className="flex-none font-semibold text-gold">{t('sel.n', { n: V.multi.size })}</b>
      <span data-tip={names} className="min-w-0 flex-1 truncate text-muted-foreground">{spotsTab && V.spotsSel ? t('sel.spotsFor') : names}</span>
      {spotsTab && V.spotsSel
        ? <button className={cn(barBtn, 'text-muted-foreground hover:text-foreground')} data-tip={t('sel.allSpots.tip')}
          onClick={() => { V.spotsSel = false; V.spot = null; recompute(); emit('fit') }}>{t('sel.allSpots')}</button>
        : <button className={cn(barBtn, 'border-gold/60 bg-gold/15 text-gold hover:bg-gold/25')} data-tip={t('sel.find.tip')}
          onClick={() => { spotsForSelection(); goTab('spots', '[data-spot="1"]') }}><Search />{t('sel.find')}</button>}
      {one && <button className={cn(barBtn, 'text-muted-foreground hover:text-foreground')} data-tip={t('pets.site')}
        onClick={() => host({ type: 'site', on: true, map: U.map, search: one.n })}><Globe /></button>}
      <button className={cn(barBtn, 'text-muted-foreground hover:text-foreground')} data-tip={t('sel.clear')} onClick={clearMulti}><X /><span className="max-[420px]:hidden">{t('sel.clear')}</span></button>
    </div>
  )
}
