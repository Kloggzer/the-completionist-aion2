// Mob / boss portrait from the aion2maps atlas (/data/mon_portraits.webp: 16 columns × 128 px cells).
// `por` = the species' portrait index (monsters.json species[].por). Without one, or when the atlas cell is empty
// (flat), a neutral placeholder keeps the tile layout identical. Positioned in percent, so the size can also come
// from classes (size={null} + className="size-[60px]").
import { PawPrint } from 'lucide-react'
import { bump } from '@/core/state'
import { cn } from '@/lib/utils'

const COLS = 16, ROWS = 14, URL = '/data/mon_portraits.webp'

// Empty cells (the atlas pads its last row with flat dark cells), found once after the atlas loaded: downscaled to
// 4×4 px per cell, a cell without any contrast is empty.
let empty: Set<number> | null = null
function scan() {
  if (empty || typeof Image === 'undefined') return
  empty = new Set()
  const img = new Image()
  img.onload = () => {
    try {
      const S = 4, cv = document.createElement('canvas')
      cv.width = COLS * S; cv.height = ROWS * S
      const cx = cv.getContext('2d', { willReadFrequently: true })!
      cx.drawImage(img, 0, 0, cv.width, cv.height)
      const px = cx.getImageData(0, 0, cv.width, cv.height).data
      for (let i = 0; i < COLS * ROWS; i++) {
        let max = 0, min = 255
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const o = (((Math.floor(i / COLS) * S + y) * cv.width) + (i % COLS) * S + x) * 4
          max = Math.max(max, px[o], px[o + 1], px[o + 2]); min = Math.min(min, px[o], px[o + 1], px[o + 2])
        }
        if (max - min < 12) empty!.add(i)
      }
      bump()
    } catch { /* tainted or no canvas: keep showing the cells as they are */ }
  }
  img.src = URL
}

export function Portrait({ por, size = 32, className, title }: { por?: number | null; size?: number | null; className?: string; title?: string }) {
  scan()
  const none = por == null || por < 0 || por >= COLS * ROWS || !!empty?.has(por)
  const box = cn('inline-grid flex-none place-items-center overflow-hidden rounded-sm border border-white/10 bg-black/30', className)
  const dim = size ? { width: size, height: size } : {}
  if (none) return <span data-tip={title} className={cn(box, 'bg-white/[0.03] text-dim/60')} style={dim}><PawPrint className="size-[45%]" /></span>
  return (
    <span data-tip={title} className={box}
      style={{
        ...dim,
        backgroundImage: `url(${URL})`,
        backgroundSize: `${COLS * 100}% ${ROWS * 100}%`,
        backgroundPosition: `${(por % COLS) / (COLS - 1) * 100}% ${Math.floor(por / COLS) / (ROWS - 1) * 100}%`,
      }} />
  )
}
