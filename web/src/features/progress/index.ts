// Progress feature: daily/weekly checklist and achievements.
import { U, bump } from '@/core/state'
import { onHost } from '@/core/host'
import { onAchUpd } from './achievements'

onHost('achUpd', m => onAchUpd(m.items))
// keeps the reset countdowns in the checklist header current
setInterval(() => { if (U.tab === 'check') bump() }, 60000)
