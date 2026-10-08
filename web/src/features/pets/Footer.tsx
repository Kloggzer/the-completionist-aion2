// Footer: when the pet progress was last changed by hand. Doubles as a window drag zone.
import { useEffect, useState } from 'react'
import { S, useApp } from '@/core/state'
import { t } from '@/core/i18n'

const agoTxt = (ms: number) => {
  const m = Math.round(ms / 60000)
  if (m < 1) return t('pets.age.now')
  if (m < 60) return t('pets.age.min', { n: m })
  if (m < 48 * 60) return t('pets.age.h', { n: Math.round(m / 60) })
  const d = Math.round(m / 1440)
  return t(d === 1 ? 'pets.age.d.one' : 'pets.age.d.other', { n: d })
}

export function Footer() {
  useApp()
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(id) }, [])
  const u = S.state.updatedAt ? new Date(S.state.updatedAt).getTime() : 0
  const text = u ? t('pets.age.manual', { ago: agoTxt(Date.now() - u) }) : t('pets.age.manualNone')
  return (
    <footer className="flex flex-none items-center justify-between gap-2 border-t bg-card py-1 pr-5 pl-2 text-[11px] text-dim">
      <span data-drag data-tip={t('pets.age.manualTip')} className="min-w-0 flex-1 cursor-grab truncate">{text}</span>
    </footer>
  )
}
