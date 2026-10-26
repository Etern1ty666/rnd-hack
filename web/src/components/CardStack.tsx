import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { load, save } from '../lib/store'
import { Icon, type IconName } from './Icon'

export interface StackCard {
  id: string
  title: string
  /** Справа в заголовке: например, «Все →». */
  head?: React.ReactNode
  /** Итог справа в заголовке свёрнутой карточки (при наведении его место занимает ручка). */
  peek?: React.ReactNode
  body: React.ReactNode
}

interface Props {
  /** Шапка над карточками — какой бизнес: не сворачивается и не перетаскивается. */
  top?: React.ReactNode
  cards: StackCard[]
  /** Карточка, о которой только что сказал Vi: раскрываем, показываем и подсвечиваем. */
  hot?: { id: string; n: number } | null
}

const HOT_MS = 2600

/**
 * Карточки справа, как панель Environment у Claude: тонкая рамка, внутри — просто строки.
 * Заголовок сворачивает карточку. При наведении — ручка ⠿: за неё карточку можно перетащить
 * (или стрелками с клавиатуры), соседи плавно расступаются. Порядок и свёрнутые запоминаем.
 */
export function CardStack({ top, cards, hot }: Props) {
  const [order, setOrder] = useState<string[]>(() => load('panel:order', []))
  const [closed, setClosed] = useState<string[]>(() => load('panel:closed', []))
  useEffect(() => save('panel:order', order), [order])
  useEffect(() => save('panel:closed', closed), [closed])
  const [lit, setLit] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const tops = useRef(new Map<string, number>())
  // тащим: какую карточку, где за неё взялись и куда сейчас тянем её верх (в координатах стопки)
  const drag = useRef<{ id: string; grab: number; y: number } | null>(null)

  // новые карточки (которых ещё нет в сохранённом порядке) встают туда, где их поставил код
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i >= 0 ? i : 1000 + cards.findIndex((c) => c.id === id)
  }
  const sorted = [...cards].sort((a, b) => rank(a.id) - rank(b.id))
  const ids = sorted.map((c) => c.id)
  const reorder = (next: string[]) => setOrder([...next, ...order.filter((id) => !next.includes(id))])

  // соседи переезжают плавно: запоминаем, где были, и доезжают с прежнего места
  useLayoutEffect(() => {
    for (const [id, el] of els.current) {
      const now = el.offsetTop
      const prev = tops.current.get(id)
      tops.current.set(id, now)
      const d = drag.current
      if (d?.id === id) el.style.transform = `translateY(${d.y - now}px)`
      else if (prev != null && prev !== now) el.animate([{ transform: `translateY(${prev - now}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' })
    }
  })

  // объект подсказки пересоздаётся на каждой отрисовке — реагируем только на новый ответ Vi
  const hotKey = hot ? `${hot.id}:${hot.n}` : ''
  useEffect(() => {
    if (!hot) return
    setClosed((c) => c.filter((id) => id !== hot.id))
    setLit(hot.id)
    els.current.get(hot.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const t = window.setTimeout(() => setLit(null), HOT_MS)
    return () => clearTimeout(t)
  }, [hotKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    const el = els.current.get(id)
    if (!el || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, grab: e.clientY - el.getBoundingClientRect().top, y: el.offsetTop }
    setDragging(id)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    const el = d && els.current.get(d.id)
    if (!d || !el || !box.current) return
    d.y = e.clientY - box.current.getBoundingClientRect().top - d.grab
    el.style.transform = `translateY(${d.y - el.offsetTop}px)`
    // встаёт перед первой карточкой, чью середину перешла её середина
    const center = d.y + el.offsetHeight / 2
    const others = ids.filter((id) => id !== d.id)
    let at = others.findIndex((id) => { const o = els.current.get(id)!; return center < o.offsetTop + o.offsetHeight / 2 })
    if (at < 0) at = others.length
    const next = [...others.slice(0, at), d.id, ...others.slice(at)]
    if (next.join() !== ids.join()) reorder(next)
  }
  const end = () => {
    const d = drag.current
    const el = d && els.current.get(d.id)
    drag.current = null
    setDragging(null)
    if (!el) return
    // отпустили — доезжает на своё место
    const from = el.style.transform
    el.style.transform = ''
    if (from) el.animate([{ transform: from }, { transform: 'none' }], { duration: 180, easing: 'ease-out' })
  }
  const nudge = (e: React.KeyboardEvent, id: string) => {
    const i = ids.indexOf(id)
    const j = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1
    if (j < 0 || j >= ids.length) return
    e.preventDefault()
    const next = [...ids]
    next.splice(i, 1)
    next.splice(j, 0, id)
    reorder(next)
  }
  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <div className="info" ref={box}>
      {top && <section className="info-card info-top">{top}</section>}
      {sorted.map((c) => {
        const open = !closed.includes(c.id)
        return (
          <section
            key={c.id}
            ref={(el) => { if (el) els.current.set(c.id, el); else els.current.delete(c.id) }}
            className={`info-card ${lit === c.id ? 'hot' : ''} ${dragging === c.id ? 'dragging' : ''}`}
          >
            <div className="info-card-head">
              <button className="info-card-title" onClick={() => toggle(c.id)} aria-expanded={open}>
                <span className="info-card-name">{c.title}</span> <span className={`nav-caret ${open ? '' : 'closed'}`} aria-hidden="true" />
              </button>
              {open ? c.head : c.peek != null && <span className="info-peek">{c.peek}</span>}
              <button
                className="info-handle" aria-label={`Переместить «${c.title}» — стрелки вверх и вниз`} title="Перетащить"
                onPointerDown={(e) => start(e, c.id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
                onKeyDown={(e) => nudge(e, c.id)}
              >
                <Icon name="grip" size={16} stroke={3} />
              </button>
            </div>
            {open && <div className="info-card-body">{c.body}</div>}
          </section>
        )
      })}
    </div>
  )
}

/** Строка карточки: иконка, текст, справа — значение или действие. Без подложки; тихая — серым, пока не навели. */
export function Row({ icon, lead, children, end, onClick, on, quiet }: {
  icon?: IconName
  lead?: React.ReactNode
  children: React.ReactNode
  end?: React.ReactNode
  onClick?: () => void
  on?: boolean
  quiet?: boolean
}) {
  const inner = (
    <>
      <span className="row-lead">{lead ?? (icon && <Icon name={icon} size={20} />)}</span>
      <span className="row-text">{children}</span>
      {end != null && <span className="row-end">{end}</span>}
    </>
  )
  return onClick
    ? <button className={`row row-btn ${on ? 'on' : ''} ${quiet ? 'row-quiet' : ''}`} onClick={onClick}>{inner}</button>
    : <div className="row">{inner}</div>
}
