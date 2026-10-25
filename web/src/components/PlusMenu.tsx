import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViWidget } from '../lib/vi'
import { Icon, type IconName } from './Icon'

interface Props {
  /** Разделы бизнеса, которые Vi показывает прямо в переписке. */
  tools: { w: ViWidget; label: string; icon: IconName }[]
  onAttach: () => void
  onSheet: (s: 'add' | 'qr') => void
  onShow: (w: ViWidget, label: string) => void
}

// ширина подменю — по ней решаем, помещается ли оно сбоку
const SUB_W = 260
// курсор замер внутри треугольника — значит, он не к подменю, а к пункту под ним: убираем треугольник
const AIM_REST_MS = 350
// ушли и с пункта, и с подменю — закрываем не сразу: можно вернуться
const CLOSE_MS = 200

/**
 * Меню «+» в строке ввода: первым — «Прикрепить файл», под ним «Все функции» с подменю.
 * На широком экране подменю раскрывается сбоку по наведению. Чтобы оно не закрывалось, пока курсор
 * идёт к нему наискосок через соседний пункт, от курсора до ближнего края подменю лежит невидимый
 * треугольник: он ловит курсор и держит подменю открытым. Сбоку не помещается (узкий экран, касание) —
 * подменю открывается нажатием на месте меню, со стрелкой назад.
 */
export function PlusMenu({ tools, onAttach, onSheet, onShow }: Props) {
  const [sub, setSub] = useState<null | 'side' | 'inline'>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const aim = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef(0)
  const restTimer = useRef(0)
  // где курсор был на пункте последний раз — от этой точки треугольник рисуется сразу, как подменю открылось
  const last = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => () => {
    clearTimeout(closeTimer.current)
    clearTimeout(restTimer.current)
  }, [])

  const fitsSide = () => {
    const r = wrap.current?.getBoundingClientRect()
    return !!r && r.right + 10 + SUB_W <= window.innerWidth - 8
  }
  const open = () => {
    clearTimeout(closeTimer.current)
    setSub(fitsSide() ? 'side' : 'inline')
  }

  // треугольник: вершина — у курсора на пункте, основание — ближний край подменю
  const point = (x: number, y: number) => {
    last.current = { x, y }
    const t = aim.current
    const p = panel.current
    const w = wrap.current
    if (!t || !p || !w) return
    const wr = w.getBoundingClientRect()
    const pr = p.getBoundingClientRect()
    const ax = x - wr.left
    const ay = y - wr.top
    const right = pr.left - wr.left
    const top = Math.min(pr.top - wr.top, ay)
    const bottom = Math.max(pr.bottom - wr.top, ay)
    Object.assign(t.style, {
      display: 'block', left: `${ax}px`, top: `${top}px`, width: `${Math.max(0, right - ax)}px`, height: `${bottom - top}px`,
      clipPath: `polygon(0 ${ay - top}px, 100% ${pr.top - wr.top - top}px, 100% ${pr.bottom - wr.top - top}px)`,
    })
  }
  const rest = () => {
    clearTimeout(restTimer.current)
    restTimer.current = window.setTimeout(() => { if (aim.current) aim.current.style.display = 'none' }, AIM_REST_MS)
  }

  // подменю сбоку растёт вверх от пункта; упирается в верх окна — сдвигаем вниз. И сразу кладём треугольник
  useLayoutEffect(() => {
    const p = panel.current
    if (sub !== 'side' || !p) return
    const top = p.getBoundingClientRect().top
    if (top < 8) p.style.bottom = `${-6 - (8 - top)}px`
    if (last.current) point(last.current.x, last.current.y)
  }, [sub])

  const items = (
    <>
      <button type="button" role="menuitem" onClick={() => onSheet('add')}><Icon name="pencil" size={18} /> Платёж по полям</button>
      <button type="button" role="menuitem" onClick={() => onSheet('qr')}><Icon name="qr" size={18} /> Сканировать QR со счёта</button>
      <span className="vi-plus-sep" role="separator" />
      {tools.map((t) => (
        <button key={t.w} type="button" role="menuitem" onClick={() => onShow(t.w, t.label)}><Icon name={t.icon} size={18} /> {t.label}</button>
      ))}
    </>
  )

  if (sub === 'inline') {
    return (
      <div className="vi-plus-menu" role="menu">
        <button type="button" className="vi-plus-back" onClick={() => setSub(null)}><Icon name="chevron" size={16} /> Все функции</button>
        {items}
      </div>
    )
  }

  return (
    <div className="vi-plus-menu" role="menu">
      <button type="button" role="menuitem" onClick={onAttach}><Icon name="clip" size={18} /> Прикрепить файл</button>
      <div
        ref={wrap} className="vi-plus-wrap"
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse' || !fitsSide()) return
          last.current = { x: e.clientX, y: e.clientY }
          open()
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse' || sub !== 'side') return
          clearTimeout(closeTimer.current)
          closeTimer.current = window.setTimeout(() => setSub(null), CLOSE_MS)
        }}
      >
        <button
          ref={trigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={!!sub} className={sub ? 'on' : ''}
          onClick={() => { if (!sub) open() }}
          onPointerMove={(e) => point(e.clientX, e.clientY)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight') return
            e.preventDefault()
            open()
            requestAnimationFrame(() => panel.current?.querySelector('button')?.focus())
          }}
        >
          <Icon name="grid" size={18} /> Все функции <Icon name="chevron" size={16} className="vi-plus-go" />
        </button>
        {sub === 'side' && (
          <>
            <span ref={aim} className="vi-plus-aim" onPointerMove={rest} aria-hidden="true" />
            <div
              ref={panel} className="vi-plus-menu vi-plus-sub" role="menu"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft') return
                setSub(null)
                trigger.current?.focus()
              }}
            >
              {items}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
