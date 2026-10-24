import type { CompanyData, PlannedEvent } from './types'
import { FIXED_CATS, REVENUE_CATS } from './categories'
import { addDays, daysBetween, fmtDay, shortName } from './format'

/**
 * Пересчёт прогноза на фронте. Бэкенд отдаёт «кирпичики» — ожидаемые потоки по дням
 * и ширину коридора неопределённости. Фронт складывает их заново при любом изменении:
 * сценарий, принятое действие, событие, добавленное вручную.
 */
export interface Mods {
  /** Сдвиг события в днях: «клиент заплатит раньше», «перенести платёж». */
  shifts: Record<string, number>
  /** Задержка всех оплат одного клиента. */
  clientDelay?: { clientId: string; days: number }
  /** Падение выручки, 0…1. */
  revenueDrop?: number
  /** Рост постоянных расходов, 0…1. */
  fixedUp?: number
  /** Временное закрытие точки: выручки нет с дня from (индекс горизонта) на days дней. */
  closure?: { from: number; days: number }
  /** Дополнительные события: ручной ввод, разовые расходы, овердрафт. */
  extra: PlannedEvent[]
  /** Ответы владельца на подтверждения: null — «не будет», число — «другая сумма». */
  overrides?: Record<string, number | null>
}

export const NO_MODS: Mods = { shifts: {}, extra: [] }

export interface Sim {
  days: string[]
  center: number[]
  lo: number[]
  hi: number[]
  pNeg: number[]
  /** События после всех сдвигов — то, что увидит пользователь на маршруте. */
  events: (PlannedEvent & { shifted?: number })[]
  /** Изменение денег за день. */
  flow: number[]
}

/** Нормальная функция распределения (аппроксимация Абрамовица–Стиган). */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

export function simulate(data: CompanyData, mods: Mods, threshold = 0): Sim {
  const f = data.forecast
  const H = f.days.length
  const flow = new Array<number>(H).fill(0)
  const idx = new Map(f.days.map((d, i) => [d, i]))
  const drop = mods.revenueDrop ?? 0
  const up = mods.fixedUp ?? 0

  for (const b of f.baseline) {
    const k = b.sign > 0 && REVENUE_CATS.has(b.cat) ? 1 - drop : b.sign < 0 && FIXED_CATS.has(b.cat) ? 1 + up : 1
    const cl = mods.closure
    b.values.forEach((v, i) => {
      const closed = cl && b.sign > 0 && i >= cl.from && i < cl.from + cl.days
      flow[i] += closed ? 0 : b.sign * v * k
    })
  }

  const nextBusinessDay = (i: number) => {
    let j = i
    while (j < H && !f.businessDay[j]) j++
    return j
  }

  const events: Sim['events'] = []
  for (const e of [...data.events, ...mods.extra]) {
    let shift = mods.shifts[e.id] ?? 0
    if (mods.clientDelay && e.clientId === mods.clientDelay.clientId) shift += mods.clientDelay.days
    const ov = mods.overrides?.[e.id]
    if (ov === null) continue
    let amount = ov ?? e.amount
    if (e.kind === 'pattern' && amount > 0) amount *= 1 - drop
    if (amount < 0 && FIXED_CATS.has(e.cat)) amount *= 1 + up
    const base = idx.get(e.date)
    if (base === undefined) continue
    const j = nextBusinessDay(Math.max(0, base + shift))
    if (j >= H) continue // уехало за горизонт прогноза
    flow[j] += amount
    events.push({ ...e, amount, date: f.days[j], shifted: shift || undefined })
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount)

  const center: number[] = []
  const lo: number[] = []
  const hi: number[] = []
  const pNeg: number[] = []
  let bal = data.balanceNow
  for (let i = 0; i < H; i++) {
    bal += flow[i]
    const c = bal + f.mid[i]
    const l = bal + f.lo[i]
    const h = bal + f.hi[i]
    center.push(c)
    lo.push(l)
    hi.push(h)
    const sigma = Math.max((h - l) / 2.563, 1)
    pNeg.push(phi((threshold - c) / sigma))
  }
  return { days: f.days, center, lo, hi, pNeg, events, flow }
}

export type Status = 'ok' | 'risk' | 'gap'

export interface Verdict {
  status: Status
  /** Первый день, когда денег может не хватить. */
  day?: string
  dayIdx?: number
  /** Сколько не хватит (положительное число). */
  shortfall: number
  /** Вероятность разрыва за горизонт. */
  prob: number
  /** Самый «тонкий» день. */
  minDay: string
  minValue: number
  horizon: number
  /** Через сколько дней после разрыва деньги снова появятся. */
  recoverDay?: string
}

export function verdict(sim: Sim, horizon = 30): Verdict {
  const H = Math.min(horizon, sim.days.length)
  let minI = 0
  for (let i = 0; i < H; i++) if (sim.center[i] < sim.center[minI]) minI = i
  const prob = Math.max(...sim.pNeg.slice(0, H))
  const base = { prob, minDay: sim.days[minI], minValue: sim.center[minI], horizon: H }

  const firstNeg = sim.center.slice(0, H).findIndex((v) => v < 0)
  if (firstNeg >= 0) {
    const rec = sim.center.findIndex((v, i) => i > firstNeg && v >= 0)
    return {
      ...base, status: 'gap', day: sim.days[firstNeg], dayIdx: firstNeg,
      shortfall: -sim.center[minI], recoverDay: rec >= 0 ? sim.days[rec] : undefined,
    }
  }
  const firstRisk = sim.pNeg.slice(0, H).findIndex((p) => p >= 0.2)
  if (firstRisk >= 0) {
    const worst = Math.min(...sim.lo.slice(0, H))
    return { ...base, status: 'risk', day: sim.days[firstRisk], dayIdx: firstRisk, shortfall: Math.max(0, -worst) }
  }
  return { ...base, status: 'ok', shortfall: 0 }
}

export interface Action {
  id: string
  title: string
  detail: string
  /** Сколько денег действие убирает из опасных дней — для сортировки. */
  impact: number
  apply: (m: Mods) => Mods
}

/**
 * Что можно сделать до разрыва. Каждое действие — это модификатор прогноза,
 * поэтому эффект виден сразу. Показываем не больше трёх: два бесплатных и овердрафт.
 */
export function suggestActions(data: CompanyData, sim: Sim, v: Verdict): Action[] {
  if (v.status === 'ok' || !v.day) return []
  const gapDay = v.day
  const free: Action[] = []
  const k = (v: number) => `${Math.round(Math.abs(v) / 1000)} тыс.`

  // Попросить клиента заплатить раньше: самая крупная оплата в ближайшие 3 недели после разрыва
  const incoming = sim.events
    .filter((e) => e.amount > 0 && e.clientId && e.date >= gapDay && daysBetween(gapDay, e.date) <= 21)
    .sort((a, b) => b.amount - a.amount)[0]
  if (incoming) {
    const target = addDays(gapDay, -2)
    // сдвиг добавляется к уже действующим, поэтому считаем от текущей (сдвинутой) даты
    const shift = daysBetween(incoming.date, target)
    free.push({
      id: `early-${incoming.id}`,
      title: `Попросить «${shortName(incoming.cp)}» оплатить раньше`,
      detail: `${k(incoming.amount)} нужны до ${fmtDay(target)}`,
      impact: incoming.amount,
      apply: (m) => ({ ...m, shifts: { ...m.shifts, [incoming.id]: (m.shifts[incoming.id] ?? 0) + Math.min(0, shift) } }),
    })
  }

  // Перенести крупный необязательный платёж
  const movable = sim.events
    .filter((e) => e.amount < 0 && ['rent', 'suppliers', 'services', 'marketing'].includes(e.cat)
      && e.date <= gapDay && daysBetween(e.date, gapDay) <= 7)
    .sort((a, b) => a.amount - b.amount)[0]
  if (movable) {
    free.push({
      id: `move-${movable.id}`,
      title: `Перенести ${movable.cat === 'rent' ? 'аренду' : 'платёж'} на неделю`,
      detail: `${k(movable.amount)} · договориться с «${shortName(movable.cp)}»`,
      impact: -movable.amount,
      apply: (m) => ({ ...m, shifts: { ...m.shifts, [movable.id]: (m.shifts[movable.id] ?? 0) + 7 } }),
    })
  }

  // Отложить вывод денег себе
  const owner = sim.events.find((e) => e.cat === 'owner_out' && e.date <= addDays(gapDay, 3))
  if (owner) {
    free.push({
      id: `owner-${owner.id}`,
      title: 'Отложить вывод денег себе',
      detail: `${k(owner.amount)} — на 2 недели`,
      impact: -owner.amount,
      apply: (m) => ({ ...m, shifts: { ...m.shifts, [owner.id]: (m.shifts[owner.id] ?? 0) + 14 } }),
    })
  }

  // Подстраховаться овердрафтом: лимит закрывает самый глубокий минус,
  // гасится через 3 дня после последнего минуса
  const need = Math.max(-Math.min(...sim.center), v.shortfall, 50000)
  const amount = Math.ceil((need * 1.15) / 50000) * 50000
  const take = addDays(gapDay, -1)
  let lastNeg = -1
  sim.center.forEach((c, i) => { if (c < 0) lastNeg = i })
  const repayIdx = lastNeg + 3
  const repay = repayIdx < sim.days.length - 1 ? sim.days[repayIdx] : addDays(sim.days[sim.days.length - 1], 1)
  const daysOn = Math.max(daysBetween(take, repay), 7)
  const cost = Math.round((amount * 0.22 * daysOn) / 365 / 100) * 100
  const overdraft: Action = {
    id: 'overdraft',
    title: `Подключить овердрафт на ${k(amount)}`,
    detail: `проценты ≈ ${cost.toLocaleString('ru-RU')} ₽`,
    impact: amount,
    apply: (m) => ({
      ...m,
      extra: [
        ...m.extra,
        ...([
          { id: 'od-in', date: take, amount, cat: 'loan_in', kind: 'action', title: 'Овердрафт', cp: 'Банк', source: 'bank' },
          { id: 'od-out', date: repay, amount: -(amount + cost), cat: 'loan', kind: 'action', title: 'Погашение овердрафта', cp: 'Банк', source: 'bank' },
        ] satisfies PlannedEvent[]).filter((e) => data.forecast.days.includes(e.date)),
      ],
    }),
  }
  return [...free.sort((a, b) => b.impact - a.impact).slice(0, 2), overdraft]
}

export function combine(base: Mods, ...fns: ((m: Mods) => Mods)[]): Mods {
  return fns.reduce((m, fn) => fn(m), base)
}
