import type { CompanyData, PlannedEvent } from './types'
import { combine, simulate, suggestActions, verdict, type Mods, type Sim } from './model'
import { buildBills, statusLine, type StatusLine } from './bills'
import { REVENUE_CATS } from './categories'
import { applySettings, type BizSettings } from './settings'
import { compact, fmtDay } from './format'
import { confirmCandidates, type Answers } from './confirm'

export const HORIZON = 30

/**
 * Всё, что нужно экрану одного бизнеса: прогноз до и после выбранных шагов,
 * платежи со статусами, свободные деньги и строка статуса.
 * Считается за миллисекунды, поэтому для сводки прогоняем все бизнесы сразу.
 */
export function evaluate(raw: CompanyData, settings: BizSettings, manual: PlannedEvent[], applied: Set<string>, answers: Answers = {}) {
  const data = applySettings(raw, settings)
  const minEvent = Math.max(15000, Math.round(data.avgDailyOut * 30 * 0.03))
  const overrides = Object.fromEntries(Object.entries(answers).filter(([, a]) => a.s !== 'yes').map(([id, a]) => [id, a.s === 'no' ? null : a.v!]))
  const baseMods: Mods = { shifts: {}, extra: manual.filter((e) => data.forecast.days.includes(e.date)), overrides }
  const baseSim = simulate(data, baseMods)
  const before = verdict(baseSim, HORIZON)
  // подсказки считаем от прогноза без шагов, чтобы список не прыгал при нажатии
  const actions = suggestActions(data, baseSim, before)
  const mods = combine(baseMods, ...actions.filter((a) => applied.has(a.id)).map((a) => a.apply))
  const sim = applied.size ? simulate(data, mods) : baseSim
  const now = verdict(sim, HORIZON)
  const bills = buildBills(sim, HORIZON, minEvent)
  // свободно — сколько можно потратить, чтобы риск не хватить на платежи остался ниже 20%
  // (тот же порог, что у статуса «хватает»: 20-й перцентиль остатка ≥ 0 каждый день)
  const p20 = sim.center.slice(0, HORIZON).map((c, i) => c - 0.8416 * ((sim.hi[i] - sim.lo[i]) / 2.563))
  const free = Math.max(0, Math.floor((Math.min(...p20) - settings.cushion) / 10000) * 10000)
  const total = settings.accounts.reduce((s, a) => s + a.balance, 0)
  const fixed = applied.size > 0 && before.status !== 'ok' && now.status === 'ok'
  const status: StatusLine = fixed
    ? { tone: 'ok', title: 'С этими шагами на все платежи хватит', sub: `Без них ${fmtDay(before.day!)} не хватило бы ${compact(before.shortfall)}\u00a0₽.` }
    : statusLine(sim, now, bills)
  const questions = confirmCandidates(baseSim, HORIZON, minEvent, answers)
  return { data, minEvent, baseSim, before, actions, mods, sim, now, bills, free, total, status, questions }
}

export type Evaluation = ReturnType<typeof evaluate>

/** Что приходит и уже учтено — одной строкой, чтобы было понятно, откуда берутся деньги на платежи. */
export function incomeLine(data: CompanyData, sim: Sim): string {
  const f = data.forecast
  const bdays = f.businessDay.slice(0, HORIZON).filter(Boolean).length || 1
  const daily = f.baseline
    .filter((b) => b.sign > 0 && REVENUE_CATS.has(b.cat))
    .reduce((s, b) => s + b.values.slice(0, HORIZON).reduce((a, v) => a + v, 0), 0) / bdays
  const fromClients = sim.events.filter((e) => e.clientId && e.amount > 0 && sim.days.indexOf(e.date) < HORIZON)
  const parts: string[] = []
  if (daily > 5000) parts.push(`выручку ≈ ${compact(daily)}\u00a0₽ в рабочий день`)
  if (fromClients.length) parts.push(`${fromClients.length} оплат от клиентов на ${compact(fromClients.reduce((s, e) => s + e.amount, 0))}\u00a0₽`)
  return parts.length ? `Уже учли ${parts.join(' и ')}.` : ''
}
