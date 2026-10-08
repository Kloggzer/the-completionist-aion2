// Event timers + field bosses: data loading, announcer intervals.
import { on } from '@/core/bus'
import { U, bump } from '@/core/state'
import { announceBosses, announceTick, loadDrops, loadTimers } from './events'

on('base', loadTimers)

loadDrops()
setInterval(announceTick, 10000)
setInterval(announceBosses, 10000)
// Countdown refresh ("in 12 min") while a time list is visible.
setInterval(() => { if (U.tab === 'timer' || U.tab === 'boss' || U.tab === 'home') bump() }, 20000)
