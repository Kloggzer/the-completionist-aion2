import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { G, U, V, useApp, type Any } from '@/core/state'
import { zoneOfSpawn } from '@/core/data'
import { heightTxt } from '@/core/geo'
import { t } from '@/core/i18n'
import { cn } from '@/lib/utils'
import {
  attachCanvas, sizeCanvas, onTip, view, type Tip,
  pointerDown, pointerMove, pointerUp, pointerLeave, wheel, dblClick, zoomIn, zoomOut,
} from './engine'

// Small translucent pill over the map (#11141ccc, thin border).
const pill = 'rounded-sm border border-white/10 bg-[#11141ccc] text-[11px] text-muted-foreground backdrop-blur-sm transition-colors hover:text-white'

function TipBox({ tip }: { tip: NonNullable<Tip> }) {
  const ref = useRef<HTMLDivElement>(null)
  // Position after measuring: right of the cursor, flipped above near the bottom edge.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.left = Math.min(view.w - r.width - 4, tip.x + 12) + 'px'
    el.style.top = (tip.y + 14 + r.height > view.h ? tip.y - r.height - 8 : tip.y + 14) + 'px'
  })
  const it = tip.it, m = G.md[U.map]
  let body
  if (it.spot) body = <><b className="font-semibold text-gold">#{it.spot.rank} {it.spot.name}</b><br /><span className="text-muted-foreground">{it.spot.pets.map((p: Any) => p.t.p.n + ' ' + p.n + '×').join(', ')}</span></>
  else if (it.cube) body = <><b className="font-semibold text-gold">{t('map.tipCube')}</b> {it.cube.name}<br /><span className="text-muted-foreground">{t('map.tipOneOf', { n: it.cube.pts.length })}{heightTxt(it.h) && <> · <b className="text-foreground">{heightTxt(it.h)}</b></>}</span></>
  else body = <>
    <b className="font-semibold text-gold">{it.mob.n}</b> <span className="text-muted-foreground">Lv {it.mob.lv}{it.mob.named ? ' · ' + t('map.named') : it.mob.r !== 'Normal' ? ' · ' + it.mob.r : ''}</span><br />
    → {it.t.p.n} <span className="text-muted-foreground">{it.t.done ? 'Lv3' : `${it.t.souls}/${it.t.need}`} · {zoneOfSpawn(m, it.i)}</span>
  </>
  return <div ref={ref} className="pointer-events-none absolute z-[5] max-w-60 rounded-sm border border-[#3a4560] bg-[#0d1017ee] px-2 py-1.5 text-[11.5px] shadow-[0_4px_14px_#0008]">{body}</div>
}

export function MapView() {
  useApp()
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const [tip, setTip] = useState<Tip>(null)

  useEffect(() => {
    const cv = canvas.current!
    attachCanvas(cv)
    onTip(setTip)
    const ro = new ResizeObserver(() => sizeCanvas())
    ro.observe(wrap.current!)
    const opts = { passive: false } as const
    cv.addEventListener('pointerdown', pointerDown)
    cv.addEventListener('pointermove', pointerMove)
    cv.addEventListener('pointerup', pointerUp)
    cv.addEventListener('pointerleave', pointerLeave)
    cv.addEventListener('wheel', wheel, opts)
    cv.addEventListener('dblclick', dblClick)
    return () => {
      ro.disconnect()
      cv.removeEventListener('pointerdown', pointerDown)
      cv.removeEventListener('pointermove', pointerMove)
      cv.removeEventListener('pointerup', pointerUp)
      cv.removeEventListener('pointerleave', pointerLeave)
      cv.removeEventListener('wheel', wheel)
      cv.removeEventListener('dblclick', dblClick)
      onTip(() => {})
      attachCanvas(null)
    }
  }, [])

  return (
    <div ref={wrap} className="absolute inset-0 min-h-[120px] overflow-hidden bg-[#1a3248]">
      <canvas ref={canvas} className="absolute inset-0 block size-full cursor-grab" />
      {V.mapMsg && <div className="pointer-events-none absolute inset-0 grid place-items-center p-5 text-center text-[15px] leading-relaxed font-semibold whitespace-pre-line text-gold [text-shadow:0_1px_4px_#000]">{V.mapMsg}</div>}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        <button onClick={zoomIn} data-tip={t('map.zoomIn')} className={cn(pill, 'grid size-6 place-items-center')}><Plus className="size-3.5" /></button>
        <button onClick={zoomOut} data-tip={t('map.zoomOut')} className={cn(pill, 'grid size-6 place-items-center')}><Minus className="size-3.5" /></button>
      </div>
      {tip && <TipBox tip={tip} />}
    </div>
  )
}
