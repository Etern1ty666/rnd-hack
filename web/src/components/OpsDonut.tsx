import { useState } from 'react'
import type { CatKey, CompanyData } from '../lib/types'
import { CATS } from '../lib/categories'
import { compact, rub } from '../lib/format'

/** Цвет закреплён за категорией, а не за местом в рейтинге — при смене вкладки не перекрашивается. */
const OUT: [CatKey, string][] = [
  ['suppliers', '#2a78d6'], ['salary', '#eb6834'], ['owner_out', '#1baf7a'], ['tax', '#eda100'],
  ['rent', '#e87ba4'], ['utilities', '#008300'], ['services', '#6250d6'],
]
const IN: [CatKey, string][] = [
  ['card', '#2a78d6'], ['sbp', '#eb6834'], ['cash', '#1baf7a'], ['clients', '#eda100'], ['marketplace', '#e87ba4'],
]
const OTHER = '#b9b8b2'

/** «Операции за 90 дней»: кольцо и подписи-таблетки, как в банковском приложении. */
export function OpsDonut({ data }: { data: CompanyData }) {
  const [tab, setTab] = useState<'out' | 'in'>('out')
  const [hover, setHover] = useState<string | null>(null)
  const c = data.categories.last90
  const known = tab === 'out' ? OUT : IN
  const skip = new Set<CatKey>(['transfer_out', 'refund_in', 'refund_out', 'loan_in', 'owner_in'])
  const outCats: CatKey[] = ['suppliers', 'salary', 'owner_out', 'tax', 'rent', 'utilities', 'services', 'marketing', 'bank', 'loan', 'other']
  const inCats: CatKey[] = ['card', 'sbp', 'cash', 'clients', 'marketplace']
  const cats = (tab === 'out' ? outCats : inCats).filter((k) => !skip.has(k) && (c[k] ?? 0) > 0)
  const rows = known.filter(([k]) => cats.includes(k)).map(([k, color]) => ({ key: k as string, label: CATS[k].label, v: c[k]!, color }))
  const rest = cats.filter((k) => !known.some(([x]) => x === k)).reduce((s, k) => s + (c[k] ?? 0), 0)
  if (rest > 0) rows.push({ key: 'rest', label: 'Прочее', v: rest, color: OTHER })
  rows.sort((a, b) => b.v - a.v)
  const total = rows.reduce((s, r) => s + r.v, 0)
  const focus = rows.find((r) => r.key === hover)

  const R = 70
  const W = 18
  const C = 2 * Math.PI * R
  const gap = rows.length > 1 ? 3 : 0
  let acc = 0

  return (
    <section className="card-block donut-card">
      <div className="donut-head">
        <h2>Операции за 90 дней</h2>
        <div className="seg">
          <button className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>Траты</button>
          <button className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>Поступления</button>
        </div>
      </div>
      <div className="donut-body">
        <div className="pills">
          {rows.map((r) => (
            <button
              key={r.key} className={`pill ${hover === r.key ? 'on' : ''}`}
              onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.key)} onBlur={() => setHover(null)}
            >
              <i style={{ background: r.color }} />
              <span>{r.label}</span>
              <b className="num">{compact(r.v)}</b>
            </button>
          ))}
        </div>
        <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={`${tab === 'out' ? 'Траты' : 'Поступления'} по категориям`}>
          <g transform="rotate(-90 90 90)">
            {rows.map((r) => {
              const len = (r.v / total) * C
              const seg = (
                <circle
                  key={r.key} cx={90} cy={90} r={R} fill="none" stroke={r.color} strokeWidth={hover === r.key ? W + 4 : W}
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`} strokeDashoffset={-acc}
                  onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}
                  opacity={hover && hover !== r.key ? 0.35 : 1}
                />
              )
              acc += len
              return seg
            })}
          </g>
          <text x={90} y={88} textAnchor="middle" fontSize={17} fontWeight={800} fill="var(--ink)">{rub(focus ? focus.v : total).replace(/\u00a0₽$/, ' ₽')}</text>
          <text x={90} y={108} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{focus ? focus.label : tab === 'out' ? 'всего потрачено' : 'всего пришло'}</text>
        </svg>
      </div>
    </section>
  )
}
