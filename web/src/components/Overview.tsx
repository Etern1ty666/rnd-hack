import type { Evaluation } from '../lib/evaluate'
import type { Bill } from '../lib/bills'
import { compact } from '../lib/format'
import { Bills } from './Bills'

export interface OverviewItem {
  id: string
  name: string
  ev: Evaluation
}

/** Сводка по всем бизнесам: где проблема и что платить первым. Суммы и список бизнесов — справа. */
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
      {/* где проблема — так же, как статус на прогнозе: точка цвета и одна фраза */}
      <section className="risk-card">
        <div className="risk-head">
          <span className={`tone-dot ${worst ? worst.ev.status.tone : 'ok'}`} />
          <b>{worst ? `${worst.name}: ${worst.ev.status.title.charAt(0).toLowerCase()}${worst.ev.status.title.slice(1)}` : 'Во всех бизнесах на платежи хватает'}</b>
        </div>
        <p className="risk-note">{worst ? worst.ev.status.sub : `Свободно ${compact(free)}\u00a0₽ на всех счетах.`}</p>
      </section>
      <Bills bills={bills} title="Ближайшие платежи" />
    </>
  )
}
