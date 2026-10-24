import { addDays, toISO, parseDate } from './format'

/**
 * Событие из фразы: «клиент обещал 300 тыс. 20-го», «в пятницу куплю кофемашину за 150к».
 * Простые правила без ИИ: сумма, дата относительно «сегодня», направление и о чём речь.
 * В продукте сюда встаёт языковая модель, интерфейс тот же.
 */
export interface ParsedEvent {
  amount: number | null
  date: string | null
  dir: 'in' | 'out'
  title: string
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр']
const MONTH_RE = '(январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*'
const WEEKDAYS: Record<string, number> = { понедельник: 1, вторник: 2, сред: 3, четверг: 4, пятниц: 5, суббот: 6, воскресень: 0 }

// \b в JS не понимает кириллицу — границы слова задаём сами
const E = '(?![а-яa-z0-9])'
const IN_WORDS = /заплат[ия]т|обещал|придут|прид[её]т|поступ|верн[её]т|вернут|переведут|получу|получим|оплат[ия]т|перечисл[ия]т|аванс от|предоплат|выручк/i
const OUT_WORDS = new RegExp(`куплю|купить|заплачу|оплачу|оплатить|потрачу|отдам|штраф|ремонт|закуп|аренд|налог|кредит|верну${E}|возвращ|покупк|отложу на`, 'i')

const monthIndex = (word: string) => {
  const w = word.toLowerCase()
  if (/^ма[йяе]/.test(w)) return 4
  return MONTHS.findIndex((m, i) => i !== 4 && w.startsWith(m))
}

/** Ближайшая дата с этим числом (и месяцем, если указан) после «сегодня». */
function nextDay(today: string, day: number, month?: number): string {
  const t = parseDate(today)
  let y = t.getUTCFullYear()
  let m = month ?? t.getUTCMonth()
  for (let k = 0; k < 14; k++) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const d = toISO(new Date(Date.UTC(y, m, Math.min(day, last))))
    if (d > today) return d
    if (month != null) y += 1
    else m += 1
  }
  return today
}

export function parsePhrase(input: string, today: string): ParsedEvent {
  let s = ` ${input.toLowerCase().replace(/ё/g, 'е')} `
  let date: string | null = null
  const cut = (re: RegExp) => { s = s.replace(re, ' ') }

  // даты: сначала конкретные, затем относительные; найденное вырезаем, чтобы не спутать с суммой
  let m: RegExpMatchArray | null
  if ((m = s.match(new RegExp(`\\s(\\d{1,2})\\s*(?:-?го\\s+)?${MONTH_RE}`)))) {
    date = nextDay(today, +m[1], monthIndex(m[2])); cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } else if ((m = s.match(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s/))) {
    date = nextDay(today, +m[1], +m[2] - 1); cut(/\s\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\s/)
  } else if ((m = s.match(new RegExp(`\\s(\\d{1,2})\\s*-?\\s*(?:го|числа)${E}`)))) {
    date = nextDay(today, +m[1]); cut(new RegExp(`\\s\\d{1,2}\\s*-?\\s*(?:го|числа)${E}`))
  } else if (/послезавтра/.test(s)) {
    date = addDays(today, 2); cut(/послезавтра/)
  } else if (/завтра/.test(s)) {
    date = addDays(today, 1); cut(/завтра/)
  } else if ((m = s.match(/через\s+(\d+|неделю|две недели|месяц)\s*(дн[яейь]*|недел[июь]*)?/))) {
    const n = m[1] === 'неделю' ? 7 : m[1] === 'две недели' ? 14 : m[1] === 'месяц' ? 30 : +m[1] * (m[2]?.startsWith('недел') ? 7 : 1)
    date = addDays(today, n); cut(/через\s+\S+(\s+(дн[яейь]*|недел[июь]*))?/)
  } else if ((m = s.match(/в\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/))) {
    const want = Object.entries(WEEKDAYS).find(([k]) => m![1].startsWith(k))![1]
    let d = addDays(today, 1)
    while (parseDate(d).getUTCDay() !== want) d = addDays(d, 1)
    date = d; cut(/в\s+(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)/)
  } else if (/в конце месяца/.test(s)) {
    const t = parseDate(today)
    date = toISO(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)))
    if (date <= today) date = toISO(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 2, 0)))
    cut(/в конце месяца/)
  } else if ((m = s.match(new RegExp(`в\\s+${MONTH_RE}`)))) {
    date = nextDay(today, 1, monthIndex(m[1])); cut(new RegExp(`в\\s+${MONTH_RE}`))
  }

  // сумма: число с «тыс», «к», «млн» или просто большое число
  let amount: number | null = null
  const am = [...s.matchAll(new RegExp(`(\\d[\\d\\s]*(?:[.,]\\d+)?)\\s*(млн|миллион[а-я]*|тыс[а-я.]*|т\\.|к${E}|k${E})?`, 'g'))]
    .map((x) => {
      const n = parseFloat(x[1].replace(/\s/g, '').replace(',', '.'))
      const mult = !x[2] ? 1 : /^м/.test(x[2]) ? 1e6 : 1e3
      return { v: n * mult, raw: x[0] }
    })
    .filter((x) => x.v >= 100)
    .sort((a, b) => b.v - a.v)[0]
  if (am) { amount = Math.round(am.v); s = s.replace(am.raw, ' ') }

  const dir: 'in' | 'out' = IN_WORDS.test(input) && !/куплю|заплачу|оплачу|потрачу/i.test(input) ? 'in' : OUT_WORDS.test(input) ? 'out' : 'in'

  // о чём речь: что осталось после вырезания даты и суммы, без служебных слов
  const title = s
    .replace(/[₽.,!?]|руб[а-я]*|р\./g, ' ')
    .replace(new RegExp(`(?<![а-я])(за|на|до|примерно|около|обещал[аи]?|заплатит|заплатят|куплю|заплачу|оплачу|придут|придет|мне|нам|вернут)${E}`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { amount, date, dir, title: title ? title[0].toUpperCase() + title.slice(1) : '' }
}
