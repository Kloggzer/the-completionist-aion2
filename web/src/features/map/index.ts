// Map feature: host messages and bus events (registered at import).
import { onHost } from '@/core/host'
import { on } from '@/core/bus'
import { draw, fit, mergeSiteCubes } from './engine'

export { draw, fit } from './engine'

onHost('siteCubes', m => mergeSiteCubes(m.cubes))

on('draw', draw)
on('fit', fit)
// The pets feature rebuilds V.targets / V.spots on 'recompute' too: run after it.
on('recompute', () => queueMicrotask(draw))
