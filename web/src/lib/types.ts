import type { BankId } from './banks'

export type CatKey =
  | 'card' | 'sbp' | 'cash' | 'marketplace' | 'clients' | 'owner_in' | 'loan_in' | 'refund_in'
  | 'salary' | 'tax' | 'rent' | 'loan' | 'utilities' | 'services' | 'marketing' | 'bank'
  | 'suppliers' | 'owner_out' | 'transfer_out' | 'refund_out' | 'manual' | 'other'

export type Source = 'statement' | 'tax_calendar' | '1c' | 'manual' | 'bank'

export interface PlannedEvent {
  id: string
  date: string
  amount: number
  cat: CatKey
  kind: 'recurring' | 'tax' | 'invoice' | 'pattern' | 'manual' | 'action'
  title: string
  cp: string
  source: Source
  clientId?: string
  docNo?: number
  docDate?: string
  overdueDays?: number
}

export interface Baseline {
  cat: CatKey
  sign: 1 | -1
  values: number[]
}

export interface Client {
  id: string
  name: string
  payments: number
  docs: number
  total: number
  medianDelay: number | null
  p90Delay: number | null
  delays: number[]
  lastPayment: string
  regular: boolean
}

export interface CompanyData {
  company: {
    id: string
    name: string
    inn: string
    legalForm: string
    industry: string
    firstDate: string
    /** Есть у бизнеса из загруженной выписки: из какого банка файл. */
    bank?: BankId
  }
  asOf: string
  balanceNow: number
  /** Остаток с копейками — для карточки счёта. */
  balanceExact?: number
  avgDailyOut: number
  history: { d: string; b: number; i: number; o: number }[]
  forecast: {
    days: string[]
    businessDay: boolean[]
    baseline: Baseline[]
    lo: number[]
    mid: number[]
    hi: number[]
    mcPneg: number[]
    mcPgap: number
  }
  events: PlannedEvent[]
  clients: Client[]
  categories: {
    last90: Partial<Record<CatKey, number>>
    prev90: Partial<Record<CatKey, number>>
    monthly: { m: string; cat: CatKey; v: number }[]
  }
  topups: { d: string; amount: number }[]
  quality: {
    rows: number
    duplicates: number
    emptyPurpose: number
    emptyInn: number
    gaps: { start: string; end: string; days: number; jump: number }[]
    refunds: number
  }
  backtest: {
    cutoffs: number
    monthlyOutflow: number
    mae: Record<'d7' | 'd14' | 'd30', { model: number; flat: number; lastMonth: number }>
    coverageRaw: number
    coverage: number
    bandScale: number
    gapWindows: number
    gapCaught: number
    avgLeadDays: number | null
    falseAlarms: number
    planFact: {
      cutoff: string
      days: string[]
      actual: number[]
      adj: number[]
      det: number[]
      lo: number[]
      hi: number[]
    } | null
  }
}
