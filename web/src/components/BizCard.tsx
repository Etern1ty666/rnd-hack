import { useEffect, useRef, useState } from 'react'
import { plural } from '../lib/format'
import { REGIMES, type RegimeId } from '../lib/tax'
import { ALL, type BizItem } from './Sidebar'
import { Row } from './CardStack'
import { Dropdown } from './Dropdown'
import { Icon } from './Icon'

interface Props {
  items: BizItem[]
  current: string
  /** У текущего бизнеса: переименовать и выбрать систему налогов. В сводке по всем — нет. */
  edit?: {
    form: 'ИП' | 'ООО'
    regime: RegimeId
    onRename: (name: string) => void
    onRegime: (r: RegimeId) => void
  }
  onSelect: (id: string) => void
  onAdd: () => void
}

/**
 * Карточка «Бизнес» — только о самом бизнесе: название и стрелка открывают меню — другие бизнесы,
 * сводка, новый и «Переименовать», — и система налогов (какая-то выбрана всегда). Всё остальное — в чате.
 */
export function BizCard({ items, current, edit, onSelect, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const box = useRef<HTMLDivElement>(null)
  const cur = items.find((i) => i.id === current)
  const name = current === ALL ? 'Все бизнесы' : cur?.name ?? ''

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
  const startRename = () => {
    setOpen(false)
    cancelled.current = false
    setDraft(name)
    setNaming(true)
  }
  const rename = () => {
    if (!cancelled.current && draft.trim() && draft.trim() !== name) edit?.onRename(draft.trim())
    setNaming(false)
  }

  return (
    <>
      <div className="switcher" ref={box}>
        <Row
          lead={cur ? <span className={`tone-dot ${cur.tone}`} /> : <Icon name="grid" size={20} />}
          end={(
            <button className="row-switch" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Другой бизнес" title="Другой бизнес">
              <Icon name="chevron" size={18} stroke={2.2} className={open ? 'flip-v' : undefined} />
            </button>
          )}
        >
          {naming ? (
            <form onSubmit={(e) => { e.preventDefault(); rename() }}>
              <input
                className="row-input" value={draft} autoFocus aria-label="Название бизнеса"
                onFocus={(e) => e.target.select()} onChange={(e) => setDraft(e.target.value)} onBlur={rename}
                onKeyDown={(e) => { if (e.key === 'Escape') { cancelled.current = true; setNaming(false) } }}
              />
            </form>
          ) : (
            <button className="row-name" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
              <b>{name}</b>
            </button>
          )}
        </Row>
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
            <button role="menuitem" className="sw-item" onClick={() => { setOpen(false); onAdd() }}>
              <span className="sw-ico"><Icon name="plus" size={16} /></span>
              <span className="sw-text"><b>Добавить бизнес</b></span>
            </button>
            {edit && (
              <button role="menuitem" className="sw-item" onClick={startRename}>
                <span className="sw-ico"><Icon name="pencil" size={16} /></span>
                <span className="sw-text"><b>Переименовать</b></span>
              </button>
            )}
          </div>
        )}
      </div>

      {edit ? (
        <Row icon="tax">
          <Dropdown<RegimeId>
            label="Система налогов" value={edit.regime} onChange={edit.onRegime}
            options={REGIMES.filter((r) => !r.onlyIP || edit.form === 'ИП').map((r) => ({ value: r.id, label: r.name }))}
          />
        </Row>
      ) : (
        <Row icon="grid">{items.length} {plural(items.length, 'бизнес', 'бизнеса', 'бизнесов')} вместе</Row>
      )}
    </>
  )
}
