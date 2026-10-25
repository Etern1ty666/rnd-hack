import { useCallback, useEffect, useRef, useState } from 'react'

// толкнули — зажмуривается и покачивается; толкают подряд — злится всё сильнее;
// затолкали (5 раз за пару секунд) — оглушён: глаза-спирали; погладили — успокоился
const PUSH_WINDOW_MS = 2500
const DIZZY_AT = 5
const DIZZY_MS = 3600

/**
 * Толчки и поглаживания робота: считает удары подряд, решает, когда он оглушён,
 * и не путает поглаживание с толчком (провели с зажатой кнопкой — это не клик).
 * handlers вешаются на кнопку с роботом, push / dizzy / pet передаются в Robot.
 */
export function usePokes() {
  const pushes = useRef<number[]>([])
  const down = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const [push, setPush] = useState({ n: 0, dir: 1, hits: 0 })
  const [dizzy, setDizzy] = useState(false)

  useEffect(() => {
    if (!dizzy) return
    const t = window.setTimeout(() => setDizzy(false), DIZZY_MS)
    return () => clearTimeout(t)
  }, [dizzy])

  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    // гладили с зажатой кнопкой — это не толчок
    if (dragged.current) {
      dragged.current = false
      return
    }
    // нажали слева — толкает вправо, и наоборот; с клавиатуры — в случайную сторону
    const r = e.currentTarget.getBoundingClientRect()
    const dir = e.detail === 0 ? (Math.random() < 0.5 ? -1 : 1) : e.clientX < r.left + r.width / 2 ? 1 : -1
    if (dizzy) {
      setPush((p) => ({ n: p.n + 1, dir, hits: 0 }))
      return
    }
    const now = performance.now()
    pushes.current = [...pushes.current.filter((t) => now - t < PUSH_WINDOW_MS), now]
    // который удар подряд: от него зависит, насколько он злится
    const hits = pushes.current.length
    setPush((p) => ({ n: p.n + 1, dir, hits }))
    if (hits >= DIZZY_AT) {
      pushes.current = []
      setDizzy(true)
    }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY }
    dragged.current = false
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 6) dragged.current = true
  }
  const onPointerUp = () => { down.current = null }

  // погладили — успокоился: удары подряд забыты, оглушённый приходит в себя
  const pet = useCallback(() => {
    pushes.current = []
    setDizzy(false)
  }, [])

  return { push, dizzy, pet, handlers: { onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}
