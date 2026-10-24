import type { Bill } from '../lib/bills'
import { compact, fmtWeekday, parseDate } from '../lib/format'
import { Icon } from './Icon'

interface Props {
  bills: Bill[]
  title?: string
  income?: string
  onAdd?: () => void
}

/** Платежи месяца как список счетов: напротив каждого — хватит или нет. */
export function Bills({ bills, title = 'Платежи', income, onAdd }: Props) {
  let lastMonth = -1
  return (
    <section className="bills">
      <div className="bills-head">
        <h2>{title}</h2>
        {onAdd && <button className="link" onClick={onAdd}><Icon name="plus" size={16} /> Добавить</button>}
      </div>
      {income && <p className="bills-income">{income}</p>}
      <ul>
        {bills.map((b) => {
          const d = parseDate(b.date)
          const showMonth = d.getUTCMonth() !== lastMonth
          lastMonth = d.getUTCMonth()
          return (
            <li key={b.key} className={`bill ${b.status}`}>
              <span className="bill-mark" aria-label={b.status === 'ok' ? 'хватит' : b.status === 'risk' ? 'может не хватить' : 'не хватит'}>
                {b.status === 'ok' ? <Icon name="check" size={14} stroke={2.6} /> : b.status === 'risk' ? '!' : <Icon name="cross" size={13} stroke={2.6} />}
              </span>
              <span className="bill-date">
                <b>{d.getUTCDate()}</b>
                <span>{showMonth ? d.toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }).replace('.', '') : fmtWeekday(b.date)}</span>
              </span>
              <span className="bill-name">
                {b.label}
                {b.note && <span>{b.note}</span>}
              </span>
              <span className="bill-sum num">
                {compact(b.amount)}
                {b.status === 'short' && <span>не хватит {compact(b.short)}</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
