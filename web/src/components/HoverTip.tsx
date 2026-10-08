// One tooltip for the whole app (shadcn Tooltip on Base UI): any element with data-tip="…" gets it after a short
// delay. Anchored to the hovered element, rendered in a portal above everything and click-through. Multi-line
// text via "\n". The text is read on every render, so it follows state changes (e.g. a toggled bell).
import { useEffect, useState } from 'react'
import { useApp } from '@/core/state'
import { Tooltip, TooltipContent } from '@/components/ui/tooltip'

const DELAY = 300

export function HoverTip() {
  useApp()
  const [el, setEl] = useState<Element | null>(null)
  useEffect(() => {
    let cur: Element | null = null, timer = 0, shown = false
    const show = (e: Element | null) => { shown = !!e; setEl(e) }
    const over = (ev: PointerEvent) => {
      const e = (ev.target as Element).closest?.('[data-tip]') ?? null
      if (e === cur) return
      cur = e; clearTimeout(timer)
      if (!e) { timer = window.setTimeout(() => show(null), 80); return }
      // Moving from one tip to the next switches at once; the first one waits a little.
      timer = window.setTimeout(() => show(e), shown ? 0 : DELAY)
    }
    const hide = () => { cur = null; clearTimeout(timer); show(null) }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerdown', hide, true)
    document.documentElement.addEventListener('pointerleave', hide)
    document.addEventListener('wheel', hide, { passive: true })
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerdown', hide, true)
      document.documentElement.removeEventListener('pointerleave', hide)
      document.removeEventListener('wheel', hide)
    }
  }, [])
  const text = el?.isConnected ? el.getAttribute('data-tip') : null
  return (
    <Tooltip open={!!text}>
      <TooltipContent anchor={el} side="bottom" sideOffset={6}>{text}</TooltipContent>
    </Tooltip>
  )
}
