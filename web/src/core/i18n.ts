// UI language: German or English. Default = Windows display language (navigator.language in WebView2),
// overridable in the settings (U.lang). Game data names (pets, mobs, bosses) stay as delivered by the data source.
//
// Strings live per feature in src/i18n/<area>.ts as { de: {...}, en: {...} } with namespaced keys
// ("timer.inMin": "{name} in {n} Minuten"). t() falls back to German, then to the key itself.
import { U } from './state'

const mods = import.meta.glob('../i18n/*.ts', { eager: true }) as Record<string, { default: { de: Dict; en: Dict } }>
type Dict = Record<string, string>
const DICT: { de: Dict; en: Dict } = { de: {}, en: {} }
for (const m of Object.values(mods)) addStrings(m.default)

/** Register strings (also used by optional local modules). */
export function addStrings(d: { de: Dict; en: Dict }) { Object.assign(DICT.de, d.de); Object.assign(DICT.en, d.en) }

export type Lang = 'de' | 'en'
export const osLang = (): Lang => (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en'
export const lang = (): Lang => (U.lang === 'de' || U.lang === 'en' ? U.lang : osLang())
/** Locale for numbers/dates: en uses en-GB (24 h clock, day/month order). */
export const locale = () => (lang() === 'de' ? 'de-DE' : 'en-GB')
/** BCP-47 tag for speech synthesis. */
export const ttsLang = () => (lang() === 'de' ? 'de-DE' : 'en-US')

/** Translate key, replacing {var} placeholders. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = DICT[lang()][key] ?? DICT.de[key] ?? key
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  return s
}

/** "HH:MM" in the UI locale. */
export const hm = (ms: number | Date) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
/** Number with thousands separators. */
export const fmt = (n: number) => n.toLocaleString(locale())
