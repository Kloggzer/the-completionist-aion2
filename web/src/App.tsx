import { useEffect, useRef } from 'react'
import { Clock, LayoutDashboard, ListChecks, MapPin, PawPrint, Skull, Trophy, type LucideIcon } from 'lucide-react'
import { MAP_TABS, S, U, V, saveUi, bump, useApp } from '@/core/state'
import { host } from '@/core/host'
import { goTab } from '@/core/nav'
import { t } from '@/core/i18n'
import { Header } from '@/components/Header'
import { Toasts } from '@/components/Toasts'
import { HoverTip } from '@/components/HoverTip'
import { MapView } from '@/features/map/MapView'
import { TargetsTab } from '@/features/pets/TargetsTab'
import { SpotsTab } from '@/features/pets/SpotsTab'
import { Footer } from '@/features/pets/Footer'
import { Toolbar } from '@/features/pets/parts'
import { TimerTab } from '@/features/events/TimerTab'
import { BossTab } from '@/features/events/BossTab'
import { CheckTab } from '@/features/progress/CheckTab'
import { AchTab } from '@/features/progress/AchTab'
import { achOpenCount } from '@/features/progress/achievements'
import { SettingsPanel } from '@/features/settings/SettingsPanel'
import { HomeTab } from '@/features/home/HomeTab'
import { Welcome } from '@/features/home/Welcome'
import { cn } from '@/lib/utils'
import { BADGE } from '@/components/kit'

const TABS = ['home', 'targets', 'spots', 'ach', 'check', 'boss', 'timer'] as const
const TAB_ICON: Record<string, LucideIcon> = { home: LayoutDashboard, targets: PawPrint, spots: MapPin, ach: Trophy, check: ListChecks, boss: Skull, timer: Clock }
/** Pet freshness footer only where pet progress is shown. */
const FOOTER_TABS = ['targets', 'spots']


// Mousedown on a [data-drag] area moves the window (the host starts a native move). Controls stay clickable.
function useWindowDrag() {
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (el.closest('button, input, a, [role=combobox], [role=listbox], [data-slot=select-trigger]')) return
      if (el.closest('[data-drag]')) { e.preventDefault(); host({ type: 'drag' }) }
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [])
}

// Between map and list: drags the map height, or its width when map and list sit side by side (wide windows).
function Splitter() {
  const ref = useRef<HTMLDivElement>(null)
  const down = (e: React.PointerEvent) => {
    const split = ref.current!.parentElement!, r = split.getBoundingClientRect(), row = getComputedStyle(split).flexDirection === 'row'
    const mv = (ev: PointerEvent) => {
      if (row) U.mapW = Math.min(0.75, Math.max(0.25, (ev.clientX - r.left) / r.width))
      else U.mapH = Math.min(0.8, Math.max(0.15, (ev.clientY - r.top) / r.height))
      bump()
    }
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); saveUi([row ? 'mapW' : 'mapH']) }
    addEventListener('pointermove', mv); addEventListener('pointerup', up)
    e.preventDefault()
  }
  return <div ref={ref} onPointerDown={down} data-tip={t('split.tip')}
    className={cn('h-1.5 flex-none cursor-row-resize bg-border/60 transition-colors hover:bg-gold/50', '@min-[1100px]/main:h-auto @min-[1100px]/main:w-1.5 @min-[1100px]/main:cursor-col-resize')} />
}

// Icons always; labels while there is room. On narrow windows (container < 560 px) only the active tab keeps its
// label, so the bar never scrolls or cuts tabs off. The overview tab is icon-only.
function TabBar() {
  const count: Record<string, number> = {
    targets: V.targets.filter((x: { done: boolean }) => !x.done).length, spots: V.spots.length, ach: achOpenCount(),
  }
  return (
    <nav data-tabs className="@container flex-none border-b bg-card">
      <div className="flex gap-0.5 px-1">
        {TABS.map(k => {
          const I = TAB_ICON[k], on = U.tab === k
          return (
            <button key={k} onClick={() => goTab(k)} data-tip={t('tab.' + k + '.tip')}
              className={cn('flex min-w-0 items-center justify-center gap-1.5 border-b-2 border-transparent px-2 pt-2 pb-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground',
                k === 'home' ? 'flex-none' : 'flex-[1_1_auto] @min-[560px]:flex-none', on && 'border-gold text-foreground')}>
              <I className={cn('size-3.5 flex-none', on && 'text-gold')} />
              {k !== 'home' && <span className={cn('truncate', !on && '@max-[559px]:hidden')}>{t('tab.' + k)}</span>}
              {count[k] > 0 && <i className={cn(BADGE, !on && '@max-[379px]:hidden')}>{count[k]}</i>}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function List() {
  switch (U.tab) {
    case 'spots': return <SpotsTab />
    case 'ach': return <AchTab />
    case 'check': return <CheckTab />
    case 'boss': return <BossTab />
    case 'timer': return <TimerTab />
    case 'home': return <HomeTab />
    default: return <TargetsTab />
  }
}

// Fixed frame on every tab: header, tab bar, content. Map tabs show the map at the top of their content (resizable),
// then their toolbar (filters + view switch), then the list; from 1100 px content width (container query on main) the
// map sits left and toolbar + list right. The other
// tabs use the whole content.
export default function App() {
  useApp()
  useWindowDrag()
  const mapTab = MAP_TABS.includes(U.tab), view = mapTab ? U.view || 'both' : 'list', both = view === 'both'
  const size = { '--map-h': Math.round(U.mapH * 100) + '%', '--map-w': Math.round((U.mapW ?? 0.55) * 100) + '%' } as React.CSSProperties
  return (
    <div className={cn('relative flex h-full flex-col', S.ct && 'pointer-events-none')}>
      <Header />
      <TabBar />
      <main className={cn('@container/main flex min-h-0 flex-1 flex-col', S.site && 'invisible')}>
        <div data-split className={cn('flex min-h-0 flex-1 flex-col', both && '@min-[1100px]/main:flex-row')} style={size}>
          <section className={cn('relative min-h-0 min-w-0', view === 'list' ? 'hidden' : view === 'map' ? 'flex-1' : 'h-(--map-h) flex-none',
            both && '@min-[1100px]/main:h-auto @min-[1100px]/main:w-(--map-w)')}>
            <MapView />
            {view !== 'list' && <Toasts className="top-9 left-1.5" />}
          </section>
          {both && <Splitter />}
          <div className={cn('flex min-h-0 min-w-0 flex-col', view === 'map' ? 'flex-none' : 'flex-1')}>
            {mapTab && <Toolbar kind={U.tab} />}
            {view !== 'map' && (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <section data-list className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                  <List />
                </section>
                {view === 'list' && <Toasts className="bottom-2 left-2" />}
              </div>
            )}
          </div>
        </div>
        {FOOTER_TABS.includes(U.tab) && <Footer />}
      </main>
      {V.settingsOpen && <SettingsPanel />}
      <Welcome />
      <HoverTip />
    </div>
  )
}
