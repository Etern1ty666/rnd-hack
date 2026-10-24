/**
 * Разбор файла обмена «1С — Клиент банка» (1CClientBankExchange).
 * Так выгружают выписку Сбер, Центр-инвест, Т-Банк и почти все банки.
 * Работает в браузере: файл никуда не отправляется.
 */
export interface StatementOp {
  date: string
  amount: number
  dir: 'in' | 'out'
  cp: string
  inn: string
  purpose: string
  docNo: string
}

export interface Statement {
  sender: string
  accounts: string[]
  from: string
  to: string
  opening: number | null
  closing: number | null
  ownerName: string
  ownerInn: string
  ops: StatementOp[]
  /** Документы, где не нашли наш счёт ни у плательщика, ни у получателя. */
  skipped: number
}

/** dd.mm.yyyy → yyyy-mm-dd */
function isoDate(s: string | undefined): string {
  const m = s?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const num = (s: string | undefined) => {
  const v = parseFloat((s ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

/** Байты файла → текст: 1С пишет в Windows-1251, реже в DOS (866) или UTF-8. */
export function decode1c(bytes: Uint8Array): string {
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (!utf.includes('\uFFFD')) return utf.replace(/^\uFEFF/, '')
  const head = new TextDecoder('windows-1251').decode(bytes.slice(0, 400))
  return new TextDecoder(/Кодировка=DOS/i.test(head) ? 'ibm866' : 'windows-1251').decode(bytes)
}

/** Наименование без «ИНН 1234567890» в начале, как его пишут в поле «Плательщик». */
function cleanName(full: string | undefined, short: string | undefined): string {
  return (short || full || '').replace(/^ИНН\s*\d+\s*/, '').trim()
}

export function parse1c(text: string): Statement {
  const lines = text.split(/\r?\n/)
  if (!lines[0]?.trim().startsWith('1CClientBankExchange')) {
    throw new Error('Это не выписка в формате 1С: файл должен начинаться со строки «1CClientBankExchange».')
  }
  const header: Record<string, string> = {}
  const headerAccounts: string[] = []
  const accSections: Record<string, string>[] = []
  const docs: Record<string, string>[] = []
  let cur: Record<string, string> | null = null
  let where: 'head' | 'acc' | 'doc' = 'head'

  for (const raw of lines.slice(1)) {
    const line = raw.trim()
    if (!line) continue
    if (line === 'СекцияРасчСчет') { cur = {}; where = 'acc'; continue }
    if (line === 'КонецРасчСчет') { if (cur) accSections.push(cur); cur = null; where = 'head'; continue }
    if (line.startsWith('СекцияДокумент')) { cur = { Вид: line.split('=')[1] ?? '' }; where = 'doc'; continue }
    if (line === 'КонецДокумента') { if (cur) docs.push(cur); cur = null; where = 'head'; continue }
    if (line === 'КонецФайла') break
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq)
    const value = line.slice(eq + 1)
    if (where === 'head') {
      if (key === 'РасчСчет') headerAccounts.push(value)
      else header[key] = value
    } else if (cur) {
      cur[key] = value
    }
  }

  // наш счёт — из заголовка; если его нет, самый частый счёт в документах
  let accounts = [...new Set([...headerAccounts, ...accSections.map((a) => a.РасчСчет).filter(Boolean)])]
  if (!accounts.length) {
    const freq = new Map<string, number>()
    for (const d of docs) for (const a of [d.ПлательщикСчет, d.ПолучательСчет]) if (a) freq.set(a, (freq.get(a) ?? 0) + 1)
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) accounts = [top[0]]
  }
  const mine = new Set(accounts)

  const ops: StatementOp[] = []
  const owners = new Map<string, { name: string; n: number }>()
  let skipped = 0
  for (const d of docs) {
    const amount = num(d.Сумма)
    if (amount == null || amount <= 0) { skipped++; continue }
    const out = mine.has(d.ПлательщикСчет) || mine.has(d.ПлательщикРасчСчет)
    const inc = mine.has(d.ПолучательСчет) || mine.has(d.ПолучательРасчСчет)
    if (out === inc) { skipped++; continue } // чужой документ или перевод между своими счетами одной выписки
    const date = isoDate(out ? d.ДатаСписано : d.ДатаПоступило) || isoDate(d.Дата)
    if (!date) { skipped++; continue }
    const cp = out ? cleanName(d.Получатель, d.Получатель1) : cleanName(d.Плательщик, d.Плательщик1)
    const inn = (out ? d.ПолучательИНН : d.ПлательщикИНН) ?? ''
    const own = out ? { name: cleanName(d.Плательщик, d.Плательщик1), inn: d.ПлательщикИНН ?? '' } : { name: cleanName(d.Получатель, d.Получатель1), inn: d.ПолучательИНН ?? '' }
    const k = own.inn || own.name
    owners.set(k, { name: own.name, n: (owners.get(k)?.n ?? 0) + 1 })
    ops.push({ date, amount, dir: out ? 'out' : 'in', cp, inn, purpose: (d.НазначениеПлатежа ?? '').trim(), docNo: d.Номер ?? '' })
  }
  ops.sort((a, b) => a.date.localeCompare(b.date))
  const owner = [...owners.entries()].sort((a, b) => b[1].n - a[1].n)[0]

  const sortedAcc = [...accSections].sort((a, b) => isoDate(a.ДатаНачала).localeCompare(isoDate(b.ДатаНачала)))
  return {
    sender: header.Отправитель ?? '',
    accounts,
    from: isoDate(header.ДатаНачала) || ops[0]?.date || '',
    to: isoDate(header.ДатаКонца) || ops.at(-1)?.date || '',
    opening: num(sortedAcc[0]?.НачальныйОстаток),
    closing: num(sortedAcc.at(-1)?.КонечныйОстаток),
    ownerName: owner?.[1].name ?? '',
    ownerInn: owner?.[0] ?? '',
    ops,
    skipped,
  }
}
