import { useEffect, useState } from 'react'
import { Plus, Star } from 'lucide-react'
import { useApp } from '@/core/state'
import { toasts, type Toast } from '@/core/toast'
import { cn } from '@/lib/utils'

function Pill({ tt }: { tt: Toast }) {
  // The bar animates from slightly below its value to the value.
  const [w, setW] = useState(Math.max(0, tt.frac - 0.08))
  useEffect(() => { const r = requestAnimationFrame(() => setW(tt.frac)); return () => cancelAnimationFrame(r) }, [tt.frac])
  return (
    <div className={cn('relative flex max-w-full items-center gap-2 overflow-hidden rounded-sm border py-0.5 pr-2.5 pl-0.5 shadow-lg transition-all duration-400',
      tt.up ? 'border-gold bg-[linear-gradient(90deg,#3a2f12f2,#1f2638f2)] shadow-[0_0_22px_#e8c87255]' : 'border-border bg-card/95',
      tt.out && '-translate-x-4 opacity-0')}>
      <span className={cn('grid size-6 flex-none place-items-center rounded-sm', tt.up ? 'bg-gold/20 text-gold' : 'bg-cyan/15 text-cyan')}>
        {tt.up ? <Star className="size-3.5" /> : <Plus className="size-3.5" />}
      </span>
      <span className="truncate text-[14px] font-semibold">{tt.title}</span>
      <span className="flex-none text-[13px] text-muted-foreground">{tt.sub}</span>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
        <i className={cn('block h-full transition-[width] duration-600', tt.up ? 'bg-gold' : 'bg-cyan')} style={{ width: w * 100 + '%' }} />
      </div>
    </div>
  )
}

// Placed by App inside the map (map tabs) or at the bottom of the list (list-only tabs): never over the header or
// the tab bar, and click-through so nothing underneath is blocked.
export function Toasts({ className }: { className?: string }) {
  useApp()
  return (
    <div data-toasts className={cn('pointer-events-none absolute z-40 flex max-w-[calc(100%-16px)] flex-col items-start gap-1', className)}>
      {toasts.map(tt => <Pill key={tt.id} tt={tt} />)}
    </div>
  )
}
