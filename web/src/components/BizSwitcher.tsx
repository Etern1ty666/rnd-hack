import { useEffect, useRef, useState } from 'react'
import { plural } from '../lib/format'
import { Icon } from './Icon'

export interface BizItem {
  id: string
  name: string
  industry: string
  tone: 'ok' | 'risk' | 'short'
}

interface Props {
  items: BizItem[]
  current: string
  onSelect: (id: string) => void
  onAdd: () => void
}

export const ALL = 'all'

/** Название бизнеса — это и заголовок экрана, и переключатель. */
export function BizSwitcher({ items, current, onSelect, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const cur = items.find((i) => i.id === current)

  // мышью меню открывается наведением; закрываем с задержкой, чтобы курсор успел дойти до списка.
  // на телефоне наведения нет — там, как и с клавиатуры, открываем нажатием
  const hovered = useRef(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    hovered.current = true
    clearTimeout(timer.current)
    setOpen(true)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    hovered.current = false
    timer.current = window.setTimeout(() => setOpen(false), 200)
  }

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const pick = (id: string) => {
    setOpen(false)
    onSelect(id)
  }

  return (
    <div className="switcher" ref={box} onPointerEnter={enter} onPointerLeave={leave}>
      <button className="switcher-title" onClick={() => setOpen(hovered.current || !open)} aria-expanded={open} aria-haspopup="menu">
        <span>{current === ALL ? 'Все бизнесы' : cur?.name}</span>
        <Icon name="chevron" size={20} stroke={2.4} className={open ? 'flip-v' : undefined} />
      </button>
      {open && (
        <div className="switcher-menu" role="menu">
          {items.map((i) => (
            <button key={i.id} role="menuitem" className="sw-item" onClick={() => pick(i.id)}>
              <span className={`tone-dot ${i.tone}`} />
              <span className="sw-text"><b>{i.name}</b><span>{i.industry}</span></span>
              {i.id === current && <Icon name="check" size={18} stroke={2.4} />}
            </button>
          ))}
          {items.length > 1 && (
            <button role="menuitem" className="sw-item" onClick={() => pick(ALL)}>
              <span className="sw-ico"><Icon name="grid" size={16} /></span>
              <span className="sw-text"><b>Сводка по всем</b><span>{items.length} {plural(items.length, 'бизнес', 'бизнеса', 'бизнесов')} вместе</span></span>
              {current === ALL && <Icon name="check" size={18} stroke={2.4} />}
            </button>
          )}
          <button role="menuitem" className="sw-item add" onClick={() => { setOpen(false); onAdd() }}>
            <span className="sw-ico"><Icon name="plus" size={16} /></span>
            <span className="sw-text"><b>Добавить бизнес</b></span>
          </button>
        </div>
      )}
    </div>
  )
}
