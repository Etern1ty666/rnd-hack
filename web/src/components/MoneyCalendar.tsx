import { useState } from 'react'
import type { CompanyData } from '../lib/types'
import type { Sim } from '../lib/model'
import { compact, MONTHS_NOM, parseDate, toISO } from '../lib/format'

interface Props {
  data: CompanyData
  sim: Sim
  minEvent: number
}

/** Календарь денег: в каждом дне — сколько останется; цвет — риск. */
export function MoneyCalendar({ data, sim, minEvent }: Props) {
  const months = [...new Set(sim.days.map((d) => d.slice(0, 7)))].filter((m) => sim.days.filter((d) => d.startsWith(m)).length > 7)
  const [month, setMonth] = useState(months[0])
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const histMap = new Map(data.history.map((h) => [h.d, h.b]))

  const cells: React.ReactNode[] = []
  for (let i = 0; i < lead; i++) cells.push(<div key={`e${i}`} className="cell empty" />)
  let lastHist = data.balanceNow
  for (let day = 1; day <= nDays; day++) {
    const d = toISO(new Date(Date.UTC(y, m - 1, day)))
    const wd = parseDate(d).getUTCDay()
    const idx = sim.days.indexOf(d)
    const isPast = d <= data.asOf
    if (isPast && histMap.has(d)) lastHist = histMap.get(d)!
    if (idx < 0 && !isPast) {
      cells.push(<div key={d} className="cell empty" />)
      continue
    }
    const bal = isPast ? lastHist : sim.center[idx]
    const p = isPast ? 0 : sim.pNeg[idx]
    const evs = isPast ? [] : sim.events.filter((e) => e.date === d && Math.abs(e.amount) >= minEvent)
    const net = evs.reduce((s, e) => s + e.amount, 0)
    const cls = [
      'cell',
      isPast ? 'past' : '',
      !isPast && bal < 0 ? 'gap' : !isPast && p >= 0.2 ? 'risk' : '',
      !isPast && (wd === 0 || wd === 6) ? 'wknd' : '',
    ].join(' ')
    cells.push(
      <div key={d} className={cls} title={evs.map((e) => `${e.title}: ${compact(e.amount, true)}`).join('\n')}>
        <b>{day}</b>
        {net !== 0 && <span className="cell-net num">{compact(net, true)}</span>}
        <span className="cell-bal num">{compact(bal)}</span>
      </div>,
    )
  }

  return (
    <div>
      {months.length > 1 && (
        <div className="seg" style={{ marginBottom: 14 }}>
          {months.map((mm) => (
            <button key={mm} className={mm === month ? 'on' : ''} onClick={() => setMonth(mm)}>{MONTHS_NOM[+mm.slice(5) - 1]}</button>
          ))}
        </div>
      )}
      <div className="cal">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells}
      </div>
      <div className="legend" style={{ marginTop: 12 }}>
        <span><i className="sw" style={{ background: 'var(--yellow-wash)' }} /> может не хватить</span>
        <span><i className="sw" style={{ background: 'var(--red-wash)' }} /> минус</span>
      </div>
    </div>
  )
}
