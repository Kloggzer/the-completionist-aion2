// Toasts (top left): slim one-line pills with a hairline progress bar. Rendered by components/Toasts.tsx.
import { U, bump } from './state'

export type Toast = { id: number; title: string; sub: string; frac: number; up: boolean; out?: boolean }
export const toasts: Toast[] = []
let seq = 0

/** Show a toast unless the user turned toasts off. `up` = highlighted (level-up, cube, achievement). */
export function toast(title: string, sub: string, frac = 1, up = false) {
  if (!U.toasts) return
  const tt: Toast = { id: ++seq, title, sub, frac, up }
  toasts.unshift(tt)
  toasts.splice(2)
  bump()
  setTimeout(() => { tt.out = true; bump(); setTimeout(() => { const i = toasts.indexOf(tt); if (i >= 0) toasts.splice(i, 1); bump() }, 400) }, up ? 6000 : 3500)
}
