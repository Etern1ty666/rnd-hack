import type { PlannedEvent } from './types'
import type { Sim } from './model'
import { compact, fmtDay, shortName } from './format'

/**
 * Подтверждения в один тап: сервис сам угадывает будущие платежи по выписке
 * и спрашивает владельца «верно?» — вместо того чтобы заставлять его что-то вводить.
 */
export interface Answer {
  s: 'yes' | 'no' | 'amount'
  v?: number
}
export type Answers = Record<string, Answer>

export interface Question {
  id: string
  text: string
  amount: number
  /** Подпись кнопки «Не будет» под смысл вопроса. */
  no: string
  income: boolean
}

function phrase(e: PlannedEvent): { text: string; no: string } {
  const sum = `${compact(Math.abs(e.amount))}\u00a0₽`
  const day = fmtDay(e.date)
  switch (e.cat) {
    case 'salary': return { text: `Похоже, ${day} — ${e.title.includes('аванс') ? 'аванс' : 'зарплата'} сотрудникам ${sum}. Верно?`, no: 'Не будет' }
    case 'tax': return { text: `${day} — налог около ${sum}. Сумма верная?`, no: 'Не будет' }
    case 'rent': return { text: `Похоже, ${day} — аренда ${sum}. Верно?`, no: 'Не будет' }
    case 'loan': return { text: `${day} — платёж по кредиту ${sum}. Верно?`, no: 'Не будет' }
    case 'owner_out': return { text: `Обычно в это время вы берёте себе около ${sum}. ${day} будет так же?`, no: 'Не возьму' }
    case 'clients': return { text: `«${shortName(e.cp)}» заплатит ${sum} около ${day}?`, no: 'Не заплатит' }
    default: return { text: `Похоже, ${day} — ${e.title.toLowerCase()} ${sum}. Верно?`, no: 'Не будет' }
  }
}

/** Самые крупные непроверенные догадки на ближайший месяц, по порядку дат. */
export function confirmCandidates(sim: Sim, horizon: number, minEvent: number, answers: Answers): Question[] {
  const H = Math.min(horizon, sim.days.length)
  return sim.events
    .filter((e) => !answers[e.id] && ['recurring', 'tax', 'invoice'].includes(e.kind) && Math.abs(e.amount) >= minEvent)
    .filter((e) => { const i = sim.days.indexOf(e.date); return i >= 0 && i < H })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ id: e.id, amount: Math.abs(e.amount), income: e.amount > 0, ...phrase(e) }))
}
