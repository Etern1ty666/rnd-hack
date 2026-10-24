import type { Account } from '../lib/settings'
import { compact, rub, rubK } from '../lib/format'
import { BankBadge } from './BankBadge'
import { Icon } from './Icon'

/** Общий блок: всего на счетах и сколько из этого свободно. Первый элемент левой колонки. */
export function TotalBlock({ total, free, label = 'Всего на счетах' }: { total: number; free: number; label?: string }) {
  const reserved = Math.max(0, total - free)
  const freeShare = total > 0 ? Math.min(1, free / total) : 0
  return (
    <section className="summary">
      <div className="sum-top">
        <div>
          <span className="sum-label">{label}</span>
          <b className="sum-total">{rub(total)}</b>
        </div>
        <div className="sum-free">
          <span className="sum-label">Свободно</span>
          <b className={free > 0 ? 'pos' : 'zero'}>{rub(free)}</b>
        </div>
      </div>
      <div className="sum-bar" aria-hidden="true">
        <i style={{ width: `${(1 - freeShare) * 100}%` }} />
        <i className="free" style={{ width: `${freeShare * 100}%` }} />
      </div>
      <div className="sum-caption">
        <span>{free > 0 ? `Отложено на платежи — ${compact(reserved)}\u00a0₽` : 'Всё уйдёт на платежи месяца'}</span>
        <span>{free > 0 ? 'можно тратить' : ''}</span>
      </div>
    </section>
  )
}

/** Счета карточками сверху вниз, как в банковском приложении. */
export function AccountList({ accounts, selected, onOpen, onNew }: {
  accounts: Account[]
  asOf: string
  selected?: string
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="acc-list">
      {accounts.map((a) => {
        return (
          <button key={a.id} className={`acc-item ${a.inForecast ? '' : 'off'} ${selected === a.id ? 'on' : ''}`} onClick={() => onOpen(a.id)}>
            <BankBadge bank={a.bank} size={44} round />
            <span className="acc-item-text">
              <b className="num">{rubK(a.balance)}</b>
              <span>{a.name}{a.last4 ? ` •${a.last4}` : ''}</span>
            </span>
            {!a.inForecast && <span className="acc-off" title="Не учитывается в прогнозе"><Icon name="cross" size={14} /></span>}
          </button>
        )
      })}
      <button className="acc-new" onClick={onNew}><Icon name="plus" size={18} stroke={2} /> Новый счёт</button>
    </div>
  )
}
