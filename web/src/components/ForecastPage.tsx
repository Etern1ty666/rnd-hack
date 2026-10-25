import { useState } from 'react'
import { HORIZON, type Evaluation } from '../lib/evaluate'
import type { ViWidget } from '../lib/vi'
import { compact, fmtDay, fmtDayShort, fmtWeekday, pct, rub, shortName } from '../lib/format'
import type { Sim } from '../lib/model'
import { CATS } from '../lib/categories'
import { ForecastChart } from './ForecastChart'
import { ActionList } from './ActionList'
import { Icon } from './Icon'

interface Props {
  ev: Evaluation
  applied: Set<string>
  onToggle: (id: string) => void
  /** «Подробно о точности» и «что если» — Vi показывает в чате. */
  onShow: (w: ViWidget, label: string) => void
}

// сначала две недели по дням, остальное — по кнопке
const FIRST = 14

/** Как назвать событие в строке дня: клиента — по имени, остальное — статьёй, как в платежах. */
function eventName(e: Sim['events'][number]): string {
  if (e.clientId) return shortName(e.cp)
  if (e.cat === 'tax') return 'Налог'
  if (e.cat === 'salary' || e.kind === 'manual' || e.kind === 'action') return e.title
  return CATS[e.cat].label
}

/** Вероятность минуса: крайние значения честнее показать как «меньше 5%». */
const chance = (p: number) => (p < 0.05 ? 'меньше 5%' : p > 0.95 ? 'больше 95%' : pct(p))

/**
 * Прогноз — отдельной страницей из меню: риск разрыва (когда, сколько не хватит, вероятность),
 * шаги «как успеть», график остатка с коридором и остаток на каждый день горизонта.
 */
export function ForecastPage({ ev, applied, onToggle, onShow }: Props) {
  const [all, setAll] = useState(false)
  const { sim, now, status, data } = ev
  const H = Math.min(HORIZON, sim.days.length)
  const bt = data.backtest

  const nums: [string, string][] = now.status === 'gap'
    ? [['Когда', fmtDay(now.day!)], ['Не хватит', rub(now.shortfall)], ['Вероятность', chance(now.prob)]]
    : now.status === 'risk'
      ? [['Когда может не хватить', fmtDay(now.day!)], ['Не хватит до', rub(now.shortfall)], ['Вероятность', chance(now.prob)]]
      : [['Самый тонкий день', fmtDay(now.minDay)], ['Останется', rub(now.minValue)], ['Вероятность разрыва', chance(now.prob)]]

  const rows = sim.days.slice(0, H).map((d, i) => {
    const evs = sim.events.filter((e) => e.date === d && Math.abs(e.amount) >= ev.minEvent / 2)
    const tone = sim.center[i] < 0 ? 'short' : sim.pNeg[i] >= 0.2 ? 'risk' : 'ok'
    return { d, i, evs, tone }
  })

  return (
    <>
      <h1 className="page-title">Прогноз</h1>
      <p className="page-sub">Сколько денег будет на счетах каждый день — на {H} дней вперёд</p>

      <section className={`risk-card ${status.tone}`}>
        <div className="risk-head">
          <span className={`tone-dot ${status.tone}`} />
          <b>{status.title}</b>
        </div>
        <div className="risk-nums">
          {nums.map(([k, v]) => (
            <div key={k}><span>{k}</span><b className="num">{v}</b></div>
          ))}
        </div>
        <p className="risk-note">Вероятность — шанс, что в самый опасный день денег окажется меньше нуля: выручка гуляет, а клиенты задерживают оплату.</p>
      </section>

      {ev.actions.length > 0 && (
        <section className="card-block">
          <h2>Как успеть</h2>
          <ActionList actions={ev.actions} applied={applied} onToggle={onToggle} />
        </section>
      )}

      <section className="card-block">
        <h2>Остаток по дням</h2>
        <ForecastChart
          asOf={data.asOf} balanceNow={data.balanceNow} history={data.history} sim={sim}
          horizon={H} histDays={14} height={340} rail minEvent={ev.minEvent}
        />
        <div className="legend chart-legend">
          <span><i className="key-line" style={{ background: 'var(--ink-3)' }} /> по выписке</span>
          <span><i className="key-line" /> прогноз</span>
          <span><i className="key-band" /> скорее всего (8 дней из 10)</span>
        </div>
      </section>

      <section className="card-block">
        <h2>Каждый день</h2>
        <div className="day-row day-head" aria-hidden="true">
          <span>День</span><span>Что будет</span><span>Остаток</span><span>Риск</span>
        </div>
        <ol className="day-list">
          {(all ? rows : rows.slice(0, FIRST)).map(({ d, i, evs, tone }) => (
            <li key={d} className={`day-row ${tone}`}>
              <span className="day-date"><b>{fmtDayShort(d)}</b><small>{fmtWeekday(d)}</small></span>
              <span className="day-what">
                {evs.length > 0 && <span>{evs.map(eventName).join(' · ')}</span>}
                <small className="num">{Math.abs(sim.flow[i]) < 500 ? 'без движения' : `${compact(sim.flow[i], true)} за день`}</small>
              </span>
              <span className="day-bal num">
                <b>{rub(sim.center[i])}</b>
                <small>{compact(sim.lo[i])} … {compact(sim.hi[i])}</small>
              </span>
              <span className="day-risk num">{sim.pNeg[i] < 0.05 ? '—' : pct(sim.pNeg[i])}</span>
            </li>
          ))}
        </ol>
        {!all && rows.length > FIRST && (
          <button className="link day-more" onClick={() => setAll(true)}>Показать все {rows.length} дней <Icon name="chevron" size={16} /></button>
        )}
      </section>

      <p className="page-foot">
        Модель проверена на вашей истории: через 2 недели ошибается в среднем на ±{compact(bt.mae.d14.model)}&nbsp;₽,
        в серую зону попадает {pct(bt.coverage)} реальных дней.
        <span className="page-links">
          <button className="link" onClick={() => onShow('trust', 'Точность прогноза')}>Насколько точен <Icon name="arrow" size={14} /></button>
          <button className="link" onClick={() => onShow('whatif', 'Что если')}>Посчитать «что если» <Icon name="arrow" size={14} /></button>
        </span>
      </p>
    </>
  )
}
