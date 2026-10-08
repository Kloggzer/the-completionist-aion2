// Shared building blocks of every view: one page frame, one top bar, one section header, one tile, one flat row, one
// chip, one bar. Spacing scale: 4 px gaps (gap-1), 6 px outer padding (px-1.5), 10 px text inset (px-2.5). Type
// scale: section 10.5 px caps, title 12.5 px semibold, text 12.5 px, sub 11.5 px muted, meta 11 px. Radius: rounded-sm.
// Icons: 14 px (size-3.5) in rows and bars, 28 px / stroke 1.5 in tile icon columns, 18 px in bell / step columns.
//
// Responsive system (container queries, never the viewport: the overlay can be any size):
// - Every tab renders inside <Page>: full width and dense at overlay sizes, centred with a max width on large
//   windows (tiles 1680 px, rows 1400 px, forms 760 px). The page is the @container all breakpoints below refer to.
// - Every tab has one bar at the top of its list (BAR, 32 px): info text left (its empty space drags the window),
//   filter chips / actions right-aligned (<BarRight>). Map tabs: <ToolbarStrip> between map and list; the other
//   tabs: <Page bar={…}> (sticky, full width, content aligned with the page).
// - Tile grids (grid()): auto-fill columns with a minimum tile width that grows on wide pages, so tiles never get
//   narrower than readable nor wider than ~2x their minimum, and a maximized window shows 6-8 columns, not 15.
// - Row lists (<Columns>): one column up to 900 px, then 2, from 1300 px 3 columns of row blocks (day groups,
//   overview blocks) instead of rows stretched over the full width.
// - Tiles have one anatomy (T_* classes): one-line title, two-line sub, bar + footer at the bottom, so all tiles of
//   a grid are equally high; portrait tiles (TILE_P) put a square portrait / icon column left of that text column,
//   optional control columns (bell, −/+) at the right edge.
// - Breakpoints: 520 (overlay wide), 900 (2 columns / bigger tiles), 1300 (3 columns / biggest tiles). The map tabs
//   switch to map left / list right at 1100 px content width (App.tsx).
import { Fragment, useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { Bell, BellOff, ChevronRight, Minus, Plus, type LucideIcon } from 'lucide-react'
import { host } from '@/core/host'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------- text + layout classes

export const TITLE = 'text-[12.5px] leading-tight font-semibold [overflow-wrap:anywhere]'
export const SUB = 'text-[11.5px] leading-tight text-muted-foreground [overflow-wrap:anywhere]'
export const META = 'text-[11px] text-muted-foreground tabular-nums'
export const CLAMP2 = 'line-clamp-2'
/** Gap above a tile grid / row list that starts right below the bar (no section header in between). */
export const LEAD = 'pt-1.5'

/** Status text colours, the same meaning in every tab. */
export const TONE = { ok: 'text-green', warn: 'text-gold', bad: 'text-red', info: 'text-cyan', off: 'text-dim' } as const
/** Tinted boxes (tile icon columns, badges). */
export const BOX = {
  gold: 'text-gold bg-gold/10 border-gold/25', cyan: 'text-cyan bg-cyan/10 border-cyan/25', green: 'text-green bg-green/10 border-green/30',
  red: 'text-red bg-red/10 border-red/35', purple: 'text-purple bg-purple/10 border-purple/25', dim: 'text-dim bg-white/[0.03] border-white/10',
} as const
export type BoxTone = keyof typeof BOX
/** Tile border accent per traffic light. */
export const ACCENT = { red: 'border-red/50 bg-red/[0.06]', yellow: 'border-gold/40', green: 'border-green/30', none: '' } as const

/** Tile grid sizes: minimum tile width per page width (px): base / page >= 900 / page >= 1300. */
const TILE_W = {
  boss: '[--tile:165px] @min-[900px]:[--tile:210px] @min-[1300px]:[--tile:230px]', // boss cards (portrait + bell)
  pet: '[--tile:160px] @min-[900px]:[--tile:200px] @min-[1300px]:[--tile:220px]', // portrait tiles: pets, nearby, spots, achievements
  md: '[--tile:150px] @min-[900px]:[--tile:190px] @min-[1300px]:[--tile:215px]', // small text tiles
  row: '[--tile:230px] @min-[900px]:[--tile:260px] @min-[1300px]:[--tile:280px]', // checklist / charge / character tiles (with −/+)
}
export type TileSize = keyof typeof TILE_W

/** Responsive tile grid (inside a <Page>): auto-fill columns, min tile width grows with the page width. */
export const grid = (size: TileSize = 'md') =>
  cn('grid grid-cols-[repeat(auto-fill,minmax(min(var(--tile),100%),1fr))] gap-1 px-1.5 pb-1', TILE_W[size])

/** Top bar of a tab (32 px): info left, chips right. */
export const BAR = 'flex min-h-8 flex-none flex-wrap items-center gap-x-1.5 gap-y-1 border-b bg-card px-1.5 py-1 text-[12px] text-muted-foreground'

/** Page frame of every tab: the container the responsive rules query, centred with a max width on big windows.
 *  `bar` = the tab's top bar (sticky, full width, its content aligned with the page). */
const PAGE_W = { tiles: 'max-w-[1680px]', rows: 'max-w-[1400px]', form: 'max-w-[760px]' }
export function Page({ w = 'tiles', bar, children, className }: { w?: keyof typeof PAGE_W; bar?: ReactNode; children: ReactNode; className?: string }) {
  return <>
    {bar && <div data-bar className="sticky top-0 z-10 border-b bg-card"><div className={cn(BAR, 'mx-auto w-full border-b-0', PAGE_W[w])}>{bar}</div></div>}
    <div className={cn('@container mx-auto w-full min-w-0 pb-2', PAGE_W[w], className)}>{children}</div>
  </>
}

/** Blocks of rows side by side on wide pages: 1 column, 2 from 900 px, 3 from 1300 px. Children are the blocks. */
export function Columns({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid items-start gap-x-4 @min-[900px]:grid-cols-2 @min-[1300px]:grid-cols-3 [&>*]:min-w-0', className)}>{children}</div>
}

/** Tile: bordered box with title / sub / bar / footer slots (use the classes above inside). */
export const TILE = 'flex min-w-0 flex-col overflow-hidden rounded-sm border bg-card px-1.5 pt-1 pb-0.5 text-left'
/** Tile anatomy, the same in every grid so tiles in a row line up: a one-line title (full text in the tooltip), a sub
 *  text that always takes exactly two lines, then bar + footer pinned to the bottom (T_FOOT). */
export const T_TITLE = cn(TITLE, 'truncate')
export const T_SUB = cn(SUB, 'mt-0.5 line-clamp-2 min-h-[2lh]')
export const T_FOOT = 'mt-auto'
/** Footer line of a tile: value left, extras right. */
export const T_META = 'flex min-w-0 items-center justify-between gap-1.5 text-[11px] text-muted-foreground tabular-nums'
/** Portrait tile: square portrait column at the left edge (60 px, 64 px on wide pages), text column right of it. */
export const TILE_P = 'flex-row items-stretch gap-2 p-1 pr-1.5'
// Hidden in narrow windows (the overlay next to the game): text first; from 700 px a compact square.
export const T_PORTRAIT = 'hidden @min-[700px]:inline-grid size-[44px] @min-[1300px]:size-[52px]'
export const T_BODY = 'flex min-w-0 flex-1 flex-col'
export const TILE_CLICK = 'cursor-pointer transition-colors hover:border-gold/40 hover:bg-accent/40'
export const TILE_SEL = 'border-gold bg-gold/[0.06] ring-1 ring-gold/60 hover:border-gold hover:bg-gold/[0.06]'

/** Flat row with a hairline separator (lists without frames). */
export const ROW = 'flex min-h-8 min-w-0 items-center gap-2 border-b border-border/40 px-2.5 text-[12.5px]'
export const ROW_CLICK = 'cursor-pointer hover:bg-white/5'
/** Hairline above a block of ROWs. */
export const ROWS = 'border-t border-border/40'
/** Icon slot of a row (time | icon | name …). */
export const ROW_ICON = 'grid w-[22px] flex-none place-items-center [&_svg]:size-3.5'

/** Toggle chip (filters) – same look in every bar, 24 px high like the dropdowns. */
export const CHIP = 'inline-flex h-6 flex-none items-center gap-1 rounded-sm border px-2 text-[12px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5'
export const CHIP_ON = 'border-gold/55 bg-gold/10 text-foreground'

/** Small count badge (tab bar, headers). */
export const BADGE = 'rounded-sm bg-accent px-1 text-[11px] font-semibold not-italic text-muted-foreground tabular-nums'

/** Small action at the right of a section header ("Alle erledigt", "Mitgliedschaft"). */
export const SECT_BTN = 'flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground [&_svg]:size-3'

// ---------------------------------------------------------------- components

/** Section header: small caps line; `sub` inline after it, `right` (link/action) at the end. */
export function Sect({ children, sub, right, className }: { children: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-6 items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wider text-dim uppercase', className)}>
      <span className="flex-none">{children}</span>
      {sub && <span className="min-w-0 truncate font-normal tracking-normal normal-case">{sub}</span>}
      {right && <span className="ml-auto flex flex-none items-center gap-1 font-normal tracking-normal normal-case">{right}</span>}
    </div>
  )
}

/** "alle Timer ›" style link at the right of a section header. */
export function More({ onClick, children, tip }: { onClick: () => void; children: ReactNode; tip?: string }) {
  return (
    <button onClick={onClick} data-tip={tip} className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-gold">
      {children}<ChevronRight className="size-3" />
    </button>
  )
}

/** Thin progress bar, frac 0..1. cyan = unlocking, gold = levelling / filling up, green = progress/done, red = overflowing. */
export function Bar({ frac, tone = 'green', className }: { frac: number; tone?: 'cyan' | 'gold' | 'green' | 'red' | 'dim'; className?: string }) {
  const fill = { cyan: 'bg-cyan', gold: 'bg-gold', red: 'bg-red', dim: 'bg-dim', green: frac >= 1 ? 'bg-green' : 'bg-linear-to-r from-green to-cyan' }[tone]
  return (
    <div className={cn('my-1 h-[3px] flex-none overflow-hidden bg-white/[0.07]', className)}>
      <i className={cn('block h-full', fill)} style={{ width: Math.min(100, Math.max(0, frac * 100)) + '%' }} />
    </div>
  )
}

/** Info text at the left of a bar: one line, truncated; its empty space drags the window. */
export function BarInfo({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <span data-drag data-tip={tip} className="min-w-0 flex-[1_1_9rem] cursor-grab truncate px-1 text-[11.5px] leading-6 text-muted-foreground [&_svg]:inline [&_svg]:size-3 [&_svg]:align-[-2px]">
      {children}
    </span>
  )
}
/** Right-aligned group of a bar (filter chips, actions). */
export function BarRight({ children }: { children: ReactNode }) {
  return <span className="ml-auto flex flex-wrap items-center justify-end gap-1">{children}</span>
}

/** Toolbar strip of the map tabs (between map and list): the same bar, controls left, drag space, controls right. */
export function ToolbarStrip({ children }: { children: ReactNode }) {
  return <div className={BAR}>{children}</div>
}

/** Empty / loading state of a whole tab. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3.5 py-5 text-center text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>
}
/** Empty state inside a section (one muted line). */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(SUB, 'px-2.5 py-1', className)}>{children}</p>
}
/** Explanation at the end of a page. */
export function Foot({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-2 text-[11px] leading-normal text-dim">{children}</p>
}

/** Icon column of a tile (same size as a portrait), tinted. */
export function TileIcon({ icon: I, tone, tip, className, children }: { icon?: LucideIcon; tone: BoxTone; tip?: string; className?: string; children?: ReactNode }) {
  return (
    <span data-tip={tip} className={cn(T_PORTRAIT, 'relative grid flex-none place-items-center rounded-sm border', BOX[tone], className)}>
      {I && <I className="size-7" strokeWidth={1.5} />}{children}
    </span>
  )
}

/** −/+ column at the right edge of a tile (+ above, − below), full tile height so both are easy to hit.
 *  The tile needs TILE_P + 'pr-0'. */
export function StepCol({ onStep, minus = true, plus = true, tips }: { onStep: (d: 1 | -1) => void; minus?: boolean; plus?: boolean; tips: [string, string] }) {
  const b = 'flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-white/10 hover:text-gold disabled:pointer-events-none disabled:opacity-25 [&_svg]:size-4.5'
  return (
    <span className="-my-1 flex w-10 flex-none flex-col self-stretch border-l">
      <button className={b} disabled={!plus} data-tip={tips[1]} onClick={e => { e.stopPropagation(); onStep(1) }}><Plus /></button>
      <button className={cn(b, 'border-t')} disabled={!minus} data-tip={tips[0]} onClick={e => { e.stopPropagation(); onStep(-1) }}><Minus /></button>
    </span>
  )
}

/** Big bell toggle at the right end of an event row or tile: full height, wide hit area. */
export function BellBtn({ on, onClick, tip, className }: { on: boolean; onClick: (e: MouseEvent) => void; tip: string; className?: string }) {
  return (
    <button onClick={onClick} data-tip={tip}
      className={cn('flex w-10 flex-none items-center justify-center self-stretch transition-colors', on ? 'bg-gold/10 text-gold hover:bg-gold/20' : 'text-dim hover:bg-white/10 hover:text-muted-foreground', className)}>
      {on ? <Bell className="size-4.5" /> : <BellOff className="size-4.5" />}
    </button>
  )
}

/** Hint box (how-to hints etc.). */
export function Hint({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'cyan' }) {
  return (
    <div className={cn('mx-1.5 mt-1.5 rounded-sm border px-2.5 py-1.5 text-[12px] leading-snug text-muted-foreground',
      tone === 'gold' ? 'border-gold/30 bg-gold/[0.06]' : 'border-cyan/25 bg-cyan/[0.05]')}>{children}</div>
  )
}

/** Translated text with **bold** parts and {slot} placeholders replaced by elements (links, buttons). */
export function rich(s: string, slots: Record<string, ReactNode> = {}) {
  return s.split(/(\*\*.+?\*\*|\{\w+\})/).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <b key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</b>
    const slot = /^\{(\w+)\}$/.exec(p)?.[1]
    return <Fragment key={i}>{slot && slot in slots ? slots[slot] : p}</Fragment>
  })
}

/** Single-line text field. The overlay never takes the keyboard: while the field has focus the host lets the window
 *  activate (host message 'typing'). Enter submits, Escape cancels. */
export function TextEntry({ value, onChange, onSubmit, onCancel, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; onCancel?: () => void; placeholder?: string; className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); return () => host({ type: 'typing', on: false }) }, [])
  return (
    <input ref={ref} value={value} placeholder={placeholder} maxLength={40} spellCheck={false}
      onFocus={() => host({ type: 'typing', on: true })} onBlur={() => host({ type: 'typing', on: false })}
      onChange={e => onChange(e.target.value)} onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter') onSubmit(); else if (e.key === 'Escape') onCancel?.() }}
      className={cn('h-7 min-w-0 rounded-sm border bg-background/60 px-2 text-[12.5px] text-foreground outline-none placeholder:text-dim focus:border-gold/60', className)} />
  )
}

/** Small labelled −/+ stepper (popovers, manual entry). */
export function MiniStepper({ label, value, onStep, minus = true, plus = true, tips }: {
  label: ReactNode; value: ReactNode; onStep: (d: 1 | -1) => void; minus?: boolean; plus?: boolean; tips?: [string, string]
}) {
  const b = 'grid size-6 flex-none place-items-center rounded-sm border text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5'
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
      <button className={b} disabled={!minus} data-tip={tips?.[0]} onClick={e => { e.stopPropagation(); onStep(-1) }}><Minus /></button>
      <output className="min-w-10 text-center font-semibold text-foreground tabular-nums">{value}</output>
      <button className={b} disabled={!plus} data-tip={tips?.[1]} onClick={e => { e.stopPropagation(); onStep(1) }}><Plus /></button>
    </div>
  )
}
