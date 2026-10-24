import { useLayoutEffect, useRef, useState } from 'react'
import type { CompanyData } from '../lib/types'
import type { Sim } from '../lib/model'
import { compact, fmtDay, fmtDayShort } from '../lib/format'
import { Icon } from './Icon'

/** Можно ли верить прогнозу: три числа, план-факт и откуда данные. */
export function Trust({ data, sim }: { data: CompanyData; sim: Sim }) {
  const bt = data.backtest
  const has = (pred: (e: Sim['events'][number]) => boolean) => sim.events.some(pred)
  const sources = [
    { name: 'Выписка банка', on: true },
    { name: 'Зарплата и аренда', on: has((e) => e.cat === 'salary' || e.cat === 'rent') },
    { name: 'Налоговый календарь', on: has((e) => e.cat === 'tax') },
    { name: 'Счета из 1С', on: has((e) => e.source === '1c') },
    { name: 'Ваши события', on: has((e) => e.source === 'manual') },
    { name: 'Маркетплейсы', on: false },
  ]
  return (
    <div className="trust">
      <div className="trust-nums">
        <div>
          <b>±{compact(bt.mae.d14.model)}</b>
          <span>ошибка через 2 недели</span>
        </div>
        <div>
          <b>{Math.round(bt.coverage * 100)}%</b>
          <span>фактов внутри серой зоны</span>
        </div>
        <div>
          <b>{bt.gapWindows ? `${bt.gapCaught} из ${bt.gapWindows}` : '—'}</b>
          <span>{bt.gapWindows ? 'прошлых разрывов заметили заранее' : 'разрывов в прошлом не было'}</span>
        </div>
      </div>

      {bt.planFact && (
        <>
          <p className="lead-note">Прогноз от {fmtDay(bt.planFact.cutoff)} и что было на самом деле:</p>
          <PlanFact pf={bt.planFact} />
        </>
      )}

      <p className="lead-note" style={{ marginTop: 28 }}>Что учтено</p>
      <div className="sources">
        {sources.map((s) => (
          <span key={s.name} className={s.on ? '' : 'off'}><Icon name={s.on ? 'check' : 'cross'} size={14} stroke={2.2} /> {s.name}</span>
        ))}
      </div>
    </div>
  )
}

function PlanFact({ pf }: { pf: NonNullable<CompanyData['backtest']['planFact']> }) {
  // ширину меряем, а не растягиваем viewBox — иначе на широком экране раздуваются подписи
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(560)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth, 280)))
    ro.observe(el)
    setW(Math.max(el.clientWidth, 280))
    return () => ro.disconnect()
  }, [])
  const H = 200
  const m = { l: 4, r: 4, t: 10, b: 22 }
  const vals = [...pf.lo, ...pf.hi, ...pf.adj]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const x = (i: number) => m.l + (i / (pf.days.length - 1)) * (W - m.l - m.r)
  const y = (v: number) => m.t + ((max - v) / (max - min || 1)) * (H - m.t - m.b)
  const line = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const band = line(pf.hi) + pf.lo.map((_, k) => { const i = pf.lo.length - 1 - k; return `L${x(i).toFixed(1)},${y(pf.lo[i]).toFixed(1)}` }).join('') + 'Z'
  return (
    <>
      <div ref={box}>
        <svg width={W} height={H} style={{ display: 'block' }} role="img" aria-label="Прогноз и факт за прошлый месяц">
          {min < 0 && <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke="var(--red)" strokeWidth={1} />}
          <path d={band} fill="var(--ink)" opacity={0.07} />
          <path d={line(pf.det)} fill="none" stroke="var(--ink)" strokeWidth={2} />
          <path d={line(pf.adj)} fill="none" stroke="var(--blue)" strokeWidth={2} />
          <text x={m.l} y={H - 4} fontSize={11} fill="var(--ink-3)">{fmtDayShort(pf.days[0])}</text>
          <text x={W - m.r} y={H - 4} fontSize={11} fill="var(--ink-3)" textAnchor="end">{fmtDayShort(pf.days.at(-1)!)}</text>
        </svg>
      </div>
      <div className="legend">
        <span><i className="key-line" /> прогноз</span>
        <span><i className="key-line" style={{ background: 'var(--blue)' }} /> факт</span>
      </div>
    </>
  )
}
