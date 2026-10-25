import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { VARIANTS, type Variant } from '../lib/robotVariants'
import { load, save } from '../lib/store'
import { Icon } from './Icon'
import { Robot } from './Robot'

const KEY = 'robots:rank'
// столько надо протащить, чтобы это было перетаскивание, а не нажатие
const DRAG_PX = 6
// курсор у края окна — страница едет сама: так вариант из конца дотаскивается до начала
const EDGE = 90

/** Один вариант: тот же Robot, что над строкой ввода, — следит за курсором, его можно погладить; нажали — все его анимации. */
function Bot({ look, id }: { look: Variant; id: number }) {
  const level = useRef(0)
  return (
    <a className="rg-bot" href={`?v=${id}`} draggable={false} aria-label={`«${look.name}» — все анимации`}>
      <Robot mood="idle" level={level} stand look={look} />
    </a>
  )
}

/**
 * Тестовая страница: все варианты внешности Vi в одном списке — их можно перетаскивать и расставить от лучшего к худшему.
 * У каждого изменена одна деталь — так видно, что именно поменять. Все следят за курсором,
 * если плавно поводить по голове — их можно погладить; нажали на робота — открываются все его анимации.
 * Мышью тащат за любое место карточки, пальцем — за ручку ⠿ (иначе не прокрутить страницу), с клавиатуры — стрелками.
 * Порядок хранится в этом браузере.
 */
export function RobotGallery() {
  // порядок — по названиям; новые варианты встают в конец, удалённые пропадают
  const [saved, setSaved] = useState<string[]>(() => load(KEY, []))
  useEffect(() => save(KEY, saved), [saved])
  const [dragging, setDragging] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const grid = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const spots = useRef(new Map<string, [number, number]>())
  // тащим: что, где начали, где взялись за карточку, где курсор сейчас; on — уже тащим, а не просто нажали
  const drag = useRef<{ name: string; sx: number; sy: number; gx: number; gy: number; cx: number; cy: number; on: boolean } | null>(null)
  const raf = useRef(0)
  const blockClick = useRef(false)

  const rank = (v: Variant) => {
    const i = saved.indexOf(v.name)
    return i >= 0 ? i : 1000 + VARIANTS.indexOf(v)
  }
  const sorted = [...VARIANTS].sort((a, b) => rank(a) - rank(b))

  // слушатели висят на window всё перетаскивание — поэтому порядок берём из DOM, а не из устаревшего замыкания
  const order = () => [...(grid.current?.children ?? [])].map((el) => (el as HTMLElement).dataset.name!)
  const moveTo = (name: string, j: number) => {
    const next = order().filter((n) => n !== name)
    next.splice(j, 0, name)
    setSaved(next)
  }

  // перетаскиваемая карточка — под курсором, откуда бы она ни переехала в сетке
  const follow = () => {
    const d = drag.current
    const el = d && els.current.get(d.name)
    const g = grid.current?.getBoundingClientRect()
    if (!d?.on || !el || !g) return null
    el.style.transform = `translate(${d.cx - g.left - d.gx - el.offsetLeft}px, ${d.cy - g.top - d.gy - el.offsetTop}px)`
    return { d, x: d.cx - g.left, y: d.cy - g.top }
  }
  // встаёт на место того варианта, над которым курсор
  const place = () => {
    const at = follow()
    if (!at) return
    const names = order()
    const over = names.find((n) => {
      const o = els.current.get(n)
      return n !== at.d.name && !!o && at.x >= o.offsetLeft && at.x < o.offsetLeft + o.offsetWidth && at.y >= o.offsetTop && at.y < o.offsetTop + o.offsetHeight
    })
    if (over) moveTo(at.d.name, names.indexOf(over))
  }

  // соседи переезжают плавно: запоминаем, где были, и доезжают с прежнего места
  useLayoutEffect(() => {
    for (const [name, el] of els.current) {
      const now: [number, number] = [el.offsetLeft, el.offsetTop]
      const was = spots.current.get(name)
      spots.current.set(name, now)
      if (drag.current?.on && drag.current.name === name) follow()
      else if (was && (was[0] !== now[0] || was[1] !== now[1])) {
        el.animate([{ transform: `translate(${was[0] - now[0]}px, ${was[1] - now[1]}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' })
      }
    }
  })

  const begin = () => {
    if (!drag.current) return
    drag.current.on = true
    setDragging(drag.current.name)
    // у края окна прокручиваем, пока держат
    const tick = () => {
      const d = drag.current
      if (!d) return
      const v = d.cy < EDGE ? d.cy - EDGE : d.cy > innerHeight - EDGE ? d.cy - innerHeight + EDGE : 0
      if (v) {
        window.scrollBy(0, v * 0.25)
        place()
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.cx = e.clientX
    d.cy = e.clientY
    if (!d.on && Math.hypot(d.cx - d.sx, d.cy - d.sy) > DRAG_PX) begin()
    place()
  }
  const onScroll = () => place()
  const onUp = () => {
    const d = drag.current
    drag.current = null
    cancelAnimationFrame(raf.current)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('scroll', onScroll)
    if (!d?.on) return
    setDragging(null)
    // отпустили над роботом — это не нажатие на него
    blockClick.current = true
    window.setTimeout(() => { blockClick.current = false })
    // доезжает на своё место
    const el = els.current.get(d.name)
    const from = el?.style.transform
    if (!el || !from) return
    el.style.transform = ''
    el.animate([{ transform: from }, { transform: 'none' }], { duration: 200, easing: 'ease-out' })
  }
  const onDown = (e: React.PointerEvent, name: string) => {
    const grip = (e.target as Element).closest('.rg-grip')
    if (e.button !== 0 || drag.current || (!grip && e.pointerType !== 'mouse')) return
    const r = els.current.get(name)!.getBoundingClientRect()
    drag.current = { name, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, cx: e.clientX, cy: e.clientY, on: false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('scroll', onScroll)
    if (grip) begin()
  }

  const nudge = (e: React.KeyboardEvent, name: string) => {
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    if (!back && e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const i = order().indexOf(name)
    const j = back ? i - 1 : i + 1
    if (j >= 0 && j < VARIANTS.length) moveTo(name, j)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sorted.map((v, i) => `${i + 1}. ${v.name}`).join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { /* буфер обмена недоступен — ничего страшного */ }
  }

  return (
    <main className="rg">
      <header className="rg-head">
        <div>
          <h1>Варианты Vi</h1>
          <p>Перетаскивайте варианты, чтобы расставить от лучшего к худшему, — порядок запомнится в этом браузере. Нажмите на робота — откроются все его анимации.</p>
        </div>
        <nav className="rg-actions">
          <button onClick={copy}>{copied ? 'Скопировано' : 'Скопировать список'}</button>
          {saved.length > 0 && <button onClick={() => { if (confirm('Вернуть исходный порядок?')) setSaved([]) }}>Сбросить</button>}
          <a href={import.meta.env.BASE_URL}>← К приложению</a>
        </nav>
      </header>
      <div ref={grid} className={`rg-grid rg-sort ${dragging ? 'sorting' : ''}`}>
        {sorted.map((v, i) => (
          <figure
            key={v.name}
            data-name={v.name}
            ref={(el) => { if (el) els.current.set(v.name, el); else els.current.delete(v.name) }}
            className={`rg-item ${dragging === v.name ? 'dragging' : ''}`}
            onPointerDown={(e) => onDown(e, v.name)}
            onClickCapture={(e) => { if (blockClick.current) { e.preventDefault(); e.stopPropagation() } }}
          >
            <div className="rg-stage"><Bot look={v} id={VARIANTS.indexOf(v) + 1} /></div>
            <div className="rg-bar" />
            <figcaption className="rg-cap">
              <div className="rg-title">
                <span className="rg-rank">{i + 1}</span>
                <b>{v.name}</b>
                <button className="rg-grip" aria-label={`Передвинуть «${v.name}» — стрелками`} title="Перетащить" onKeyDown={(e) => nudge(e, v.name)}>
                  <Icon name="grip" size={16} stroke={3} />
                </button>
              </div>
              <span>{v.note}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  )
}
