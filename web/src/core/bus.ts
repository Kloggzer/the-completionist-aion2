// Tiny event bus between feature modules (avoids import cycles between data, pets, map, events, progress).
//
// Events in use:
//   'base'       game base data loaded (pets, maps index, timers.json available)       -> timers load, …
//   'allMaps'    every map's data loaded in the background                             -> map picker counts
//   'recompute'  pet state / filters / map changed: rebuild targets + spots            -> pets feature (V.targets, V.spots)
//   'fit'        fit the map view to the current selection                             -> map feature
//   'draw'       repaint the canvas                                                    -> map feature
//   'mapShown'   a map finished loading and is now U.map                               -> anyone
type F = (...a: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any
const subs = new Map<string, F[]>()

export function on(ev: string, f: F) { subs.set(ev, [...(subs.get(ev) || []), f]) }
export function emit(ev: string, ...args: unknown[]) { for (const f of subs.get(ev) || []) f(...args) }
