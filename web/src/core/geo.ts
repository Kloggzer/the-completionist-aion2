// Small map helpers shared by the map and the lists.
import { t } from './i18n'

/** Height of a point: "Höhe 12 m" ('' without data). */
export const heightTxt = (h: number | null | undefined) => (h == null ? '' : t('geo.height', { h: Math.round(h) }))
