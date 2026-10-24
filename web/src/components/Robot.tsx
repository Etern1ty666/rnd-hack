import { useEffect, useRef } from 'react'

export type Mood = 'idle' | 'listening' | 'thinking' | 'happy'

interface Props {
  mood: Mood
  /** Громкость речи 0…1: пока человек говорит, глаза подпрыгивают в такт. */
  level: React.RefObject<number>
}

/**
 * Робот-помощник: тёмное лицо-экран и два светящихся глаза-капсулы.
 * Глаза живут сами: моргают, оглядываются, следят за курсором, а пока робот думает — бегают.
 * Двигаем их напрямую в кадре анимации, без перерисовки React — так плавно и дёшево.
 */
export function Robot({ mood, level }: Props) {
  const eyes = useRef<SVGGElement>(null)
  const left = useRef<SVGRectElement>(null)
  const right = useRef<SVGRectElement>(null)
  const moodRef = useRef(mood)
  useEffect(() => { moodRef.current = mood }, [mood])

  useEffect(() => {
    let raf = 0
    let gx = 0, gy = 0, tx = 0, ty = 0
    let blinkUntil = 0
    let nextBlink = performance.now() + 1200
    let nextGlance = 0
    let mouse: { x: number; y: number; at: number } | null = null
    const onMove = (e: PointerEvent) => { mouse = { x: e.clientX, y: e.clientY, at: performance.now() } }
    window.addEventListener('pointermove', onMove)

    const frame = (t: number) => {
      const m = moodRef.current
      const svg = eyes.current?.ownerSVGElement
      if (m === 'thinking') {
        // думает — глаза бегают из стороны в сторону, взгляд вверх
        tx = Math.floor(t / 320) % 2 ? 11 : -11
        ty = -9
      } else if (m === 'listening') {
        tx = Math.sin(t / 700) * 2
        ty = 3
      } else if (mouse && t - mouse.at < 2500 && svg) {
        const r = svg.getBoundingClientRect()
        const dx = mouse.x - (r.left + r.width / 2)
        const dy = mouse.y - (r.top + r.height / 2)
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, d / 300)
        tx = (dx / d) * 12 * k
        ty = (dy / d) * 9 * k
      } else if (t > nextGlance) {
        const center = Math.random() < 0.4
        tx = center ? 0 : (Math.random() * 2 - 1) * 12
        ty = center ? 0 : (Math.random() * 2 - 1) * 7
        nextGlance = t + 900 + Math.random() * 2200
      }
      gx += (tx - gx) * 0.2
      gy += (ty - gy) * 0.2

      if (t > nextBlink) {
        blinkUntil = t + 120
        // иногда моргает дважды подряд
        nextBlink = t + (Math.random() < 0.2 ? 260 : (m === 'listening' ? 3500 : 1800) + Math.random() * 3000)
      }
      const sy = t < blinkUntil ? 0.08 : m === 'listening' ? 1 + (level.current ?? 0) * 0.25 : 1

      eyes.current?.setAttribute('transform', `translate(${gx.toFixed(2)} ${gy.toFixed(2)})`)
      for (const el of [left.current, right.current]) if (el) el.style.transform = `scaleY(${sy.toFixed(3)})`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [level])

  return (
    <svg className={`robot ${mood}`} viewBox="0 0 220 220" role="img" aria-label="Голосовой помощник">
      <defs>
        <linearGradient id="robot-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3e" />
          <stop offset="1" stopColor="#141416" />
        </linearGradient>
        <filter id="robot-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <ellipse className="robot-shadow" cx="110" cy="206" rx="56" ry="7" />
      <g className="robot-body">
        <g className="robot-tilt">
          <line x1="110" y1="40" x2="110" y2="22" stroke="#2a2a2d" strokeWidth="5" strokeLinecap="round" />
          <circle className="robot-bulb" cx="110" cy="16" r="8" />
          <rect x="20" y="94" width="16" height="44" rx="8" fill="#2a2a2d" />
          <rect x="184" y="94" width="16" height="44" rx="8" fill="#2a2a2d" />
          <rect x="30" y="38" width="160" height="150" rx="46" fill="url(#robot-head)" />
          <rect x="46" y="56" width="128" height="106" rx="32" fill="#09090a" />
          <g ref={eyes} filter="url(#robot-glow)">
            {mood === 'happy' ? (
              <>
                <path d="M74 102 q12 -20 24 0" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
                <path d="M122 102 q12 -20 24 0" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect ref={left} className="robot-eye" x="75" y="81" width="22" height="52" rx="11" fill="#fff" />
                <rect ref={right} className="robot-eye" x="123" y="81" width="22" height="52" rx="11" fill="#fff" />
              </>
            )}
          </g>
        </g>
      </g>
    </svg>
  )
}
