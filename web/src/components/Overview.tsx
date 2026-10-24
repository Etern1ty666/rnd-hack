import type { Evaluation } from '../lib/evaluate'
import type { Bill } from '../lib/bills'
import { compact } from '../lib/format'
import { Bills } from './Bills'
import { Icon } from './Icon'

export interface OverviewItem {
  id: string
  name: string
  ev: Evaluation
}

/** Сводка по всем бизнесам: где проблема и что платить первым. Суммы и список бизнесов — слева. */
export function Overview({ items }: { items: OverviewItem[] }) {
  const free = items.reduce((s, i) => s + i.ev.free, 0)
  const worst = items.find((i) => i.ev.status.tone === 'short') ?? items.find((i) => i.ev.status.tone === 'risk')
  const bills: Bill[] = items
    .flatMap((i) => i.ev.bills.map((b) => ({ ...b, key: `${i.id}:${b.key}`, note: i.name })))
    .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
    .slice(0, 10)

  return (
    <>
      <h1 className="page-title">Все бизнесы</h1>
      <div className={`status ${worst ? worst.ev.status.tone : 'ok'}`}>
        <span className="status-ico">
          <Icon name={!worst ? 'check' : worst.ev.status.tone === 'risk' ? 'warn' : 'cross'} size={18} stroke={2.4} />
        </span>
        <div>
          <b>{worst ? `${worst.name}: ${worst.ev.status.title.charAt(0).toLowerCase()}${worst.ev.status.title.slice(1)}` : 'Во всех бизнесах на платежи хватает'}</b>
          <span>{worst ? worst.ev.status.sub : `Свободно ${compact(free)}\\u00a0₽ на всех счетах.`}</span>
        </div>
      </div>
      <Bills bills={bills} title="Ближайшие платежи" />
    </>
  )
}
