// Session messages from the host: init, settings, pet state, window modes.
import { host, onHost } from './host'
import { DEF_UI, S, setU, bump, type Any } from './state'
import { emit } from './bus'
import { setStartView } from './data'
import { lang, t } from './i18n'

const norm = (st: Any) => Object.assign({ levels: {}, souls: {} }, st || {})

/** Tell the host the effective UI language (tray menu, announcer and alert texts). */
export function syncLang() { host({ type: 'lang', lang: lang() }); document.documentElement.lang = lang() }

onHost('init', m => {
  S.settings = m.settings; S.state = norm(m.state)
  const u = Object.assign(structuredClone(DEF_UI), m.settings.ui || {})
  u.layers = Object.assign({}, DEF_UI.layers, u.layers)
  setU(u)
  setStartView(m.view)
  syncLang()
  emit('init')
  bump()
})
onHost('settings', m => { S.settings = m.settings; emit('recompute'); bump() })
onHost('state', m => { S.state = norm(m.state); emit('state'); emit('recompute'); bump() })
onHost('dock', m => { S.dock = { dock: m.dock, window: m.window }; bump() })
onHost('char', m => { S.state.charName = m.name; bump() })
onHost('clickThrough', m => { S.ct = m.on; document.body.classList.toggle('ct', m.on); bump() })
onHost('zoom', m => { if (S.settings && Math.abs(S.settings.zoom - m.v) > 0.001) { S.settings.zoom = m.v; bump() } })
onHost('opacity', m => { if (S.settings && Math.abs(S.settings.opacity - m.v) > 0.001) { S.settings.opacity = m.v; bump() } })
onHost('siteMode', m => { S.site = m.on; bump(); if (!m.on) requestAnimationFrame(() => emit('draw')) })

// ---------------------------------------------------------------- hotkeys (display text)

export const HK_IDS = ['toggle', 'click', 'site', 'opaUp', 'opaDown', 'zoomIn', 'zoomOut'] as const
const KEY_DE: Record<string, string> = { PageUp: 'Bild ↑', PageDown: 'Bild ↓', Home: 'Pos1', End: 'Ende', Insert: 'Einfg', Delete: 'Entf', Oemplus: '+', OemMinus: '−' }
const KEY_EN: Record<string, string> = { PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End', Insert: 'Ins', Delete: 'Del', Oemplus: '+', OemMinus: '−' }
const MOD_DE: Record<string, string> = { Ctrl: 'Strg', 'Ctrl+Alt': 'Strg+Alt', 'Ctrl+Shift': 'Strg+Shift' }

/** Readable key name ("D5" -> "5", PageUp -> "Bild ↑"). */
export const keyText = (k: string) => (lang() === 'de' ? KEY_DE : KEY_EN)[k] ?? k.replace(/^D(\d)$/, '$1')
export const modText = (m: string) => (m === '' ? t('hk.none') : lang() === 'de' ? MOD_DE[m] ?? m : m)

/** Hotkey of an action as text, e.g. "Strg+Alt+O" ('' if none). */
export function hkText(id: string) {
  const c = S.settings?.hotkeys?.[id]
  return c ? c.split('+').map((p: string) => (lang() === 'de' ? MOD_DE[p] : undefined) ?? keyText(p)).join('+') : ''
}
