// Pets feature: soul events from the host and target/spot recomputation.
import { G, S, U, type Any } from '@/core/state'
import { onHost } from '@/core/host'
import { emit, on } from '@/core/bus'
import { t } from '@/core/i18n'
import { toast } from '@/core/toast'
import { say } from '@/core/tts'
import { recompute } from './logic'
import { keepInView } from './manual'

// Registered before the map feature's handler, which then repaints with the fresh targets.
on('recompute', recompute)

/** Briefly highlight the pet's tiles after the list re-rendered. */
function flash(pet: number) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(`[data-pet="${pet}"]`).forEach(el => {
      const to = getComputedStyle(el).backgroundColor
      el.animate([{ backgroundColor: '#5fd0e055' }, { backgroundColor: to }], { duration: 1200, easing: 'ease-out' })
    })
  }))
}

function onSoul(ev: Any) {
  const p = G.petById.get(ev.pet)
  const name = p ? p.n : `Pet #${ev.pet}`
  S.state.levels[ev.pet] = ev.level; S.state.souls[ev.pet] = ev.souls
  emit('recompute')
  keepInView(ev.pet) // a level-up moves the tile to another group
  if (!U.toasts) return
  const up = ev.levelUp
  const title = up ? (ev.level === 1 ? t('pets.soul.unlocked', { name }) : t('pets.soul.level', { name, lv: ev.level })) : name
  const sub = ev.level >= 3 ? t('pets.soul.complete') : `${ev.souls}/${ev.need}`
  toast(title, sub, ev.need ? ev.souls / ev.need : 1, up)
  if (up) say('pet', ev.level === 1 ? t('pets.soul.unlocked', { name }) : t('pets.soul.sayLevel', { name, lv: ev.level }))
  flash(ev.pet)
}

onHost('soul', m => onSoul(m.ev))
