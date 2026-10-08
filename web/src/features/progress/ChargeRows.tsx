// Charge tiles (Odyle energy, Nightmare attempts, …) and the traffic-light warning list.
import { ChevronRight, Key, KeyRound, Moon, TriangleAlert, Zap, type LucideIcon } from 'lucide-react'
import { U, V, saveUi, bump } from '@/core/state'
import { t } from '@/core/i18n'
import { Slider } from '@/components/ui/slider'
import { ACCENT, Bar, CHIP, CHIP_ON, Sect, StepCol, T_BODY, T_FOOT, T_META, T_SUB, T_TITLE, TILE, TILE_P, TONE, TileIcon, grid, type BoxTone } from '@/components/kit'
import { cn } from '@/lib/utils'
import { resetIn, type Per } from './checklist'
import { chargeFullIn, chargeLight, chargeNow, chargesOf, setCharge, stepCharge, type ChargeDef, type Light } from './charges'
import type { Alert } from './alerts'

export const LIGHT_DOT: Record<Light | 'red' | 'yellow', string> = {
  red: 'bg-red shadow-[0_0_6px_var(--red)]', yellow: 'bg-gold', green: 'bg-green', none: 'bg-dim',
}
const CHARGE_ICON: Record<string, LucideIcon> = { odyle: Zap, nightmare: Moon, shugo: KeyRound, invasion: Key }
const LIGHT_TONE: Record<Light, BoxTone> = { red: 'red', yellow: 'gold', green: 'green', none: 'dim' }
const LIGHT_TXT: Record<Light, string> = { red: TONE.bad, yellow: TONE.warn, green: 'text-muted-foreground', none: 'text-muted-foreground' }

/** Charge tile: icon in the traffic-light colour, status, fill bar (Odyle: slider), value, −/+ column. */
function ChargeTile({ d, char }: { d: ChargeDef; char?: string }) {
  const v = chargeNow(d, char), cap = d.cap(), light = chargeLight(d, char), ms = chargeFullIn(d, char)
  const status = v == null ? t('charge.enter') : ms === 0 ? t('alert.full') : t('alert.fullIn', { d: resetIn(new Date(Date.now() + ms!)) })
  const regen = d.every === 'day' ? t('charge.perDay', { n: d.regen }) : t('charge.perH', { n: d.regen, h: d.every / 3600e3 })
  return (
    <div data-charge={d.id} data-tip={t('charge.tip.' + d.id)} className={cn(TILE, TILE_P, 'pr-0', ACCENT[light])}>
      <TileIcon icon={CHARGE_ICON[d.id]} tone={LIGHT_TONE[light]} tip={light === 'red' || light === 'yellow' ? t('alert.' + light) : undefined} />
      <div className={T_BODY}>
        <span className={T_TITLE}>{t('charge.' + d.id)}</span>
        <div className={cn(T_SUB, LIGHT_TXT[light])}>{status}</div>
        <div className={T_FOOT}>
          {/* Odyle has large values: a slider sets it in one move (keyboard input needs focus, the overlay never takes it). */}
          {d.step > 1
            ? <Slider className="my-[3px]" min={0} max={cap} step={5} value={[v ?? 0]} onValueChange={x => setCharge(d, Array.isArray(x) ? x[0] : x, char)} />
            : <Bar frac={(v ?? 0) / cap} tone={light === 'red' ? 'red' : light === 'yellow' ? 'gold' : 'cyan'} />}
          <div className={T_META}>
            <span className="font-semibold text-foreground">{v ?? '–'}/{cap}</span>
            <span className="truncate text-dim">{regen}</span>
          </div>
        </div>
      </div>
      <StepCol onStep={dir => stepCharge(d, dir, char)} minus={(v ?? 0) > 0} plus={v == null || v < cap} tips={[`−${d.step}`, `+${d.step}`]} />
    </div>
  )
}

/** "Vorräte" section of an owner, with the membership switch on the server section (caps depend on it). */
export function Charges({ per, char }: { per: Per; char?: string }) {
  const list = chargesOf(per)
  if (!list.length) return null
  return <div>
    <Sect sub={'· ' + t('charge.sub')} right={per === 'server' &&
      <button onClick={() => { U.member = !U.member; saveUi(['member']); bump() }} data-tip={t('charge.memberTip')} className={cn(CHIP, 'h-5 px-1.5 text-[11px]', U.member && CHIP_ON)}>
        {t('charge.member')} {U.member ? '✓' : ''}
      </button>}>{t('charge.title')}</Sect>
    <div className={grid('row')}>{list.map(d => <ChargeTile key={d.id} d={d} char={char} />)}</div>
  </div>
}

/** Warning rows; clicking one opens the character's checklist page. */
export function AlertList({ alerts, showChar = true, onOpen }: { alerts: Alert[]; showChar?: boolean; onOpen?: (char: string | null) => void }) {
  if (!alerts.length) return null
  return <div className="flex flex-col gap-1 px-1.5">{alerts.map((a, i) => (
    <button key={i} onClick={() => { V.chkPage = a.char; onOpen?.(a.char); bump() }} data-tip={t('alert.' + a.level)}
      className={cn('group flex min-h-8 min-w-0 items-center gap-2 rounded-sm border bg-card px-2 py-1 text-left text-[12px] leading-snug transition-colors hover:bg-white/5', ACCENT[a.level])}>
      <TriangleAlert className={cn('size-3.5 flex-none', a.level === 'red' ? TONE.bad : TONE.warn)} />
      <span className="min-w-0 flex-1">
        {showChar && <b className="mr-1 font-semibold">{a.char ?? t('chk.server')}:</b>}
        <span className="text-muted-foreground">{a.text}</span>
      </span>
      <ChevronRight className="size-3.5 flex-none text-dim transition-colors group-hover:text-gold" />
    </button>
  ))}</div>
}
