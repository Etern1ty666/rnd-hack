import { useState } from 'react'
import { incomeLine, type Evaluation } from '../lib/evaluate'
import { Bills } from './Bills'
import { MoneyCalendar } from './MoneyCalendar'

/** Платежи в переписке: списком или календарём — у каждого такого блока свой переключатель. */
export function PaymentsWidget({ ev, onAdd }: { ev: Evaluation; onAdd: () => void }) {
  const [view, setView] = useState<'list' | 'cal'>('list')
  return (
    <>
      <div className="seg">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Список</button>
        <button className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')}>Календарь</button>
      </div>
      {view === 'list'
        ? <Bills bills={ev.bills} title="На ближайшие 30 дней" income={incomeLine(ev.data, ev.sim)} onAdd={onAdd} />
        : <MoneyCalendar data={ev.data} sim={ev.sim} minEvent={ev.minEvent} />}
    </>
  )
}
