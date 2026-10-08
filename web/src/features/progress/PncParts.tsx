// UI of the optional PLAYNC character lookup: name search with results, portrait, info lines, the character page block.
import { useState } from 'react'
import { Link2, Link2Off, RefreshCw, Search, User } from 'lucide-react'
import { U, saveUi, bump, useApp } from '@/core/state'
import { t } from '@/core/i18n'
import { Button } from '@/components/ui/button'
import { AppSelect } from '@/components/AppSelect'
import { Note, ROW, ROWS, ROW_CLICK, SECT_BTN, Sect, TextEntry } from '@/components/kit'
import { cn } from '@/lib/utils'
import { REGIONS, ago, busy, errors, infoLine, infoLine2, profileOf, raceName, refresh, region, search, sourceTip, unlink, type Hit, type Profile, type Region } from './plaync'

/** Website portrait (falls back to a neutral icon). */
export function PncAvatar({ src, size = 18, tip, className }: { src?: string; size?: number; tip?: string; className?: string }) {
  const [bad, setBad] = useState(false)
  const box = cn('inline-grid flex-none place-items-center overflow-hidden rounded-sm border border-white/10 bg-black/30 text-dim', className)
  return (
    <span data-tip={tip} className={box} style={{ width: size, height: size }}>
      {src && !bad ? <img src={src} alt="" className="size-full object-cover" onError={() => setBad(true)} /> : <User className="size-[65%]" />}
    </span>
  )
}

export const RegionSelect = ({ className, compact }: { className?: string; compact?: boolean }) => (
  <AppSelect value={region()} tip={t('set.pncRegion')} className={className}
    options={REGIONS.map(r => ({ value: r, label: compact ? (r === 'eu' ? 'EU' : 'NA') : t('pnc.region.' + r) }))}
    onChange={v => { U.pncRegion = v as Region; saveUi(['pncRegion']); bump() }} />
)

/** Name field with an optional website search. `onManual` = add without search (Enter / OK); without it Enter searches. */
export function CharSearch({ init = '', onPick, onManual, onCancel }: {
  init?: string; onPick: (h: Hit) => void; onManual?: (name: string) => boolean; onCancel: () => void
}) {
  useApp()
  const [v, setV] = useState(init), [bad, setBad] = useState(false)
  const [hits, setHits] = useState<Hit[] | null>(null), [state, setState] = useState<'' | 'busy' | 'err'>('')
  const ok = () => { if (!onManual) return go(); if (onManual(v)) onCancel(); else setBad(true) }
  const go = async () => {
    if (!v.trim()) return
    setState('busy')
    try { setHits(await search(v)); setState('') } catch { setHits(null); setState('err') }
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1" onClick={e => e.stopPropagation()}>
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        <TextEntry value={v} onChange={x => { setV(x); setBad(false) }} onSubmit={ok} onCancel={onCancel} placeholder={t('chk.addPh')} className={cn('w-40 flex-1', bad && 'border-red')} />
        <RegionSelect compact className="h-7 w-16 text-xs" />
        <Button data-pnc-search size="xs" variant="outline" disabled={!v.trim() || state === 'busy'} data-tip={t('pnc.searchTip')} onClick={go}><Search />{t('pnc.search')}</Button>
        {onManual && <Button size="xs" variant="outline" disabled={!v.trim()} onClick={ok}>{t('chk.ok')}</Button>}
        <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={onCancel}>{t('chk.cancel')}</Button>
      </span>
      {bad && <span className="text-[11px] text-red">{t('chk.exists')}</span>}
      {state === 'busy' && <Note className="px-0">{t('pnc.searching')}</Note>}
      {state === 'err' && <Note className="px-0 text-gold">{t('pnc.err')}</Note>}
      {state === '' && hits && (hits.length
        ? <>
          <Note className="px-0">{onManual ? t('pnc.pick') : t('pnc.pickLink')}</Note>
          <div className={cn(ROWS, 'max-h-64 overflow-y-auto')}>
            {hits.map(h => (
              <div key={h.id + h.serverId} data-pnc-hit={h.name} className={cn(ROW, ROW_CLICK, 'px-1')} onClick={() => onPick(h)}>
                <PncAvatar src={h.img} size={26} />
                <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{h.name}</b>
                  <span className="text-muted-foreground"> · {[h.level != null ? t('pnc.lv', { n: h.level }) : '', h.server, raceName(h.race)].filter(Boolean).join(' · ')}</span></span>
              </div>
            ))}
          </div>
          <span className="text-[10.5px] text-dim">{t('pnc.source')}</span>
        </>
        : <Note className="px-0">{t('pnc.none')}</Note>)}
    </div>
  )
}

/** Two info lines for a linked character's tile ("Lv · class · CP", "server · faction · titles"). */
export function PncLines({ p }: { p: Profile }) {
  return <span data-pnc-info data-tip={sourceTip(p)} className="block truncate text-foreground/80">{[infoLine(p), infoLine2(p)].filter(Boolean).join(' · ')}</span>
}

/** Website block on a character's page (the info lines are in the owner tile): titles, refresh, unlink, age, errors. */
export function PncBlock({ char }: { char: string }) {
  const p = profileOf(char)
  if (!p) return null
  const loading = busy.has(char)
  return <>
    <Sect sub={<span data-pnc-age data-tip={t('pnc.source')}>· {t('pnc.stand', { age: ago(p.at) })}</span>} right={<>
      <button data-pnc-refresh className={SECT_BTN} disabled={loading} data-tip={sourceTip(p)} onClick={() => void refresh(char)}>
        <RefreshCw className={cn(loading && 'animate-spin')} />{loading ? t('pnc.refreshing') : t('pnc.refresh')}
      </button>
      <button className={SECT_BTN} data-tip={t('pnc.unlinkTip')} onClick={() => unlink(char)}><Link2Off />{t('pnc.unlink')}</button>
    </>}>{t('pnc.sect')}</Sect>
    <div className={ROWS}>
      <div data-pnc-titles className={cn(ROW, 'flex-wrap gap-x-3 py-1 text-[11.5px] text-muted-foreground')}>
        <PncAvatar src={p.img} size={28} tip={sourceTip(p)} />
        <span className="text-foreground/80">{p.titles ? t('pnc.titles', { n: p.titles.owned, total: p.titles.total }) : t('pnc.titles', { n: '–', total: '–' })}</span>
        {p.title && <span>{t('pnc.equipped', { name: p.title })}</span>}
        {p.titleCats.map(c => <span key={c.cat} className="tabular-nums">{c.cat} {c.owned}/{c.total}</span>)}
      </div>
      {!loading && !p.cls && p.cp == null && <Note>{t('pnc.noDetail')}</Note>}
      {errors[char] && <Note className="text-gold">{errors[char]} – {t('pnc.errSub')}</Note>}
    </div>
  </>
}

/** "Link" action on an unlinked character's page. */
export const LinkButton = ({ onClick }: { onClick: () => void }) => (
  <Button data-pnc-link size="xs" variant="ghost" className="h-6 text-[11px] text-muted-foreground" data-tip={t('pnc.linkTip')} onClick={onClick}><Link2 />{t('pnc.link')}</Button>
)
