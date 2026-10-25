import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

interface Option<T extends string> {
  value: T
  label: string
  hint?: string
}

interface Props<T extends string> {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  /** Для экранного диктора: что выбираем. */
  label: string
}

/**
 * Свой выпадающий список вместо системного: значение — просто текст строки, без стрелок;
 * нажали — список с галочкой у выбранного. Стрелки и Enter с клавиатуры, Esc — закрыть.
 */
export function Dropdown<T extends string>({ value, options, onChange, label }: Props<T>) {
  const [open, setOpen] = useState(false)
  // открыли с клавиатуры — фокус сразу на выбранный пункт; мышью — без фокуса, чтобы не было двух подсветок
  const [keys, setKeys] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    if (keys) list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (v: T) => {
    setOpen(false)
    if (v !== value) onChange(v)
  }
  const step = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const from = i < 0 ? items.findIndex((x) => x.getAttribute('aria-selected') === 'true') : i
    items[(from + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="dd" ref={box}>
      <button className="dd-value" onClick={(e) => { setKeys(e.detail === 0); setOpen(!open) }} aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current.label}`}>
        {current.label}
      </button>
      {open && (
        <div className="switcher-menu dd-menu" role="listbox" aria-label={label} ref={list} onKeyDown={step}>
          {options.map((o) => (
            <button key={o.value} role="option" aria-selected={o.value === value} className="sw-item" onClick={() => pick(o.value)}>
              <span className="sw-text"><b>{o.label}</b>{o.hint && <span>{o.hint}</span>}</span>
              {o.value === value && <Icon name="check" size={18} stroke={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
