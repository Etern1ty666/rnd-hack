import type { Bill } from '../lib/bills'
import { compact, fmtDayShort } from '../lib/format'
import { Icon } from './Icon'

/** Платежи компактным списком — для ответа Vi и карточки справа. */
export function MiniBills({ bills }: { bills: Bill[] }) {
  return (
    <ul className="vi-bills">
      {bills.map((b) => (
        <li key={b.key} className={b.status}>
          <span className="bill-mark">
            {b.status === 'ok' ? <Icon name="check" size={12} stroke={2.8} /> : b.status === 'risk' ? '!' : <Icon name="cross" size={11} stroke={2.8} />}
          </span>
          <span className="vi-bill-date">{fmtDayShort(b.date)}</span>
          <span className="vi-bill-name">{b.label}{b.note && <small>{b.note}</small>}</span>
          <span className="vi-bill-sum num">
            {compact(b.amount)}
            {b.status === 'short' && <small>не хватит {compact(b.short)}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}
