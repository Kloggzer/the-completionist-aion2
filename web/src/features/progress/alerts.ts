// "You need to act" warnings with a traffic light: charges about to overflow, and open items shortly before a
// reset. One alert per owner and reason, worst first.
import { t } from '@/core/i18n'
import { CHECK, LAST_DAY, TIER, characters, checkCount, nextReset, resetIn, type Per } from './checklist'
import { CHARGES, chargeFullIn, chargeLight, chargeNow } from './charges'

export type Level = 'red' | 'yellow'
export type Alert = { level: Level; char: string | null; text: string }

const H = 3600e3
const fullText = (ms: number) => (ms <= 0 ? t('alert.full') : t('alert.fullIn', { d: resetIn(new Date(Date.now() + ms)) }))

function ownerAlerts(per: Per, char: string | null): Alert[] {
  const out: Alert[] = [], now = Date.now(), c = char ?? undefined
  for (const d of CHARGES) {
    if (d.per !== per) continue
    const light = chargeLight(d, c)
    if (light !== 'red' && light !== 'yellow') continue
    out.push({ level: light, char, text: `${t('charge.' + d.id)} ${chargeNow(d, c)}/${d.cap()} · ${fullText(chargeFullIn(d, c)!)} – ${t('charge.act.' + d.id)}` })
  }
  // Open weekly items before the weekly reset, open daily musts shortly before the daily reset.
  const wLeft = nextReset('w').getTime() - now, dLeft = nextReset('d').getTime() - now
  for (const [kind, items] of CHECK) {
    const left = kind === 'w' ? wLeft : dLeft
    const red: string[] = [], yellow: string[] = []
    for (const [id, max, p] of items) {
      if (p !== per || checkCount(id, p, kind, c) >= max) continue
      const tier = TIER[id] ?? 2, name = `${t('progress.item.' + id)} ${checkCount(id, p, kind, c)}/${max}`
      if (kind === 'w') {
        if (left < 24 * H && tier <= 1) red.push(name)
        else if ((left < 24 * H && tier === 2) || (left < 48 * H && tier === 1) || (LAST_DAY.has(id) && left < 24 * H)) yellow.push(name)
      } else if (left < 4 * H && tier === 1) yellow.push(name)
    }
    const reset = t(kind === 'w' ? 'alert.weekly' : 'alert.daily', { d: resetIn(new Date(now + left)) })
    if (red.length) out.push({ level: 'red', char, text: `${reset} · ${red.join(', ')}` })
    if (yellow.length) out.push({ level: 'yellow', char, text: `${reset} · ${yellow.join(', ')}` })
  }
  return out
}

/** All warnings: server first, then every known character; red before yellow. */
export function alerts(): Alert[] {
  const all = [...ownerAlerts('server', null), ...characters().flatMap(ch => ownerAlerts('char', ch))]
  return all.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1))
}

/** Worst light of one owner (for the dot on a character row). */
export function ownerLevel(per: Per, char: string | null): Level | null {
  const a = ownerAlerts(per, char)
  return a.some(x => x.level === 'red') ? 'red' : a.length ? 'yellow' : null
}
export const ownerAlertsOf = ownerAlerts
