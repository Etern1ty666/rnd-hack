/**
 * Модель прогноза в браузере — перенос tools/build_demo_data.py один к одному:
 * категоризация правилами → регулярные платежи и ЕНП → счета клиентов →
 * выручка по дням недели с сезонностью → Монте-Карло → бэктест и калибровка коридора.
 * Нужна, чтобы считать прогноз по выписке, загруженной пользователем, без сервера.
 */
import type { Baseline, CatKey, Client, CompanyData, PlannedEvent } from '../types'
import { addDays, daysBetween, parseDate } from '../format'

export interface Op {
  date: string
  amount: number
  dir: 'in' | 'out'
  cp: string
  inn: string
  purpose: string
  cat: CatKey
}

/* ——— случайные числа с зерном: прогноз одинаковый при каждом открытии ——— */
class Rng {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 }
  next(): number {
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  normal(mu: number, sd: number): number {
    const u = 1 - this.next()
    const v = this.next()
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  /** Целое в [lo, hi). */
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo)) }
  pick<T>(a: T[]): T { return a[Math.floor(this.next() * a.length)] }
}

/* ——— календарь: выходные и основные праздники РФ ——— */
const HOLIDAYS = new Set([
  ...['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '04-29', '04-30', '05-01', '05-09', '05-10', '06-12', '11-04', '12-30', '12-31'].map((d) => `2024-${d}`),
  ...['01-01', '01-02', '01-03', '01-06', '01-07', '01-08', '05-01', '05-02', '05-08', '05-09', '06-12', '06-13', '11-03', '11-04', '12-31'].map((d) => `2025-${d}`),
  ...['01-01', '01-02', '01-05', '01-06', '01-07', '01-08', '01-09', '02-23', '03-09', '05-01', '05-11', '06-12', '11-04', '12-31'].map((d) => `2026-${d}`),
  ...['01-01', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-03', '05-10', '06-14', '11-04', '12-31'].map((d) => `2027-${d}`),
])
export const isBusinessDay = (iso: string) => {
  const wd = parseDate(iso).getUTCDay()
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(iso)
}
function businessDays(fromExcl: string, toIncl: string): string[] {
  const out: string[] = []
  for (let d = addDays(fromExcl, 1); d <= toIncl; d = addDays(d, 1)) if (isBusinessDay(d)) out.push(d)
  return out
}

/* ——— даты и статистика ——— */
const ym = (iso: string) => iso.slice(0, 7)
const ymShift = (key: string, k: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + k, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const daysInMonth = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
/** Как pandas DateOffset(months=k): тот же день, но не дальше конца месяца. */
function addMonths(iso: string, k: number): string {
  const key = ymShift(ym(iso), k)
  return `${key}-${String(Math.min(+iso.slice(8), daysInMonth(key))).padStart(2, '0')}`
}
function quantile(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (!n) return 0
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.min(lo + 1, n - 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
const median = (a: number[]) => quantile([...a].sort((x, y) => x - y), 0.5)
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const dayNum = (iso: string) => parseDate(iso).getTime() / 86400000
const fromNum = (n: number) => new Date(Math.floor(n) * 86400000).toISOString().slice(0, 10)

/* ——— категоризация: те же правила, что в Python ——— */
type Rule = [CatKey, 'in' | 'out', RegExp | null, RegExp | null]
const RULES: Rule[] = [
  ['owner_in', 'in', /собственн|учредител/i, null],
  ['loan_in', 'in', /кредит|займ/i, null],
  ['card', 'in', /эквайринг/i, null],
  ['sbp', 'in', /СБП|QR/i, null],
  ['refund_in', 'in', /^\s*возврат/i, null],
  ['cash', 'in', /наличн|инкассир/i, null],
  ['marketplace', 'in', /маркетплейс|агентск|оферт/i, null],
  ['marketplace', 'in', null, /Маркетплейс/],
  ['clients', 'in', /./, null],
  ['owner_out', 'out', /личн|физического лица|дивиденд|займа учредител/i, null],
  ['transfer_out', 'out', /собственных средств на расчетный счет/i, null],
  ['salary', 'out', /заработн|ГПХ/i, null],
  ['tax', 'out', /^\s*(?:ЕНП|Единый налог|Налог|Страхов)/i, /Казначейство|ФНС|СФР/],
  ['loan', 'out', /кредит|лизинг/i, null],
  ['bank', 'out', /комисси|POS|терминал/i, null],
  ['rent', 'out', /аренд/i, null],
  ['utilities', 'out', /электроэнерг|водоснабж|тепл|ТКО|связи|Интернет|газоснабж/i, null],
  ['marketing', 'out', /реклам|продвижен/i, null],
  ['services', 'out', /бухгалтер|уборк|охран|облачн|подписк|права использования|программ|клининг|юридич|канцтовар|хозтовар/i, null],
  ['refund_out', 'out', /^\s*возврат/i, null],
  ['suppliers', 'out', /./, null],
]

export function categorize(ops: Omit<Op, 'cat'>[]): Op[] {
  const res = ops.map((o) => {
    let cat: CatKey | null = null
    for (const [key, dir, pRe, cRe] of RULES) {
      if (o.dir !== dir) continue
      const pm = pRe ? pRe.test(o.purpose) : false
      const cm = cRe ? cRe.test(o.cp) : false
      if (pRe && cRe ? pm || cm : pRe ? pm : cm) { cat = key; break }
    }
    return { ...o, cat } as Op & { cat: CatKey | null }
  })
  // пустое назначение: самая частая категория этого контрагента
  const freq = new Map<string, Map<CatKey, number>>()
  for (const o of res) {
    if (!o.purpose.trim() || !o.cat) continue
    const k = `${o.cp}|${o.dir}`
    const m = freq.get(k) ?? new Map<CatKey, number>()
    m.set(o.cat, (m.get(o.cat) ?? 0) + 1)
    freq.set(k, m)
  }
  for (const o of res) {
    if (o.purpose.trim() && o.cat) continue
    const m = freq.get(`${o.cp}|${o.dir}`)
    o.cat = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : 'other'
  }
  return res as Op[]
}

/* ——— модель ——— */
const REVENUE_LIKE_EXCLUDED: CatKey[] = ['owner_in', 'loan_in', 'refund_in', 'refund_out', 'transfer_out']
const RECURRING: CatKey[] = ['salary', 'rent', 'loan', 'utilities', 'services', 'marketing', 'bank', 'owner_out']
const TITLES: Partial<Record<CatKey, string>> = {
  rent: 'Аренда', loan: 'Платёж по кредиту', utilities: 'Коммунальные и связь', services: 'Сервисы и подписки',
  marketing: 'Реклама', bank: 'Комиссия банка', owner_out: 'Вы обычно забираете себе',
}
const DOC_RE = /(?:сч[её]ту?|УПД)\s*№?\s*(\d+)\s*от\s*(\d{2})\.(\d{2})\.(\d{4})/i

interface Ev extends PlannedEvent { idx: number; jitter: number; delays?: number[] }

interface Model {
  start: number
  days: string[]
  isBD: boolean[]
  events: Ev[]
  baseline: Baseline[]
  det: number[]
  p10: number[]
  p50: number[]
  p90: number[]
  pNeg: number[]
  pGap: number
  clients: Client[]
}

function buildModel(all: Op[], eodAt: (d: string) => number, asof: string, horizon: number, nSims: number, rng: Rng): Model {
  const hist = all.filter((o) => o.date <= asof)
  const start = eodAt(asof)
  const days = Array.from({ length: horizon }, (_, i) => addDays(asof, i + 1))
  const isBD = days.map(isBusinessDay)
  const H = days.length
  const last = days[H - 1]
  const dayIndex = (iso: string) => daysBetween(days[0], iso)
  const shift = (i: number, forward = true) => {
    let j = i
    while (j >= 0 && j < H && !isBD[j]) j += forward ? 1 : -1
    return Math.min(Math.max(j, 0), H - 1)
  }
  const events: Ev[] = []
  const explained = new Set<Op>()
  const sims = new Float64Array(nSims * H)

  // 1. регулярные платежи
  const sixAgo = addMonths(asof, -6)
  const monthKeys = Array.from({ length: 6 }, (_, i) => ymShift(ym(asof), i - 5))
  const groups = new Map<string, { cat: CatKey; cp: string; sub: string; ops: Op[] }>()
  for (const o of hist) {
    if (o.date <= sixAgo || !RECURRING.includes(o.cat)) continue
    const sub = o.cat !== 'salary' ? '' : /аванс/i.test(o.purpose) ? 'advance' : /ГПХ/.test(o.purpose) ? 'gph' : 'final'
    const k = `${o.cat}|${o.cp}|${sub}`
    const g = groups.get(k) ?? { cat: o.cat, cp: o.cp, sub, ops: [] }
    g.ops.push(o)
    groups.set(k, g)
  }
  for (const g of [...groups.values()].sort((a, b) => `${a.cat}|${a.cp}|${a.sub}`.localeCompare(`${b.cat}|${b.cp}|${b.sub}`))) {
    if (g.sub === 'gph') continue
    const monthly = new Map<string, number>()
    const firstDay = new Map<string, number>()
    for (const o of g.ops) {
      monthly.set(ym(o.date), (monthly.get(ym(o.date)) ?? 0) + o.amount)
      firstDay.set(ym(o.date), Math.min(firstDay.get(ym(o.date)) ?? 99, +o.date.slice(8)))
    }
    const yms = [...monthly.keys()].sort()
    const months = yms.length
    const recent = yms.filter((k) => k >= monthKeys[3]).length
    if (months < 4 || recent < 2 || g.ops.length / months > 2.5) continue
    let amount = median(yms.slice(-3).map((k) => monthly.get(k)!))
    if (g.cat === 'owner_out') {
      amount = median(monthKeys.map((k) => monthly.get(k) ?? 0))
      if (amount <= 0) continue
    }
    const dom = Math.trunc(median(yms.slice(-4).map((k) => firstDay.get(k)!)))
    for (const o of hist) if (o.cat === g.cat && o.cp === g.cp) explained.add(o)
    const jitter = ({ salary: 0.02, utilities: 0.1, owner_out: 0.25, marketing: 0.15 } as Partial<Record<CatKey, number>>)[g.cat] ?? 0
    const title = g.cat === 'salary' ? (g.sub === 'advance' ? 'Зарплата: аванс' : 'Зарплата: расчёт') : TITLES[g.cat]!
    for (let k = 0; k <= Math.floor(horizon / 28) + 1; k++) {
      const key = ym(addMonths(asof, k))
      const ts = `${key}-${String(Math.min(dom, daysInMonth(key))).padStart(2, '0')}`
      if (ts <= asof || ts > last) continue
      if (k === 0 && yms.includes(ym(asof))) continue
      const idx = shift(dayIndex(ts), !['salary', 'owner_out'].includes(g.cat))
      events.push({ id: '', idx, date: days[idx], amount: -amount, cat: g.cat, kind: 'recurring', title, cp: g.cp, source: 'statement', jitter })
    }
  }

  // 2. ЕНП 28-го: сумма по позиции месяца в квартале
  const tax = hist.filter((o) => o.cat === 'tax')
  tax.forEach((o) => explained.add(o))
  const yearAgoKey = ym(addMonths(asof, -12))
  const tm = new Map<string, number>()
  for (const o of tax) if (ym(o.date) >= yearAgoKey) tm.set(ym(o.date), (tm.get(ym(o.date)) ?? 0) + o.amount)
  for (let k = 1; k <= Math.floor(horizon / 28) + 1; k++) {
    const key = ym(addMonths(asof, +asof.slice(8) > 27 ? k : k - 1))
    const ts = `${key}-28`
    if (ts <= asof || ts > last) continue
    const month = +key.slice(5)
    const same = [...tm.entries()].sort().filter(([m]) => +m.slice(5) % 3 === month % 3).map(([, v]) => v)
    if (!same.length) continue
    const idx = shift(dayIndex(ts))
    events.push({
      id: '', idx, date: days[idx], amount: -median(same.slice(-3)), cat: 'tax', kind: 'tax',
      title: 'Единый налоговый платёж' + ([1, 4, 7, 10].includes(month) ? ' (квартальный)' : ''), cp: 'ФНС России', source: 'tax_calendar', jitter: 0.08,
    })
  }

  // 3. счета клиентов: задержка от счёта до оплаты
  const clients: Client[] = []
  const cl = hist.filter((o) => o.cat === 'clients').map((o) => {
    const m = o.purpose.match(DOC_RE)
    const docDate = m ? `${m[4]}-${m[3]}-${m[2]}` : null
    return { o, docNo: m ? +m[1] : null, docDate, delay: docDate ? daysBetween(docDate, o.date) : null }
  })
  const allDelays = cl.filter((c) => c.delay != null).map((c) => c.delay!)
  let maxDocNo = Math.max(100, ...cl.filter((c) => c.docNo != null).map((c) => c.docNo!))
  if (!cl.some((c) => c.docNo != null)) maxDocNo = 100
  const yearAgo = addMonths(asof, -12)
  const byCp = new Map<string, typeof cl>()
  for (const c of cl) if (c.o.date > yearAgo) byCp.set(c.o.cp, [...(byCp.get(c.o.cp) ?? []), c])
  for (const cp of [...byCp.keys()].sort()) {
    const g = byCp.get(cp)!
    const gd = g.filter((c) => c.docDate)
    const docs = new Map<number, { docDate: string; amount: number }>()
    for (const c of gd) {
      const d = docs.get(c.docNo!) ?? { docDate: c.docDate!, amount: 0 }
      d.amount += c.o.amount
      docs.set(c.docNo!, d)
    }
    const lastPay = g.reduce((m, c) => (c.o.date > m ? c.o.date : m), '')
    const regular = docs.size >= 4 && lastPay > addDays(asof, -90)
    const delays = gd.length >= 3 ? gd.map((c) => c.delay!) : allDelays
    const sortedDelays = [...delays].sort((a, b) => a - b)
    const info: Client = {
      id: `cl${clients.length}`, name: cp, payments: g.length, docs: docs.size, total: sum(g.map((c) => c.o.amount)),
      medianDelay: delays.length ? quantile(sortedDelays, 0.5) : null, p90Delay: delays.length ? quantile(sortedDelays, 0.9) : null,
      delays: gd.slice(-12).map((c) => c.delay!), lastPayment: lastPay, regular,
    }
    clients.push(info)
    if (!regular) continue
    g.forEach((c) => explained.add(c.o))
    const dd = [...docs.values()].sort((a, b) => a.docDate.localeCompare(b.docDate))
    const gaps = dd.slice(1).map((d, i) => daysBetween(dd[i].docDate, d.docDate))
    const gap = Math.min(Math.max(gaps.length ? median(gaps) : 30, 7), 62)
    const typical = median(dd.slice(-6).map((d) => d.amount))
    const medDelay = median(delays)
    let doc = dayNum(dd[dd.length - 1].docDate)
    const asofN = dayNum(asof)
    for (;;) {
      doc += gap
      let expected = doc + medDelay
      if (expected > dayNum(last)) break
      let overdue = 0
      if (expected <= asofN && doc <= asofN) {
        overdue = Math.floor(asofN - expected)
        expected = asofN + Math.min(3 + Math.floor(overdue / 7), 10)
      }
      const issued = doc <= asofN
      const idx = shift(Math.floor(expected - dayNum(days[0])))
      events.push({
        id: '', idx, date: days[idx], amount: typical, cat: 'clients', kind: issued ? 'invoice' : 'pattern',
        title: issued ? 'Оплата счёта' : 'Ожидаемая оплата', cp, source: issued ? '1c' : 'statement', jitter: 0,
        clientId: info.id, docNo: issued ? ++maxDocNo : undefined, docDate: fromNum(doc), overdueDays: overdue, delays,
      })
    }
  }

  // 4. переменные потоки: среднее по дню недели за 8 недель × сезонность год назад
  const baseline: Baseline[] = []
  const from56 = addDays(asof, -56)
  const from112 = addDays(asof, -112)
  const bd56 = businessDays(from56, asof)
  const bd112 = businessDays(from112, asof)
  const varCats = [...new Set(hist.filter((o) => o.date > from56 && !explained.has(o) && !REVENUE_LIKE_EXCLUDED.includes(o.cat) && o.cat !== 'tax').map((o) => o.cat))].sort()
  for (const cat of varCats) {
    const ops = hist.filter((o) => o.cat === cat && !explained.has(o))
    const sign: 1 | -1 = ops[0].dir === 'in' ? 1 : -1
    const byDate = new Map<string, number>()
    for (const o of ops) if (o.date > from112) byDate.set(o.date, (byDate.get(o.date) ?? 0) + o.amount)
    const daily = bd56.map((d) => byDate.get(d) ?? 0)
    if (!sum(daily)) continue
    const wdSum = new Map<number, number>()
    const wdCnt = new Map<number, number>()
    bd56.forEach((d, i) => {
      const wd = parseDate(d).getUTCDay()
      wdSum.set(wd, (wdSum.get(wd) ?? 0) + daily[i])
      wdCnt.set(wd, (wdCnt.get(wd) ?? 0) + 1)
    })
    const byWd = (wd: number) => (wdCnt.get(wd) ? wdSum.get(wd)! / wdCnt.get(wd)! : 0)
    const ratios = bd112.map((d) => {
      const e = byWd(parseDate(d).getUTCDay())
      return e > 0 ? Math.min(Math.max((byDate.get(d) ?? 0) / e, 0), 4) : 1
    })
    const ly = hist.filter((o) => o.cat === cat)
    const lyFrom = addMonths(asof, -14)
    const lyTo = addMonths(asof, -12)
    const baseLy = sum(ly.filter((o) => o.date > lyFrom && o.date <= lyTo).map((o) => o.amount)) / 2
    const season = new Map<string, number>()
    for (const d of days) {
      const key = ym(d)
      if (season.has(key)) continue
      const mLy = sum(ly.filter((o) => ym(o.date) === ymShift(key, -12)).map((o) => o.amount))
      season.set(key, baseLy > 0 && mLy > 0 ? Math.min(Math.max(mLy / baseLy, 0.6), 1.6) : 1)
    }
    const exp = days.map((d, i) => (isBD[i] ? byWd(parseDate(d).getUTCDay()) * season.get(ym(d))! : 0))
    for (let s = 0; s < nSims; s++) {
      const level = rng.normal(1, 0.08)
      for (let i = 0; i < H; i++) if (exp[i]) sims[s * H + i] += sign * exp[i] * (ratios.length ? rng.pick(ratios) : 1) * level
    }
    baseline.push({ cat, sign, values: exp.map((v) => Math.round(v * 100) / 100) })
  }

  // 5. события в симуляции
  for (const e of events) {
    if (e.kind === 'invoice' || e.kind === 'pattern') {
      const dl = e.delays?.length ? e.delays : [0]
      const med = median(dl)
      for (let s = 0; s < nSims; s++) {
        let sh = Math.trunc(rng.pick(dl) - med)
        if (rng.next() < 0.1) sh += rng.int(7, 31)
        const t = Math.min(Math.max(e.idx + sh, Math.max(0, e.idx - 10)), H)
        if (t < H) sims[s * H + t] += e.amount
      }
    } else {
      for (let s = 0; s < nSims; s++) {
        const amt = e.jitter ? e.amount * (1 + rng.normal(0, e.jitter)) : e.amount
        const t = e.cat === 'owner_out' ? Math.min(Math.max(e.idx + rng.int(-2, 3), 0), H - 1) : e.idx
        sims[s * H + t] += amt
      }
    }
  }

  const det = new Array<number>(H).fill(0)
  for (const b of baseline) b.values.forEach((v, i) => (det[i] += b.sign * v))
  for (const e of events) det[e.idx] += e.amount
  let acc = start
  const detBal = det.map((v) => (acc += v))

  const p10: number[] = []
  const p50: number[] = []
  const p90: number[] = []
  const pNeg: number[] = []
  const minPath = new Float64Array(nSims).fill(Infinity)
  const bal = new Float64Array(nSims).fill(start)
  const col = new Float64Array(nSims)
  for (let i = 0; i < H; i++) {
    let neg = 0
    for (let s = 0; s < nSims; s++) {
      bal[s] += sims[s * H + i]
      col[s] = bal[s]
      if (bal[s] < 0) neg++
      if (bal[s] < minPath[s]) minPath[s] = bal[s]
    }
    col.sort()
    p10.push(quantile(col, 0.1))
    p50.push(quantile(col, 0.5))
    p90.push(quantile(col, 0.9))
    pNeg.push(neg / nSims)
  }
  const pGap = minPath.filter((v) => v < 0).length / nSims
  return { start, days, isBD, events, baseline, det: detBal, p10, p50, p90, pNeg, pGap, clients }
}

/* ——— бэктест: прогноз «как будто тогда» и сравнение с фактом ——— */
function backtest(ops: Op[], eodAt: (d: string) => number, eodDates: string[], asof: string, rng: Rng): CompanyData['backtest'] {
  const inject = new Map<string, number>()
  for (const o of ops) if (o.cat === 'owner_in' || o.cat === 'loan_in') inject.set(o.date, (inject.get(o.date) ?? 0) + o.amount)
  const first = eodDates[0]
  const rows: { c: string; h: number; actual: number; det: number; lo: number; hi: number; pneg: number; mid: number; flat: number; month: number }[] = []
  let planFact: CompanyData['backtest']['planFact'] = null
  const cutoffs = Array.from({ length: 19 }, (_, k) => addDays(asof, -(30 + 14 * k))).sort()
  for (const raw of cutoffs) {
    const c = [...eodDates].reverse().find((d) => d <= raw)
    if (!c || daysBetween(first, c) < 200) continue
    const m = buildModel(ops, eodAt, c, 30, 150, rng)
    const idx = m.days.map((_, i) => i).filter((i) => m.isBD[i])
    const prevFirst = eodDates.find((d) => d > addDays(c, -31) && d <= c)
    // «что было бы без ваших пополнений»: из факта вычитаем внесённые свои деньги и кредиты
    let inj = 0
    let prevDay = c
    const adj: number[] = []
    for (const i of idx) {
      const d = m.days[i]
      for (let x = addDays(prevDay, 1); x <= d; x = addDays(x, 1)) inj += inject.get(x) ?? 0
      prevDay = d
      const have = eodAt(d)
      adj.push(have - inj)
      const refDate = addDays(d, -30)
      const month = m.start + (refDate >= first && prevFirst ? eodAt(refDate) - eodAt(prevFirst) : 0)
      rows.push({ c, h: daysBetween(c, d), actual: have - inj, det: m.det[i], lo: m.p10[i], hi: m.p90[i], pneg: m.pNeg[i], mid: m.p50[i], flat: m.start, month })
    }
    if (!planFact || c > planFact.cutoff) {
      planFact = {
        cutoff: c,
        days: idx.map((i) => m.days[i]),
        actual: idx.map((i) => Math.round(eodAt(m.days[i]))),
        adj: adj.map(Math.round),
        det: idx.map((i) => Math.round(m.det[i])),
        lo: idx.map((i) => Math.round(m.p10[i])),
        hi: idx.map((i) => Math.round(m.p90[i])),
      }
    }
  }
  const monthlyOut = new Map<string, number>()
  for (const o of ops) if (o.dir === 'out') monthlyOut.set(ym(o.date), (monthlyOut.get(ym(o.date)) ?? 0) + o.amount)
  const mae = (key: 'det' | 'flat' | 'month', a: number, b: number) => {
    const r = rows.filter((x) => x.h >= a && x.h <= b)
    return r.length ? sum(r.map((x) => Math.abs(x[key] - x.actual))) / r.length : 0
  }
  const band = (k: number) => rows.filter((r) => r.actual >= r.mid - (r.mid - r.lo) * k && r.actual <= r.mid + (r.hi - r.mid) * k).length / (rows.length || 1)
  const z = rows.map((r) => Math.abs(r.actual - r.mid) / Math.max((r.hi - r.lo) / 2, 1)).sort((a, b) => a - b)
  const k = rows.length ? Math.min(Math.max(quantile(z, 0.8), 1), 4) : 1.5
  let gapWindows = 0
  let gapCaught = 0
  let falseAlarms = 0
  const leads: number[] = []
  for (const c of [...new Set(rows.map((r) => r.c))]) {
    const g = rows.filter((r) => r.c === c)
    const neg = g.filter((r) => r.actual < 0)
    if (neg.length) {
      gapWindows++
      const firstNeg = Math.min(...neg.map((r) => r.h))
      if (g.some((r) => r.pneg >= 0.3 && r.h <= firstNeg)) { gapCaught++; leads.push(firstNeg) }
    }
    if (Math.max(...g.map((r) => r.pneg)) >= 0.5 && Math.min(...g.map((r) => r.actual)) >= 0) falseAlarms++
  }
  const ranges = { d7: [5, 9], d14: [12, 16], d30: [27, 31] } as const
  return {
    cutoffs: new Set(rows.map((r) => r.c)).size,
    monthlyOutflow: median([...monthlyOut.values()]),
    mae: Object.fromEntries(Object.entries(ranges).map(([key, [a, b]]) => [key, { model: mae('det', a, b), flat: mae('flat', a, b), lastMonth: mae('month', a, b) }])) as CompanyData['backtest']['mae'],
    coverageRaw: band(1),
    coverage: band(k),
    bandScale: k,
    gapWindows,
    gapCaught,
    avgLeadDays: leads.length ? sum(leads) / leads.length : null,
    falseAlarms,
    planFact,
  }
}

export interface BuildInput {
  id: string
  name: string
  inn: string
  ops: Omit<Op, 'cat'>[]
  opening: number | null
  closing: number | null
}

/** Выписка → те же данные, что Python-скрипт кладёт в web/src/data/*.json. */
export function buildCompanyData(input: BuildInput, horizon = 60): CompanyData {
  const rng = new Rng(input.ops.length * 7919 + 17)
  const key = (o: Omit<Op, 'cat'>) => `${o.date}|${o.amount}|${o.dir}|${o.inn}|${o.purpose}`
  const seen = new Set<string>()
  let duplicates = 0
  const unique = input.ops.filter((o) => {
    const k = key(o)
    if (seen.has(k)) { duplicates++; return false }
    seen.add(k)
    return true
  })
  const ops = categorize(unique)
  if (!ops.length) throw new Error('В выписке нет операций по счёту.')

  // остаток на конец каждого дня: от начального остатка + движение
  const net = new Map<string, number>()
  for (const o of ops) net.set(o.date, (net.get(o.date) ?? 0) + (o.dir === 'in' ? o.amount : -o.amount))
  const eodDates = [...net.keys()].sort()
  const total = sum([...net.values()])
  // привязываемся к конечному остатку: если в выписке есть пропуски, точнее всего свежие дни
  const opening = input.closing != null ? input.closing - total : input.opening ?? 0
  const eod = new Map<string, number>()
  let b = opening
  for (const d of eodDates) eod.set(d, (b += net.get(d)!))
  const eodAt = (d: string) => {
    let lo = 0
    let hi = eodDates.length - 1
    if (d < eodDates[0]) return eod.get(eodDates[0])!
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (eodDates[mid] <= d) lo = mid
      else hi = mid - 1
    }
    return eod.get(eodDates[lo])!
  }
  const asof = eodDates[eodDates.length - 1]
  const m = buildModel(ops, eodAt, asof, horizon, 600, rng)
  const bt = backtest(ops, eodAt, eodDates, asof, rng)
  const k = bt.bandScale

  const gaps: CompanyData['quality']['gaps'] = []
  if (input.closing != null && input.opening != null && Math.abs(input.opening - opening) > 1) {
    // начальный + движение ≠ конечный: в выписке не хватает операций
    gaps.push({ start: eodDates[0], end: asof, days: daysBetween(eodDates[0], asof), jump: Math.round(input.opening - opening) })
  }

  const inOut = (from: string, to: string) => {
    const r: Partial<Record<CatKey, number>> = {}
    for (const o of ops) if (o.date > from && o.date <= to) r[o.cat] = (r[o.cat] ?? 0) + o.amount
    for (const c of Object.keys(r) as CatKey[]) r[c] = Math.round(r[c]!)
    return r
  }
  const monthlyMap = new Map<string, number>()
  const yearAgo = addMonths(asof, -12)
  for (const o of ops) if (o.date > yearAgo) monthlyMap.set(`${ym(o.date)}|${o.cat}`, (monthlyMap.get(`${ym(o.date)}|${o.cat}`) ?? 0) + o.amount)
  const dailyIn = new Map<string, number>()
  const dailyOut = new Map<string, number>()
  for (const o of ops) (o.dir === 'in' ? dailyIn : dailyOut).set(o.date, ((o.dir === 'in' ? dailyIn : dailyOut).get(o.date) ?? 0) + o.amount)
  const from90 = addDays(asof, -90)
  const outLast90 = sum(ops.filter((o) => o.dir === 'out' && o.date > from90 && o.cat !== 'owner_out' && o.cat !== 'transfer_out').map((o) => o.amount))
  const topupMap = new Map<string, number>()
  for (const o of ops) if (o.cat === 'owner_in') topupMap.set(o.date, (topupMap.get(o.date) ?? 0) + o.amount)
  const inn = /^\d+$/.test(input.inn) ? input.inn : ''

  return {
    company: {
      id: input.id, name: input.name || 'Мой бизнес', inn,
      legalForm: inn.length === 12 ? 'ИП' : 'ООО', industry: 'Другое', firstDate: eodDates[0],
    },
    asOf: asof,
    balanceNow: Math.round(m.start),
    balanceExact: Math.round(m.start * 100) / 100,
    avgDailyOut: Math.round(outLast90 / 90),
    history: eodDates.filter((d) => d > addDays(asof, -120)).map((d) => ({
      d, b: Math.round(eod.get(d)!), i: Math.round(dailyIn.get(d) ?? 0), o: Math.round(dailyOut.get(d) ?? 0),
    })),
    forecast: {
      days: m.days,
      businessDay: m.isBD,
      baseline: m.baseline,
      lo: m.p10.map((v, i) => Math.round(m.p50[i] - (m.p50[i] - v) * k - m.det[i])),
      mid: m.p50.map((v, i) => Math.round(v - m.det[i])),
      hi: m.p90.map((v, i) => Math.round(m.p50[i] + (v - m.p50[i]) * k - m.det[i])),
      mcPneg: m.pNeg.map((v) => Math.round(v * 1000) / 1000),
      mcPgap: Math.round(m.pGap * 1000) / 1000,
    },
    events: [...m.events].sort((a, b2) => a.date.localeCompare(b2.date)).map((e, i) => {
      const { idx, jitter, delays, ...rest } = e
      void idx; void jitter; void delays
      return { ...rest, id: `e${i}`, amount: Math.round(rest.amount) }
    }),
    clients: m.clients.filter((c) => c.payments >= 2),
    categories: {
      last90: inOut(from90, asof),
      prev90: inOut(addDays(asof, -180), from90),
      monthly: [...monthlyMap.entries()].sort().map(([kk, v]) => {
        const [mm, cat] = kk.split('|')
        return { m: mm, cat: cat as CatKey, v: Math.round(v) }
      }),
    },
    topups: [...topupMap.entries()].sort().map(([d, amount]) => ({ d, amount: Math.round(amount) })),
    quality: {
      rows: input.ops.length, duplicates,
      emptyPurpose: input.ops.filter((o) => !o.purpose.trim()).length,
      emptyInn: input.ops.filter((o) => !o.inn).length,
      gaps, refunds: ops.filter((o) => o.cat === 'refund_in' || o.cat === 'refund_out').length,
    },
    backtest: bt,
  }
}
