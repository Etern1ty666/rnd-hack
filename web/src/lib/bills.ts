import type { CatKey, PlannedEvent } from './types'
import type { Sim, Verdict } from './model'
import { compact, fmtDay, pct, shortName } from './format'

/**
 * Владелец малого бизнеса думает не «остатком на счёте», а счетами:
 * «хватит на зарплату? на аренду? на налог?». Здесь будущие списания
 * превращаются в такие счета со статусом.
 */
export type BillStatus = 'ok' | 'risk' | 'short'

export interface Bill {
  key: string
  date: string
  label: string
  note?: string
  amount: number
  status: BillStatus
  /** Сколько не хватит именно на этот платёж. */
  short: number
}

const LABEL: Partial<Record<CatKey, string>> = {
  salary: 'Зарплата',
  tax: 'Налог',
  rent: 'Аренда',
  loan: 'Кредит',
  utilities: 'Свет, вода, связь',
  services: 'Услуги и сервисы',
  marketing: 'Реклама',
  suppliers: 'Закупки',
  owner_out: 'На себя',
  manual: '',
  other: 'Расход',
}

function billLabel(e: PlannedEvent): { label: string; note?: string } {
  if (e.cat === 'salary') return { label: 'Зарплата', note: e.title.includes('аванс') ? 'аванс' : 'расчёт' }
  if (e.cat === 'tax') return { label: 'Налог', note: e.title.startsWith('Налог: ') ? e.title.slice(7) : 'посчитали за вас' }
  if (e.cat === 'owner_out') return { label: 'На себя', note: 'обычно в это время' }
  if (e.cat === 'loan' && e.kind === 'action') return { label: 'Вернуть овердрафт' }
  if (e.kind === 'manual') return { label: e.title, note: 'вы добавили' }
  if (e.cat === 'services' || e.cat === 'marketing') return { label: LABEL[e.cat]!, note: shortName(e.cp) }
  return { label: LABEL[e.cat] ?? e.title }
}

/** В каком порядке владелец платит, когда денег мало: сначала люди и государство. */
const PRIORITY: Partial<Record<CatKey, number>> = { salary: 0, tax: 1, loan: 2, rent: 3, utilities: 4 }

export function buildBills(sim: Sim, horizon: number, minEvent: number): Bill[] {
  const H = Math.min(horizon, sim.days.length)
  const byDay = new Map<number, Map<string, { label: string; note?: string; amount: number; prio: number }>>()
  for (const e of sim.events) {
    const i = sim.days.indexOf(e.date)
    if (i < 0 || i >= H || e.amount >= 0) continue
    const important = ['salary', 'tax', 'rent', 'loan', 'owner_out', 'manual'].includes(e.cat) || -e.amount >= minEvent
    if (!important) continue
    const { label, note } = billLabel(e)
    const day = byDay.get(i) ?? new Map()
    const prev = day.get(label)
    day.set(label, { label, note: prev?.note ?? note, amount: (prev?.amount ?? 0) - e.amount, prio: PRIORITY[e.cat] ?? 9 })
    byDay.set(i, day)
  }
  const out: Bill[] = []
  for (const [i, day] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const list = [...day.values()].sort((a, b) => a.prio - b.prio || b.amount - a.amount)
    // сколько было в этот день до этих платежей — его и раздаём по очереди
    let left = sim.center[i] + list.reduce((s, b) => s + b.amount, 0)
    for (const b of list) {
      const short = Math.max(0, Math.min(b.amount, b.amount - left))
      left -= b.amount
      const status: BillStatus = short > 0 ? 'short' : sim.pNeg[i] >= 0.2 ? 'risk' : 'ok'
      out.push({ key: `${sim.days[i]}:${b.label}`, date: sim.days[i], label: b.label, note: b.note, amount: b.amount, status, short })
    }
  }
  return out
}

/** «Не хватит на …» — винительный падеж. */
const ACC: Record<string, string> = {
  'Зарплата': 'зарплату', 'Аренда': 'аренду', 'Налог': 'налог', 'Кредит': 'кредит',
  'Свет, вода, связь': 'свет и связь', 'Закупки': 'закупки', 'На себя': 'себя',
}
const acc = (label: string) => ACC[label] ?? label.toLowerCase()

export interface StatusLine {
  tone: 'ok' | 'risk' | 'short'
  title: string
  sub: string
}

/** Одна строка наверху: хватит ли на платежи и сколько можно взять себе. */
export function statusLine(sim: Sim, v: Verdict, bills: Bill[]): StatusLine {
  if (v.status === 'gap') {
    const b = bills.find((x) => x.status === 'short')
    const worst = bills.reduce((m, x) => (x.short > (m?.short ?? 0) ? x : m), undefined as Bill | undefined)
    const later = worst && b && worst.date !== b.date ? `К ${fmtDay(worst.date)} не хватит уже ${compact(v.shortfall)}\u00a0₽` : `Не хватит ${compact(v.shortfall)}\u00a0₽`
    return {
      tone: 'short',
      title: b ? `${fmtDay(b.date)} не хватит на ${acc(b.label)}` : `${fmtDay(v.day!)} деньги закончатся`,
      sub: `${later} · вероятность ${pct(v.prob)}.`,
    }
  }
  if (v.status === 'risk') {
    const b = bills.find((x) => x.status !== 'ok')
    const hope = sim.events
      .filter((e) => e.amount > 0 && e.clientId && e.date <= v.day!)
      .sort((a, c) => c.amount - a.amount)[0]
    return {
      tone: 'risk',
      title: b ? `${fmtDay(b.date)} может не хватить на ${acc(b.label)}` : `${fmtDay(v.day!)} может не хватить`,
      sub: `${hope ? `Если «${shortName(hope.cp)}» задержит оплату` : 'Если выручка просядет'}, не хватит до ${compact(v.shortfall)}\u00a0₽ · вероятность ${pct(v.prob)}.`,
    }
  }
  const big = bills.reduce((m, x) => (x.amount > (m?.amount ?? 0) ? x : m), undefined as Bill | undefined)
  return {
    tone: 'ok',
    title: 'На все платежи хватает',
    sub: big ? `Самый крупный платёж — ${big.label.toLowerCase()} ${fmtDay(big.date)}, ${compact(big.amount)}\u00a0₽.` : 'Крупных платежей в ближайший месяц нет.',
  }
}
