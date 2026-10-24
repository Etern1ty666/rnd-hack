const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** Дата из 'YYYY-MM-DD' в UTC, чтобы часовой пояс не сдвигал день. */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000)
}

export const fmtDay = (s: string) => {
  const d = parseDate(s)
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
}
export const fmtDayShort = (s: string) => {
  const d = parseDate(s)
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}
export const fmtWeekday = (s: string) => WEEKDAYS[parseDate(s).getUTCDay()]
export const fmtWeekdayFull = (s: string) => WEEKDAYS_FULL[parseDate(s).getUTCDay()]
export const monthGen = (m: number) => MONTHS_GEN[m]

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

/** 264 196 ₽ */
export function rub(v: number, signed = false): string {
  const s = nf.format(Math.round(Math.abs(v)))
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : ''
  return `${sign}${s}\u00a0₽`
}

/** 46 223,86 ₽ — с копейками, для остатков на счетах */
export function rubK(v: number): string {
  const s = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${v < 0 ? '−' : ''}${s}\u00a0₽`
}

/** 264 тыс. / 1,2 млн — для подписей и осей */
export function compact(v: number, signed = false): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : ''
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })}\u00a0млн`
  if (a >= 1e3) return `${sign}${Math.round(a / 1e3).toLocaleString('ru-RU')}\u00a0тыс.`
  return `${sign}${Math.round(a)}`
}

/** Округление «по-человечески»: 183 412 → 185 000 */
export function roundNice(v: number): number {
  const a = Math.abs(v)
  const step = a >= 1e6 ? 50000 : a >= 1e5 ? 5000 : a >= 1e4 ? 1000 : 100
  return Math.sign(v) * Math.ceil(a / step) * step
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export const days = (n: number) => `${n}\u00a0${plural(n, 'день', 'дня', 'дней')}`

export const pct = (p: number) => `${Math.round(p * 100)}%`

function bareName(cp: string): string {
  const q = cp.match(/«(.+?)»/)
  return (q ? q[1] : cp.replace(/^(ИП|ООО|АО|ПАО)\s+/, '')).replace(/^Клиент-/, '')
}

/** Короткие имена, которые встречаются у компании больше одного раза, — с номером. */
let ambiguous = new Set<string>()
export function registerNames(cps: string[]) {
  const seen = new Map<string, Set<string>>()
  for (const cp of cps) {
    const s = bareName(cp).replace(/-\d+$/, '')
    seen.set(s, (seen.get(s) ?? new Set()).add(cp))
  }
  ambiguous = new Set([...seen.entries()].filter(([, v]) => v.size > 1).map(([k]) => k))
}

/** «Агрохолдинг» вместо «ИП Клиент-Агрохолдинг-747» — короче и по-человечески. */
export function shortName(cp: string): string {
  const b = bareName(cp)
  const s = b.replace(/-\d+$/, '')
  return ambiguous.has(s) ? b : s
}
