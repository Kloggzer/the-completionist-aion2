// Building blocks of the settings panel: groups, rows, toggles, steppers.
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Sect } from '@/components/kit'

export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      {title && <Sect className="px-0.5 pt-0">{title}</Sect>}
      <div className="divide-y divide-border/60 rounded-sm border bg-card">{children}</div>
    </section>
  )
}

/** Label + muted sub text left, control right; wraps below on narrow widths. */
export function Row({ label, sub, children, subClass }: { label: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; subClass?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
      <div className="min-w-0 flex-[1_1_10rem]">
        <div className="text-[13px] leading-snug">{label}</div>
        {sub && <div className={cn('mt-0.5 text-xs leading-snug break-words text-muted-foreground', subClass)}>{sub}</div>}
      </div>
      {children != null && <div className="flex flex-none items-center gap-1.5">{children}</div>}
    </div>
  )
}

export function Toggle({ label, sub, on, onChange }: { label: React.ReactNode; sub?: React.ReactNode; on: boolean; onChange: () => void }) {
  return <Row label={label} sub={sub}><Switch checked={on} onCheckedChange={onChange} /></Row>
}

export function Stepper({ label, sub, value, onStep, minus, plus }: {
  label: React.ReactNode; sub?: React.ReactNode; value: React.ReactNode; onStep: (d: 1 | -1) => void; minus?: boolean; plus?: boolean
}) {
  return (
    <Row label={label} sub={sub}>
      <Button variant="outline" size="icon-sm" disabled={minus === false} onClick={() => onStep(-1)}><Minus /></Button>
      <output className="min-w-12 text-center text-[13px] font-semibold tabular-nums">{value}</output>
      <Button variant="outline" size="icon-sm" disabled={plus === false} onClick={() => onStep(1)}><Plus /></Button>
    </Row>
  )
}
