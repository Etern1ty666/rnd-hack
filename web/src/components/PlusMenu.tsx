import type { ViWidget } from '../lib/vi'
import { Icon, type IconName } from './Icon'

interface Props {
  /** Разделы бизнеса, которые Vi показывает прямо в переписке. */
  tools: { w: ViWidget; label: string; icon: IconName }[]
  onAttach: () => void
  onSheet: (s: 'add' | 'qr') => void
  onShow: (w: ViWidget, label: string) => void
}

/**
 * Меню «+» в строке ввода — одним списком, без подменю: сначала как добавить платёж
 * (файл, поля, QR со счёта), под чертой — разделы, которые Vi покажет в переписке.
 */
export function PlusMenu({ tools, onAttach, onSheet, onShow }: Props) {
  return (
    <div className="vi-plus-menu" role="menu">
      <button type="button" role="menuitem" onClick={onAttach}><Icon name="clip" size={18} /> Прикрепить файл</button>
      <button type="button" role="menuitem" onClick={() => onSheet('add')}><Icon name="pencil" size={18} /> Платёж по полям</button>
      <button type="button" role="menuitem" onClick={() => onSheet('qr')}><Icon name="qr" size={18} /> Сканировать QR со счёта</button>
      <span className="vi-plus-sep" role="separator" />
      {tools.map((t) => (
        <button key={t.w} type="button" role="menuitem" onClick={() => onShow(t.w, t.label)}><Icon name={t.icon} size={18} /> {t.label}</button>
      ))}
    </div>
  )
}
