// First start: a short welcome card – what the app does and that progress is entered by hand.
import { S, U, saveUi, bump, useApp } from '@/core/state'
import { t } from '@/core/i18n'
import { Button } from '@/components/ui/button'
import { rich } from '@/components/kit'

export function Welcome() {
  useApp()
  if (!S.settings || U.welcomed) return null
  const done = () => { U.welcomed = 1; saveUi(['welcomed']); bump() }
  return (
    <div data-welcome className="@container absolute inset-x-0 top-10 bottom-0 z-40 overflow-y-auto bg-background/95 p-3 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[640px] flex-col gap-2.5">
        <h1 className="text-[15px] font-semibold tracking-wide text-gold">{t('welcome.title')}</h1>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{t('welcome.intro')}</p>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-snug text-muted-foreground marker:text-dim">
          {['pets', 'progress', 'events', 'data'].map(k => <li key={k}>{rich(t('welcome.' + k))}</li>)}
        </ul>
        <Button size="sm" className="self-start" onClick={done}>{t('welcome.start')}</Button>
      </div>
    </div>
  )
}
