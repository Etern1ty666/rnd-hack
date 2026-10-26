import { useEffect, useRef } from 'react'

interface Props {
  level: React.RefObject<number>
  active: boolean
}

const BAR = 4
const GAP = 3
const H = 56
const STEP_MS = 55

/** Волна записи как в диктофоне: столбики бегут справа налево, старые бледнеют, в тишине — пунктир. */
export function Wave({ level, active }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    let bars: number[] = []
    let raf = 0
    // цвета — из темы: в тёмной столбики светлые
    const css = getComputedStyle(c)
    let last = 0
    const frame = (t: number) => {
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = H * dpr
      }
      const n = Math.max(1, Math.floor(w / (BAR + GAP)))
      if (bars.length < n) bars = [...new Array(n - bars.length).fill(0), ...bars]
      if (t - last > STEP_MS) {
        last = t
        bars.push(activeRef.current ? (level.current ?? 0) * (0.55 + Math.random() * 0.45) : 0)
      }
      if (bars.length > n) bars = bars.slice(-n)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, H)
      ctx.fillStyle = css.getPropertyValue(activeRef.current ? '--ink' : '--line-2').trim() || '#888'
      const x0 = w - n * (BAR + GAP) + GAP / 2
      bars.forEach((v, i) => {
        const h = Math.max(BAR, v * H)
        ctx.globalAlpha = 0.2 + 0.8 * (i / n)
        ctx.beginPath()
        ctx.roundRect(x0 + i * (BAR + GAP), (H - h) / 2, BAR, h, BAR / 2)
        ctx.fill()
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [level])

  return <canvas ref={ref} className="voice-wave" aria-hidden="true" />
}
