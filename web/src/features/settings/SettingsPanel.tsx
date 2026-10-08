// Settings overlay below the header: category sidebar left (icons only on narrow windows), content right; centred
// with a max width on big windows.
import { Bell, Database, Keyboard, Map as MapIcon, SlidersHorizontal, Target, X } from 'lucide-react'
import { S, U, V, saveUi, bump, useApp } from '@/core/state'
import { t } from '@/core/i18n'
import { Button } from '@/components/ui/button'
import { BAR } from '@/components/kit'
import { General, MapSettings, Filters, Notify, Hotkeys, Data } from './sections'
import { cn } from '@/lib/utils'

const CATS = [
  ['general', SlidersHorizontal, General],
  ['map', MapIcon, MapSettings],
  ['filters', Target, Filters],
  ['notify', Bell, Notify],
  ['hotkeys', Keyboard, Hotkeys],
  ['data', Database, Data],
] as const

export function SettingsPanel() {
  useApp()
  const cat = CATS.find(c => c[0] === U.setCat) || CATS[0]
  const Body = cat[2]
  return (
    <div className="@container absolute inset-x-0 top-10 bottom-0 z-30 flex flex-col bg-background">
      <div className={cn(BAR, 'flex-nowrap pr-1 pl-3')}>
        <span data-drag className="flex h-6 flex-1 cursor-grab items-center text-[13px] font-semibold tracking-wide text-gold">{t('set.title')}</span>
        <Button variant="ghost" size="icon-xs" data-tip={t('common.close')} onClick={() => { V.settingsOpen = false; bump() }}><X className="size-4" /></Button>
      </div>
      {/* Big windows: sidebar + content as one centred column (max 1000 px), the content max 760 px wide. */}
      <div className="mx-auto flex min-h-0 w-full max-w-[1000px] flex-1 @min-[1000px]:border-x">
        <nav className="flex w-48 flex-none flex-col gap-0.5 overflow-y-auto border-r bg-card/50 p-1.5 @max-[520px]:w-11 @max-[520px]:px-1">
          {CATS.map(([k, I]) => (
            <button key={k} data-tip={t('set.cat.' + k)} onClick={() => { U.setCat = k; saveUi(['setCat']); bump() }}
              className={cn('flex h-8 flex-none items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground @max-[520px]:justify-center @max-[520px]:px-0',
                cat[0] === k && 'bg-gold/15 font-semibold text-gold hover:bg-gold/20 hover:text-gold')}>
              <I className="size-4 flex-none" />
              <span className="truncate @max-[520px]:hidden">{t('set.cat.' + k)}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]">
          <div className="max-w-[760px]">{S.settings ? <Body /> : null}</div>
        </div>
      </div>
    </div>
  )
}
