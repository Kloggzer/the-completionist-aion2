// Shared app state: plain mutable objects, components re-render on bump().
//   S = host/session state (settings, pet state, window modes)
//   U = persisted UI prefs (saved into settings.json via the host, see saveUi)
//   G = game data (pets, maps, timers, achievements, drops)
//   V = transient view state (selection, announce bookkeeping)
import { useSyncExternalStore } from 'react'
import { host } from './host'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Any = any

export const NEED = [5, 25, 75]
/** Tabs that show the map; the others get the whole height (the tab bar moves up under the header). */
export const MAP_TABS = ['targets', 'spots']

export const DEF_UI: Any = {
  map: '', sort: 'prio', hideNamed: false, lvMin: 1, lvMax: 60, tab: 'home', toasts: true, showLv3: false,
  layers: { spawns: true, spots: true, cubes: true, labels: true }, cubes: {}, mapH: 0.42, mapW: 0.55,
  view: 'both', mapStyle: 'map',
}

export const S: Any = { settings: null, state: { levels: {}, souls: {} }, site: false, ct: false }
export let U: Any = structuredClone(DEF_UI)
export const G: Any = { pets: [], petById: new Map(), maps: [], md: {}, loading: {}, timers: null, ach: null, achById: null, drops: null, force: false }
export const V: Any = { sel: null, spot: null, cube: null, achSel: null, targets: [], spots: [], hover: null, announced: new Set(), said: new Set(), settingsOpen: false, mapMsg: '', multi: new Set<number>(), spotsSel: false }

export function setU(next: Any) { U = next }

/** Persist UI prefs: the host merges them into settings.json (Ui object). */
export function saveUi(keys: string[]) {
  const patch: Any = {}
  for (const k of keys) patch[k] = U[k]
  host({ type: 'ui', patch })
}

// ---------------------------------------------------------------- re-render

let ver = 0
const subs = new Set<() => void>()
let queued = false
/** Re-render all components (batched per frame). */
export function bump() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => { queued = false; ver++; subs.forEach(f => f()) })
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** Subscribe a component to bump(). */
export function useApp() { return useSyncExternalStore(subscribe, () => ver) }

// ---------------------------------------------------------------- small helpers

export const esc = (s: unknown) => String(s ?? '')
/** Pets highlighted on the map: the multi-selection plus the single selected tile. */
export const selIds = (): Set<number> => { const s = new Set<number>(V.multi); if (V.sel) s.add(V.sel); return s }
