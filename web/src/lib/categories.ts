import type { CatKey, Source } from './types'
import type { IconName } from '../components/Icon'

interface CatMeta {
  label: string
  icon: IconName
}

/** Категории называем так, как сказал бы сам предприниматель, а не бухгалтер. */
export const CATS: Record<CatKey, CatMeta> = {
  card: { label: 'Выручка картой', icon: 'card' },
  sbp: { label: 'Выручка по QR', icon: 'qr' },
  cash: { label: 'Выручка наличными', icon: 'cash' },
  marketplace: { label: 'Выплаты маркетплейсов', icon: 'bag' },
  clients: { label: 'Оплаты клиентов', icon: 'doc' },
  owner_in: { label: 'Вы доложили своих', icon: 'owner' },
  loan_in: { label: 'Кредиты', icon: 'bank' },
  refund_in: { label: 'Возвраты', icon: 'refund' },
  salary: { label: 'Зарплата', icon: 'people' },
  tax: { label: 'Налоги', icon: 'tax' },
  rent: { label: 'Аренда', icon: 'house' },
  loan: { label: 'Кредит', icon: 'bank' },
  utilities: { label: 'Свет, вода, связь', icon: 'bolt' },
  services: { label: 'Услуги и сервисы', icon: 'cloud' },
  marketing: { label: 'Реклама', icon: 'megaphone' },
  bank: { label: 'Комиссии банка', icon: 'percent' },
  suppliers: { label: 'Закупки', icon: 'box' },
  owner_out: { label: 'На себя', icon: 'owner' },
  transfer_out: { label: 'В другой банк', icon: 'transfer' },
  refund_out: { label: 'Возвраты', icon: 'refund' },
  manual: { label: 'Ваше событие', icon: 'pencil' },
  other: { label: 'Прочее', icon: 'dots' },
}

/** Доходы бизнеса — от них считаем «из каждых 100 ₽». */
export const INCOME_CATS: CatKey[] = ['card', 'sbp', 'cash', 'marketplace', 'clients']
export const REVENUE_CATS = new Set<CatKey>(['card', 'sbp', 'cash', 'marketplace', 'clients'])
/** Постоянные расходы для сценария «расходы выросли». */
export const FIXED_CATS = new Set<CatKey>(['rent', 'suppliers', 'services', 'utilities'])
/** Обязательные платежи — их срыв и есть кассовый разрыв. */
export const MANDATORY_CATS = new Set<CatKey>(['salary', 'tax', 'rent', 'loan', 'utilities'])

export const SOURCES: Record<Source, { label: string; short: string }> = {
  statement: { label: 'Из истории выписки', short: 'по истории' },
  tax_calendar: { label: 'Налоговый календарь', short: 'налоговый календарь' },
  '1c': { label: 'Счёт из 1С', short: 'счёт из 1С' },
  manual: { label: 'Добавили вы', short: 'вы добавили' },
  bank: { label: 'Данные банка', short: 'банк' },
}
