// "Ziele" tab: missing soul pets on the current map as tiles, progress entered by hand on each tile.
import { G, S, U, V, useApp, type Any } from '@/core/state'
import { mapName } from '@/core/data'
import { t } from '@/core/i18n'
import { cn } from '@/lib/utils'
import { Bar, Hint, LEAD, Page, T_BODY, T_FOOT, T_META, T_PORTRAIT, T_SUB, T_TITLE, TILE as KTILE, TILE_CLICK, TILE_P, TILE_SEL, grid } from '@/components/kit'
import { Portrait } from '@/components/Portrait'
import { lvTxt, mobGroups, toggleMulti } from './logic'
import { Dot, Empty, Pbar, PinBox, SelBar, Sect, rich } from './parts'
import { PetControls } from './manual'

// Portrait tiles (kit anatomy): portrait column left; title, two-line sub, bar and footer right.
const GRID = grid('pet'), TILE = cn(KTILE, TILE_CLICK, TILE_P), SEL = TILE_SEL

// Click toggles the pet in the selection (several at once: map highlight + "find spot").
function selectPet(id: number) { V.sel = null; toggleMulti(id) }

// How to enter progress, until the first soul is entered.
function ManualHint() {
  const st = S.state
  if (Object.keys(st.levels).length || Object.values<number>(st.souls).some(n => n > 0)) return null
  return <Hint tone="cyan">{rich(t('man.petsHint'))}</Hint>
}

const tagTxt = (mob: Any) => [mob.named ? t('pets.tag.named') : mob.r === 'Hero' ? t('pets.tag.hero') : mob.r === 'Elite' ? t('pets.tag.elite') : '', mob.ag ? t('pets.tag.aggro') : '']
  .filter(Boolean).join(', ')

// Same size selected or not; the mob details are in the tooltip.
function TargetTile({ x }: { x: Any }) {
  const on = V.multi.has(x.p.id), groups = mobGroups(x), g0 = groups[0]
  const where = `${g0.n} ${lvTxt(g0.lv)}${groups.length > 1 ? ` +${groups.length - 1}` : ''}${x.area.name ? ` · ${x.area.name}` : ''}`
  const tip = [`${x.p.n} (${x.p.c}, Lv${x.lv})${x.area.name ? ' · ' + x.area.name : ''}`,
    ...groups.map(g => `${g.n} ${lvTxt(g.lv)} · ${g.count}× ${t('pets.spawnsTip')}${tagTxt(g.mob) ? ' · ' + tagTxt(g.mob) : ''}`)].join('\n')
  return (
    <div data-pet={x.p.id} data-sel={on || undefined} className={cn(TILE, on && SEL, 'pr-0')} data-tip={tip} onClick={() => selectPet(x.p.id)}>
      <Portrait por={g0.mob.por} size={null} className={T_PORTRAIT} />
      <div className={T_BODY}>
        <div className="flex items-start gap-1.5"><Dot col={x.col} /><span className={T_TITLE}>{x.p.n}</span>{V.multi.size > 0 && <PinBox on={on} />}</div>
        <div className={T_SUB}>{where}</div>
        <div className={T_FOOT}>
          {x.done ? <Bar frac={1} /> : <Pbar lv={x.lv} frac={x.souls / x.need} />}
          <div className={T_META}>
            <span>{x.done ? <b className="text-green">✓</b> : <><b className="font-semibold text-foreground">{x.souls}</b>/{x.need}</>}</span>
            <span>Lv{x.lv}</span>
          </div>
        </div>
      </div>
      <PetControls x={x} />
    </div>
  )
}

function Targets({ m }: { m: Any }) {
  const ts = V.targets
  if (!ts.length) {
    const filtered = U.hideNamed || U.lvMin > 1 || U.lvMax < 60
    return <Empty>{rich(t('pets.empty.none', { map: mapName(m.name), filter: filtered ? t('pets.empty.filter') : '' }))}</Empty>
  }
  // With priority sort the tiles are grouped: unlock, level up, complete.
  const sects: { group: string; items: Any[] }[] = []
  for (const x of ts) {
    const group = U.sort === 'prio' ? t(x.done ? 'pets.group.done' : x.lv === 0 ? 'pets.group.unlock' : 'pets.group.level') : ''
    if (!sects.length || sects[sects.length - 1].group !== group) sects.push({ group, items: [] })
    sects[sects.length - 1].items.push(x)
  }
  return <Page>
    <SelBar />
    <ManualHint />
    {sects.map((s, i) => (
      <div key={i}>
        {s.group && <Sect>{s.group}</Sect>}
        <div className={cn(GRID, !s.group && LEAD)}>{s.items.map(x => <TargetTile key={x.p.id} x={x} />)}</div>
      </div>
    ))}
  </Page>
}

export function TargetsTab() {
  useApp()
  const m = G.md[U.map]
  return m ? <Targets m={m} /> : <Empty>{t('data.loading')}</Empty>
}
