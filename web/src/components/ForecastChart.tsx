import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Sim } from '../lib/model'
import { addDays, compact, fmtDayShort, fmtWeekdayFull, fmtDay, parseDate, pct, rub } from '../lib/format'
import { CATS } from '../lib/categories'
import { Icon } from './Icon'

interface Props {
  asOf: string
  balanceNow: number
  history: { d: string; b: number }[]
  sim: Sim
  /** Сценарий для сравнения — рисуется красным пунктиром поверх базового прогноза. */
  compare?: Sim
  horizon: number
  histDays?: number
  height?: number
  rail?: boolean
  /** Минимальная сумма события, чтобы оно стало «станцией» на рельсе. */
  minEvent?: number
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v))
  return out
}

export function ForecastChart({ asOf, balanceNow, history, sim, compare, horizon, histDays = 14, height = 320, rail = false, minEvent = 20000 }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(960)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(el.clientWidth, 320)))
    ro.observe(el)
    setW(Math.max(el.clientWidth, 320))
    return () => ro.disconnect()
  }, [])

  const H = Math.min(horizon, sim.days.length)
  const N = histDays + H + 1
  const start = addDays(asOf, -histDays)

  // История по календарным дням: в выходные остаток не меняется
  const hist = useMemo(() => {
    const map = new Map(history.map((h) => [h.d, h.b]))
    const out: number[] = []
    let last = history.filter((h) => h.d <= start).at(-1)?.b ?? history[0]?.b ?? balanceNow
    for (let i = 0; i <= histDays; i++) {
      const d = addDays(start, i)
      if (map.has(d)) last = map.get(d)!
      out.push(i === histDays ? balanceNow : last)
    }
    return out
  }, [history, start, histDays, balanceNow])

  const m = { l: 58, r: 18, t: 30, b: rail ? 88 : 30 }
  const plotH = height - m.t - m.b
  const step = (w - m.l - m.r) / (N - 1)
  const x = (i: number) => m.l + i * step

  const fc = sim.center.slice(0, H)
  const lo = sim.lo.slice(0, H)
  const hi = sim.hi.slice(0, H)
  const cmp = compare?.center.slice(0, H)
  const all = [...hist, ...lo, ...hi, ...(cmp ?? []), 0]
  let yMin = Math.min(...all)
  let yMax = Math.max(...all)
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad
  const y = (v: number) => m.t + ((yMax - v) / (yMax - yMin)) * plotH
  const ticks = niceTicks(yMin, yMax, 4)

  const T = histDays // индекс «сегодня»
  const line = (vals: number[], offset: number) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const histPath = line(hist, 0)
  const fcPath = `M${x(T)},${y(balanceNow)}` + fc.map((v, i) => `L${x(T + 1 + i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const cmpPath = cmp ? `M${x(T)},${y(balanceNow)}` + cmp.map((v, i) => `L${x(T + 1 + i).toFixed(1)},${y(v).toFixed(1)}`).join('') : ''
  const band =
    `M${x(T)},${y(balanceNow)}` +
    hi.map((v, i) => `L${x(T + 1 + i).toFixed(1)},${y(v).toFixed(1)}`).join('') +
    lo.map((_, k) => { const i = H - 1 - k; return `L${x(T + 1 + i).toFixed(1)},${y(lo[i]).toFixed(1)}` }).join('') + 'Z'

  const target = cmp ?? fc
  const gapI = target.findIndex((v) => v < 0)
  const gapMin = gapI >= 0 ? Math.min(...target.slice(gapI)) : 0

  // Станции на рельсе: крупные события, сгруппированные по дням
  const stations = useMemo(() => {
    const byDay = new Map<string, Sim['events']>()
    for (const e of (compare ?? sim).events) {
      if (Math.abs(e.amount) < minEvent) continue
      const i = sim.days.indexOf(e.date)
      if (i < 0 || i >= H) continue
      byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
    }
    const list = [...byDay.entries()]
      .map(([d, evs]) => ({ d, i: sim.days.indexOf(d), evs }))
      .sort((a, b) => a.i - b.i)
    // соседние дни сливаем в одну станцию, чтобы кружки не налезали друг на друга
    const minGap = Math.ceil(28 / step)
    const merged: { d: string; i: number; evs: Sim['events'] }[] = []
    for (const s of list) {
      const last = merged.at(-1)
      if (last && s.i - last.i < minGap) last.evs = [...last.evs, ...s.evs]
      else merged.push({ ...s })
    }
    return merged.map((s) => {
      s.evs.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      return { ...s, net: s.evs.reduce((acc, e) => acc + e.amount, 0) }
    })
  }, [sim, compare, H, minEvent, step])

  const railY = height - 44
  const dayAt = (i: number) => addDays(start, i)

  const onMove = (ev: React.PointerEvent<SVGRectElement>) => {
    const rect = (ev.currentTarget as SVGRectElement).ownerSVGElement!.getBoundingClientRect()
    const i = Math.round((ev.clientX - rect.left - m.l) / step)
    setHover(Math.max(0, Math.min(N - 1, i)))
  }

  let tip: React.ReactNode = null
  if (hover !== null) {
    const d = dayAt(hover)
    const isF = hover > T
    const j = hover - T - 1
    const val = isF ? fc[j] : hist[hover]
    const evs = isF ? (compare ?? sim).events.filter((e) => e.date === d) : []
    const left = Math.min(Math.max(x(hover) + 14, 0), w - 220)
    tip = (
      <div className="tip" style={{ left: x(hover) > w - 240 ? x(hover) - 214 : left, top: 18 }}>
        <div style={{ color: '#bdbcb6', marginBottom: 2 }}>{fmtDay(d)}, {fmtWeekdayFull(d)}{hover === T ? ' · сегодня' : ''}</div>
        <div className="tip-val">{isF ? '≈ ' : ''}{rub(val)}</div>
        {isF && <div className="tip-row"><span>скорее всего от</span><span>{compact(lo[j])} до {compact(hi[j])}</span></div>}
        {isF && cmp && <div className="tip-row"><span style={{ color: '#ff8a80' }}>в сценарии</span><span>{rub(cmp[j])}</span></div>}
        {isF && (compare ?? sim).pNeg[j] > 0.05 && <div className="tip-row"><span>риск минуса</span><span>{pct((compare ?? sim).pNeg[j])}</span></div>}
        {evs.length > 0 && <hr />}
        {evs.slice(0, 5).map((e) => (
          <div key={e.id} className="tip-row" style={{ color: '#fff' }}>
            <span>{e.title}</span><span style={{ color: e.amount > 0 ? '#7ddca3' : '#fff' }}>{compact(e.amount, true)}</span>
          </div>
        ))}
        {!isF && hover !== T && <div className="tip-row"><span>факт по выписке</span></div>}
      </div>
    )
  }

  return (
    <div className="chart" ref={box} style={{ position: 'relative' }}>
      <svg width={w} height={height} role="img" aria-label="График остатка денег: история и прогноз">
        {/* Зона «денег нет» */}
        {yMin < 0 && <rect x={m.l} y={y(0)} width={w - m.l - m.r} height={m.t + plotH - y(0)} fill="var(--red)" opacity={0.06} />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--red)' : 'var(--line)'} strokeWidth={1} />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={t === 0 ? 'var(--red)' : 'var(--ink-3)'} className="num">
              {t === 0 ? '0 ₽' : compact(t)}
            </text>
          </g>
        ))}

        {/* Ось дат: понедельники и первые числа */}
        {Array.from({ length: N }, (_, i) => {
          const d = parseDate(dayAt(i))
          const first = d.getUTCDate() === 1
          if (!first && d.getUTCDay() !== 1) return null
          // на узком экране подписываем не каждый понедельник
          const every = Math.max(1, Math.ceil(56 / (step * 7)))
          if (!first && Math.floor(i / 7) % every !== 0) return null
          if (!first && [1, 2, 3, -1, -2, -3].some((k) => parseDate(dayAt(i + k)).getUTCDate() === 1 && i + k >= 0 && i + k < N)) return null
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={m.t + plotH} y2={m.t + plotH + 5} stroke="var(--line-2)" />
              <text x={x(i)} y={m.t + plotH + 18} textAnchor="middle" fontSize={11} fontWeight={first ? 700 : 400} fill={first ? 'var(--ink)' : 'var(--ink-3)'}>
                {fmtDayShort(dayAt(i))}
              </text>
            </g>
          )
        })}

        <path d={band} fill="var(--ink)" opacity={0.08} />
        <path d={histPath} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinejoin="round" />
        <path d={fcPath} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" opacity={cmp ? 0.35 : 1} />
        {cmp && <path d={cmpPath} fill="none" stroke="var(--red)" strokeWidth={2.2} strokeDasharray="6 4" strokeLinejoin="round" />}

        {/* Сегодня */}
        <line x1={x(T)} x2={x(T)} y1={m.t - 14} y2={m.t + plotH} stroke="var(--ink)" strokeWidth={1} />
        <text x={x(T)} y={m.t - 18} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink-3)">сегодня</text>
        <circle cx={x(T)} cy={y(balanceNow)} r={5} fill="var(--ink)" stroke="var(--paper)" strokeWidth={2} />

        {/* Первый день минуса */}
        {gapI >= 0 && (
          <g>
            <circle cx={x(T + 1 + gapI)} cy={y(target[gapI])} r={6} fill="var(--red)" stroke="var(--paper)" strokeWidth={2} />
            <text
              x={x(T + 1 + gapI)} y={y(gapMin) + 22} fontSize={12} fontWeight={700} fill="var(--red)"
              textAnchor={x(T + 1 + gapI) > w - 110 ? 'end' : x(T + 1 + gapI) < m.l + 110 ? 'start' : 'middle'}
            >
              {fmtDayShort(sim.days[gapI])} — деньги кончаются
            </text>
          </g>
        )}

        {/* Рельс со станциями — крупные платежи и поступления */}
        {rail && (
          <g>
            <text x={m.l - 8} y={railY + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">события</text>
            <line x1={x(T)} x2={x(T + H)} y1={railY} y2={railY} stroke="var(--ink)" strokeWidth={2} />
            {stations.map((s) => {
              const cx = x(T + 1 + s.i)
              const main = s.evs[0]
              const isIn = s.net > 0
              return (
                <g key={s.d} transform={`translate(${cx - 12},${railY - 12})`}>
                  <circle cx={12} cy={12} r={12} fill="var(--paper)" stroke={isIn ? 'var(--green)' : 'var(--ink)'} strokeWidth={1.8} />
                  <g transform="translate(4,4)" color={isIn ? 'var(--green)' : 'var(--ink)'}>
                    <Icon name={CATS[main.cat].icon} size={16} stroke={1.8} />
                  </g>
                  {s.evs.length > 1 && (
                    <g transform="translate(17,-5)">
                      <circle cx={5} cy={5} r={7} fill="var(--ink)" />
                      <text x={5} y={8.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">{s.evs.length}</text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + plotH} stroke="var(--ink)" strokeWidth={1} opacity={0.5} />
            <circle cx={x(hover)} cy={y(hover > T ? fc[hover - T - 1] : hist[hover])} r={5} fill="var(--ink)" stroke="var(--paper)" strokeWidth={2} />
            {cmp && hover > T && <circle cx={x(hover)} cy={y(cmp[hover - T - 1])} r={5} fill="var(--red)" stroke="var(--paper)" strokeWidth={2} />}
          </g>
        )}
        <rect
          x={m.l} y={0} width={w - m.l - m.r} height={height} fill="transparent"
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        />
      </svg>
      {tip}
    </div>
  )
}
