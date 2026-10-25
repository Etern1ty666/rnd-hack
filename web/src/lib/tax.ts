import type { CatKey, CompanyData, PlannedEvent } from './types'
import { INCOME_CATS } from './categories'

/**
 * Налоговый календарь по выбранной системе. Без бухгалтера владелец не знает,
 * сколько и когда платить, — считаем за него из выписки:
 * выручка и расходы по месяцам → сумма налога → дата платежа (ЕНП 28-го, АУСН 25-го).
 */
export type RegimeId = 'usn6' | 'usn15' | 'ausn' | 'psn' | 'osno' | 'eshn'

export interface Regime {
  id: RegimeId
  name: string
  hint: string
  onlyIP?: boolean
}

export const REGIMES: Regime[] = [
  { id: 'usn6', name: 'УСН «Доходы» 6%', hint: '6% с выручки, раз в квартал' },
  { id: 'usn15', name: 'УСН «Доходы минус расходы» 15%', hint: '15% с прибыли, раз в квартал' },
  { id: 'ausn', name: 'АУСН 8%', hint: '8% с выручки каждый месяц, без взносов' },
  { id: 'psn', name: 'Патент', hint: 'фиксированная сумма, только для ИП', onlyIP: true },
  { id: 'osno', name: 'Общая система (с НДС)', hint: 'НДС каждый месяц и налог на прибыль' },
  { id: 'eshn', name: 'ЕСХН 6%', hint: 'для сельского хозяйства, раз в полгода' },
]

const EXPENSE_CATS: CatKey[] = ['suppliers', 'salary', 'rent', 'utilities', 'services', 'marketing', 'bank', 'tax']
const PURCHASE_CATS: CatKey[] = ['suppliers', 'rent', 'utilities', 'services', 'marketing']

const key = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function taxEvents(data: CompanyData, regime: RegimeId, form: string): PlannedEvent[] {
  const sums = (cats: CatKey[]) => {
    const m = new Map<string, number>()
    for (const r of data.categories.monthly) if (cats.includes(r.cat)) m.set(r.m, (m.get(r.m) ?? 0) + r.v)
    return (ks: string[]) => ks.reduce((s, k) => s + (m.get(k) ?? 0), 0)
  }
  const inc = sums(INCOME_CATS)
  const exp = sums(EXPENSE_CATS)
  const purch = sums(PURCHASE_CATS)
  const sal = sums(['salary'])

  const f = data.forecast
  const months = [...new Set(f.days.map((d) => d.slice(0, 7)))]
  const out: PlannedEvent[] = []
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number)
    const due = `${ym}-${regime === 'ausn' ? 25 : 28}`
    let i = f.days.indexOf(due)
    while (i >= 0 && i < f.days.length && !f.businessDay[i]) i++
    if (i < 0 || i >= f.days.length) continue

    const prev = [key(y, m - 1)]
    const quarterDue = [1, 4, 7, 10].includes(m)
    const prevQ = [key(y, m - 3), key(y, m - 2), key(y, m - 1)]
    const qNum = m === 1 ? 4 : (m - 1) / 3
    const parts: { label: string; amount: number }[] = []

    // зарплатные налоги: НДФЛ 13% и взносы ~15% (МСП) с начисленной зарплаты; платим «на руки» 87%
    const payroll = sal(prev) / 0.87
    if (regime === 'ausn') {
      if (payroll) parts.push({ label: 'НДФЛ сотрудников', amount: payroll * 0.13 })
      parts.push({ label: 'АУСН', amount: inc(prev) * 0.08 })
    } else if (payroll) {
      parts.push({ label: 'за сотрудников', amount: payroll * 0.28 })
    }

    if (regime === 'usn6' && quarterDue) {
      const t = inc(prevQ) * 0.06
      const deduct = Math.min((sal(prevQ) / 0.87) * 0.15, t * 0.5)
      parts.push({ label: `УСН за ${qNum} кв.`, amount: t - deduct })
    }
    if (regime === 'usn15' && quarterDue) {
      parts.push({ label: `УСН за ${qNum} кв.`, amount: Math.max((inc(prevQ) - exp(prevQ)) * 0.15, inc(prevQ) * 0.01) })
    }
    if (regime === 'osno') {
      // НДС прошлого квартала платится тремя равными частями
      parts.push({ label: 'НДС', amount: (Math.max(0, inc(prevQ) - purch(prevQ)) * 0.22) / 1.22 / 3 })
      if (quarterDue) {
        const profit = Math.max(0, inc(prevQ) / 1.22 - exp(prevQ))
        parts.push({ label: form === 'ООО' ? 'налог на прибыль' : 'НДФЛ', amount: profit * (form === 'ООО' ? 0.25 : 0.13) })
      }
    }
    if (regime === 'eshn' && m === 7) {
      const h1 = [1, 2, 3, 4, 5, 6].map((k) => key(y, k))
      parts.push({ label: 'ЕСХН за полгода', amount: Math.max(0, inc(h1) - exp(h1)) * 0.06 })
    }

    const total = parts.reduce((s, p) => s + p.amount, 0)
    if (total < 100) continue
    out.push({
      id: `tax-${ym}`,
      date: f.days[i],
      amount: -Math.round(total),
      cat: 'tax',
      kind: 'tax',
      title: `Налог: ${parts.map((p) => p.label).join(' + ')}`,
      cp: 'ФНС России',
      source: 'tax_calendar',
    })
  }
  return out
}
