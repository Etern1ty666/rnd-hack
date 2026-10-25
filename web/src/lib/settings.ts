import type { CompanyData } from './types'
import type { BankId } from './banks'
import { taxEvents, type RegimeId } from './tax'

export interface Account {
  id: string
  bank: BankId
  name: string
  balance: number
  /** Основной счёт — по нему есть выписка, остаток не редактируется. */
  main?: boolean
  inForecast: boolean
  /** Последние цифры номера счёта — из выписки. */
  last4?: string
  /** Откуда остаток: выписка или вручную. */
  source?: 'statement' | 'manual'
  /** Дата, на которую известен остаток из выписки. */
  asOf?: string
}

export interface BizSettings {
  name: string
  industry: string
  form: 'ИП' | 'ООО'
  regime: RegimeId
  accounts: Account[]
  /** Неприкосновенный запас: эти деньги не считаем свободными. */
  cushion: number
}

export const INDUSTRIES = [
  'Общепит (кофейня, кафе)', 'Розница: продуктовый магазин', 'Розница: одежда и обувь', 'Продажи на маркетплейсах',
  'Оптовая торговля', 'IT-услуги и разработка', 'Строительство и ремонт', 'Грузоперевозки', 'Автосервис',
  'Салон красоты', 'Медицинская клиника / стоматология', 'Образовательный центр для детей',
  'Производство мебели на заказ', 'Гостиница / база отдыха', 'Сельское хозяйство (растениеводство)', 'Другое',
]

/** Демо-счета: основной — из выписки кейса, остальные — как будто добавлены вручную. */
const DEMO_ACCOUNTS: Record<string, { name: string; main: BankId; extra: Omit<Account, 'id' | 'inForecast'>[] }> = {
  C140: { name: 'Кафе', main: 'sber', extra: [{ bank: 'tbank', name: 'Карта', balance: 18412.37 }, { bank: 'cash', name: 'Касса', balance: 12050 }] },
  C047: { name: 'IT-студия', main: 'tochka', extra: [{ bank: 'tbank', name: 'Карта', balance: 120384.15 }] },
  C065: { name: 'Кофейня', main: 'tbank', extra: [{ bank: 'sber', name: 'Счёт для налогов', balance: 85000 }, { bank: 'ozon', name: 'Озон Карта', balance: 23517.64 }] },
}

export function defaultSettings(data: CompanyData): BizSettings {
  const demo = DEMO_ACCOUNTS[data.company.id]
  const q = data.company.name.match(/«(.+?)»/)
  return {
    // в датасете имена обезличены («Предприниматель-663») — для демо даём понятные
    name: demo?.name ?? (q ? q[1] : data.company.name),
    industry: data.company.industry,
    form: data.company.legalForm === 'ИП' ? 'ИП' : 'ООО',
    // какая-то система налогов выбрана всегда; чаще всего у малого бизнеса — УСН «Доходы»
    regime: 'usn6',
    accounts: [
      { id: 'main', bank: data.company.bank ?? demo?.main ?? 'other', name: 'Расчётный счёт', balance: data.balanceExact ?? data.balanceNow, main: true, inForecast: true },
      ...(demo?.extra ?? []).map((a, i) => ({ ...a, id: `demo${i}`, inForecast: true })),
    ],
    cushion: 0,
  }
}

/**
 * Данные с учётом настроек: прогноз стартует с суммы по всем счетам, которые
 * пользователь включил, а налоги считаются по выбранной системе.
 */
export function applySettings(data: CompanyData, s: BizSettings): CompanyData {
  const extra = s.accounts.filter((a) => !a.main && a.inForecast).reduce((sum, a) => sum + a.balance, 0)
  const mainOn = s.accounts.find((a) => a.main)?.inForecast ?? true
  const shift = extra - (mainOn ? 0 : data.balanceNow)
  const events = [...data.events.filter((e) => e.cat !== 'tax'), ...taxEvents(data, s.regime, s.form)].sort((a, b) => a.date.localeCompare(b.date))
  return {
    ...data,
    balanceNow: data.balanceNow + shift,
    // история есть только по основному счёту — сдвигаем её на остатки остальных, чтобы линия не рвалась
    history: data.history.map((h) => ({ ...h, b: h.b + shift })),
    events,
  }
}
