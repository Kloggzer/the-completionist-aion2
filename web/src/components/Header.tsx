import { AppWindow, Globe, Pin, Settings, X, MousePointer2 } from 'lucide-react'
import { G, S, U, V, bump, useApp, type Any } from '@/core/state'
import { host } from '@/core/host'
import { selectMap, mapName } from '@/core/data'
import { hkText } from '@/core/session'
import { t } from '@/core/i18n'
import { soulPets, computeTargets } from '@/features/pets/logic'
import { AppSelect } from './AppSelect'
import { cn } from '@/lib/utils'

const Paw = () => (
  <svg viewBox="0 0 24 24" className="size-[18px] fill-gold"><ellipse cx="12" cy="16" rx="5.2" ry="4.3" /><ellipse cx="5.4" cy="10.4" rx="2.1" ry="2.6" /><ellipse cx="9.4" cy="6.2" rx="2.1" ry="2.8" /><ellipse cx="14.6" cy="6.2" rx="2.1" ry="2.8" /><ellipse cx="18.6" cy="10.4" rx="2.1" ry="2.6" /></svg>
)

const withKey = (label: string, id: string) => { const h = hkText(id); return h ? `${label} (${h})` : label }

export function IconBtn({ on, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return <button {...p} className={cn('grid size-7 flex-none place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4', on && 'bg-gold/15 text-gold', className)} />
}

export function Header() {
  useApp()
  const sp = soulPets(), have = sp.filter((p: Any) => (S.state.levels[p.id] || 0) > 0).length, max = sp.filter((p: Any) => (S.state.levels[p.id] || 0) >= 3).length
  const maps = G.maps.map((m: Any) => {
    const md = G.md[m.key], n = md ? computeTargets(md).filter((x: Any) => !x.done).length : null
    return { value: m.key, label: mapName(m.name) + (n != null ? ` (${n})` : '') }
  })
  return (
    <header className="flex h-10 flex-none items-center gap-1.5 border-b bg-[linear-gradient(#1b2030,#151925)] pr-1 pl-2"
      onWheel={e => { if ((e.target as HTMLElement).closest('[data-slot=select-trigger]')) return; host({ type: 'opacity', v: Math.round((S.settings.opacity + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100 }) }}>
      <div data-drag className="flex flex-none cursor-grab items-center gap-1.5" data-tip={t('hdr.brandState', { have, total: sp.length, max })}>
        <Paw /><b className="font-semibold tracking-wide text-gold">{sp.length ? `${have}/${sp.length}` : '–'}</b>
      </div>
      {maps.length > 0 && <AppSelect value={U.map} options={maps} onChange={k => selectMap(k)} tip={t('hdr.map')} className="h-7 max-w-52" />}
      <span data-drag className="h-full min-w-4 flex-1 cursor-grab" />
      {S.ct && <IconBtn on data-tip={withKey(t('hdr.click'), 'click')} onClick={() => host({ type: 'clickThrough' })}><MousePointer2 /></IconBtn>}
      {S.site && <IconBtn on data-tip={withKey(t('hdr.site'), 'site')} onClick={() => host({ type: 'site', on: false, map: U.map })}><Globe /></IconBtn>}
      {S.dock && <IconBtn on={S.dock.dock !== 'auto'} data-tip={t(S.dock.window ? 'dock.isWindow' : 'dock.isOverlay') + '\n' + t(S.dock.dock === 'auto' ? 'dock.auto' : 'dock.manual')}
        onClick={() => host({ type: 'dock', dock: S.dock.window ? 'overlay' : 'window' })}>{S.dock.window ? <AppWindow /> : <Pin />}</IconBtn>}
      <IconBtn on={V.settingsOpen} data-tip={t('hdr.settings')} onClick={() => { if (S.site) host({ type: 'site', on: false }); V.settingsOpen = !V.settingsOpen; bump() }}><Settings /></IconBtn>
      <IconBtn data-tip={withKey(t('hdr.hide'), 'toggle')} onClick={() => host({ type: 'hide' })}><X /></IconBtn>
    </header>
  )
}
