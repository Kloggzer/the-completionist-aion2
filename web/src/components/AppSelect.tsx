// Dropdown used everywhere: shadcn Select (Base UI) rendered in-page. Native <select> popups need an activated
// window, and the overlay never takes focus, so they would not open.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type Option = { value: string; label: string }

export function AppSelect({ value, options, onChange, tip, className, size = 'sm' }: {
  value: string; options: Option[]; onChange: (v: string) => void; tip?: string; className?: string; size?: 'sm' | 'default'
}) {
  return (
    <Select value={value} items={options} onValueChange={v => v != null && onChange(String(v))}>
      <SelectTrigger size={size} data-tip={tip} className={cn('min-w-0', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="max-h-80">
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
