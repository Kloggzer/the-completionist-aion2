// Tab navigation (shared by the tab bar and the overview cards).
import { MAP_TABS, U, V, saveUi, bump } from './state'
import { emit } from './bus'

/** Switch tab. `focus` = selector of an element to scroll into view (e.g. the tile selected from the overview). */
export function goTab(k: string, focus?: string) {
  U.tab = k; saveUi(['tab']); V.settingsOpen = false; bump(); emit('draw')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = focus && document.querySelector(focus)
    if (el) el.scrollIntoView({ block: 'center' }); else document.querySelector('[data-list]')?.scrollTo(0, 0)
    if (focus && MAP_TABS.includes(k)) emit('fit')
  }))
}
