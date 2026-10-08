// Pet progress entered by hand on the target tiles. The host owns the pet state (PetState.cs):
// 'addSoul' counts one soul (level-up thresholds 5 / 25 / 75, toast via 'soul'), 'setPet' sets
// level and souls directly. Both save pet_state.json and post the state back.
import { Plus } from 'lucide-react'
import { NEED, S, V, bump, type Any } from '@/core/state'
import { host } from '@/core/host'
import { emit } from '@/core/bus'
import { t } from '@/core/i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { MiniStepper } from '@/components/kit'
import { cn } from '@/lib/utils'

export const addSoul = (id: number) => host({ type: 'addSoul', id, n: 1 }) // the host answers with 'soul' (pets/index.ts)

export function setPet(id: number, level: number, souls: number) {
  level = Math.max(0, Math.min(3, level))
  souls = level >= 3 ? 0 : Math.max(0, Math.min(NEED[level] - 1, souls))
  // Shown right away; the host's 'state' answer carries the same values.
  if (level > 0) S.state.levels[id] = level; else delete S.state.levels[id]
  S.state.souls[id] = souls
  host({ type: 'setPet', id, level, souls })
  emit('recompute')
  keepInView(id)
}

/** A level change can move the tile into another group: scroll it back into view (the popover follows it). */
export function keepInView(id: number) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-list] [data-pet="${id}"]`)?.scrollIntoView({ block: 'nearest' })))
}

const col = 'flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-white/10 hover:text-gold disabled:pointer-events-none disabled:opacity-25'

/** −/+ style column at the right edge of a target tile: +1 soul above, the level popover below. */
export function PetControls({ x }: { x: Any }) {
  const id = x.p.id, lv: number = x.lv, souls: number = x.souls, need = NEED[lv] || 0
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <span data-manual className="-my-1 flex w-10 flex-none flex-col self-stretch border-l" onClick={stop}>
      <button data-add-soul className={cn(col, '[&_svg]:size-4.5')} disabled={lv >= 3} data-tip={t('man.soul.tip', { name: x.p.n })} onClick={() => addSoul(id)}><Plus /></button>
      {/* Open state lives in V: a level change moves the tile to another group (remount), the popover stays open. */}
      <Popover open={V.petEdit === id} onOpenChange={o => { V.petEdit = o ? id : null; bump() }}>
        <PopoverTrigger data-pet-edit data-tip={t('man.edit')} className={cn(col, 'border-t text-[11px] font-semibold')}>Lv</PopoverTrigger>
        <PopoverContent side="left" align="start" initialFocus={false} finalFocus={false} className="w-56 gap-2 p-2" onClick={stop}>
          <div className="truncate text-[12.5px] font-semibold">{x.p.n}</div>
          <MiniStepper label={t('man.level')} value={lv} minus={lv > 0} plus={lv < 3} tips={['−1', '+1']}
            onStep={d => setPet(id, lv + d, 0)} />
          <MiniStepper label={t('man.souls')} value={lv >= 3 ? '–' : `${souls}/${need}`} minus={lv < 3 && souls > 0} plus={lv < 3}
            tips={['−1', '+1']} onStep={d => (d > 0 ? addSoul(id) : setPet(id, lv, souls - 1))} />
          <div className="flex gap-1">
            <Button size="xs" variant="outline" className="flex-1" disabled={lv >= 3} onClick={() => setPet(id, 3, 0)}>{t('man.max')}</Button>
            <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={lv === 0 && souls === 0} onClick={() => setPet(id, 0, 0)}>{t('man.zero')}</Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  )
}
