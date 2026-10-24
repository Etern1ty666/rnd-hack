import { useEffect } from 'react'
import { Icon } from './Icon'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
}

/** Боковая панель для второстепенного: главный экран остаётся чистым. */
export function Drawer({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Icon name="cross" size={22} /></button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  )
}
