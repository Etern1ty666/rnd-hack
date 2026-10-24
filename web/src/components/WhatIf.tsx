import { useMemo, useState } from 'react'
import type { CompanyData } from '../lib/types'
import { simulate, verdict, type Mods, type Sim, type Verdict } from '../lib/model'
import { compact, fmtDay, fmtDayShort, shortName } from '../lib/format'
import { ForecastChart } from './ForecastChart'

interface Props {
  data: CompanyData
  baseMods: Mods
  baseSim: Sim
  baseVerdict: Verdict
  horizon: number
}

type Key = 'delay' | 'closure' | 'drop' | 'oneoff' | 'fixed'

/** Песочница: включаешь неприятность — видишь, что станет с деньгами. */
export function WhatIf({ data, baseMods, baseSim, baseVerdict, horizon }: Props) {
  const clients = useMemo(() => {
    const sums = new Map<string, number>()
    for (const e of baseSim.events) if (e.clientId && e.amount > 0) sums.set(e.clientId, (sums.get(e.clientId) ?? 0) + e.amount)
    return data.clients.filter((c) => sums.has(c.id)).sort((a, b) => (sums.get(b.id) ?? 0) - (sums.get(a.id) ?? 0))
  }, [data, baseSim])

  const [on, setOn] = useState<Set<Key>>(new Set([clients.length ? 'delay' : 'drop']))
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [delayDays, setDelayDays] = useState(21)
  const [closureDays, setClosureDays] = useState(7)
  const [drop, setDrop] = useState(20)
  const [oneAmount, setOneAmount] = useState(150000)
  const [oneDay, setOneDay] = useState(9)
  const [fix, setFix] = useState(15)

  const chips: { key: Key; label: string }[] = [
    ...(clients.length ? [{ key: 'delay' as Key, label: 'Клиент задержит оплату' }] : []),
    { key: 'drop', label: `Выручка −${drop}%` },
    { key: 'oneoff', label: 'Внеплановый расход' },
    { key: 'fixed', label: `Расходы +${fix}%` },
    { key: 'closure', label: 'Точка закроется' },
  ]
  const toggle = (k: Key) => {
    const next = new Set(on)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setOn(next)
  }

  const mods: Mods = {
    ...baseMods,
    clientDelay: on.has('delay') && clientId ? { clientId, days: delayDays } : undefined,
    closure: on.has('closure') ? { from: 2, days: closureDays } : undefined,
    revenueDrop: on.has('drop') ? drop / 100 : undefined,
    fixedUp: on.has('fixed') ? fix / 100 : undefined,
    extra: on.has('oneoff')
      ? [...baseMods.extra, { id: 'oneoff', date: baseSim.days[oneDay], amount: -oneAmount, cat: 'other', kind: 'manual', title: 'Внеплановый расход', cp: '', source: 'manual' }]
      : baseMods.extra,
  }
  const sim = simulate(data, mods)
  const v = verdict(sim, horizon)
  const active = on.size > 0

  return (
    <div className="whatif">
      <div className="chips">
        {chips.map((c) => (
          <button key={c.key} className={`chip-btn ${on.has(c.key) ? 'on' : ''}`} onClick={() => toggle(c.key)} aria-pressed={on.has(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="scen-controls">
          {on.has('delay') && (
            <label>
              <span>Кто задержит</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => <option key={c.id} value={c.id}>{shortName(c.name)}</option>)}
              </select>
              <select value={delayDays} onChange={(e) => setDelayDays(+e.target.value)} aria-label="На сколько">
                {[14, 21, 28].map((d) => <option key={d} value={d}>на {d / 7} нед.</option>)}
              </select>
            </label>
          )}
          {on.has('drop') && (
            <label>
              <span>Выручка ниже на</span>
              <input type="range" min={10} max={30} step={5} value={drop} onChange={(e) => setDrop(+e.target.value)} />
              <b>{drop}%</b>
            </label>
          )}
          {on.has('oneoff') && (
            <label>
              <span>Расход</span>
              <input type="number" step={10000} min={0} value={oneAmount} onChange={(e) => setOneAmount(+e.target.value)} />
              <select value={oneDay} onChange={(e) => setOneDay(+e.target.value)} aria-label="Когда">
                {baseSim.days.slice(0, horizon).map((d, i) => <option key={d} value={i}>{fmtDayShort(d)}</option>)}
              </select>
            </label>
          )}
          {on.has('fixed') && (
            <label>
              <span>Аренда и закупки дороже на</span>
              <input type="range" min={5} max={30} step={5} value={fix} onChange={(e) => setFix(+e.target.value)} />
              <b>{fix}%</b>
            </label>
          )}
          {on.has('closure') && (
            <label>
              <span>Закрыто дней</span>
              <select value={closureDays} onChange={(e) => setClosureDays(+e.target.value)}>
                {[3, 7, 14].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="outcome">
        <div>
          <span className="muted">Сейчас</span>
          <b>{say(baseVerdict)}</b>
        </div>
        <div>
          <span className="muted">Если это случится</span>
          <b className={active && v.status === 'gap' ? 'red' : ''}>{active ? say(v) : '—'}</b>
        </div>
      </div>

      <ForecastChart
        asOf={data.asOf} balanceNow={data.balanceNow} history={data.history} sim={baseSim}
        compare={active ? sim : undefined} horizon={horizon} histDays={7} height={280}
      />
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i className="key-line" style={{ opacity: 0.35 }} /> сейчас</span>
        <span><i className="key-line" style={{ background: 'var(--red)' }} /> если случится</span>
      </div>
    </div>
  )
}

function say(v: Verdict): string {
  if (v.status === 'gap') return `${fmtDay(v.day!)} не хватит ${compact(v.shortfall)}`
  if (v.status === 'risk') return `${fmtDay(v.day!)} может не хватить ${compact(v.shortfall)}`
  return `хватит, минимум ${compact(v.minValue)}`
}
