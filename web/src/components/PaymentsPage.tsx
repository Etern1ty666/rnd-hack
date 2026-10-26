import { HORIZON, type Evaluation } from '../lib/evaluate'
import type { PlannedEvent } from '../lib/types'
import { CATS, REVENUE_CATS } from '../lib/categories'
import { compact, daysBetween, fmtDayShort, parseDate, plural, shortName } from '../lib/format'
import { Row } from './CardStack'
import { Icon } from './Icon'

interface Props {
  ev: Evaluation
  /** Система налогов — по ней посчитан налоговый календарь. */
  regime: string
  onAdd: () => void
  onQr: () => void
}

type Ev = PlannedEvent & { shifted?: number }

/** Повторы одного платежа (тот же получатель и статья) — одной строкой: как часто и когда следующий. */
interface Series {
  key: string
  first: Ev
  dates: string[]
}

function series(list: Ev[], keyOf: (e: Ev) => string): Series[] {
  const map = new Map<string, Series>()
  for (const e of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = keyOf(e)
    const s = map.get(k)
    if (s) s.dates.push(e.date)
    else map.set(k, { key: k, first: e, dates: [e.date] })
  }
  // крупные сверху: аренда и зарплата важнее подписки за 4 тыс.
  return [...map.values()].sort((a, b) => Math.abs(b.first.amount) - Math.abs(a.first.amount))
}

/**
 * «каждый месяц, около 19-го» — по датам повторов в горизонте прогноза.
 * Один повтор: регулярные платежи — помесячные по построению, а у клиента ритм свой.
 */
function every(dates: string[], single = 'month'): string {
  const day = parseDate(dates[0]).getUTCDate()
  if (dates.length < 2) return single === 'month' ? `каждый месяц, около ${day}-го` : single
  const gap = daysBetween(dates[0], dates[1])
  if (gap <= 9) return 'каждую неделю'
  if (gap <= 18) return 'раз в две недели'
  return `каждый месяц, около ${day}-го`
}

const sum = (list: { amount: number }[]) => list.reduce((s, e) => s + Math.abs(e.amount), 0)

function Group({ title, total, sign, note, children }: {
  title: string
  total?: number
  sign: 1 | -1
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="card-block pay-group">
      <div className="pay-group-head">
        <h2>{title}</h2>
        {total != null && total > 0 && <b className={`num ${sign > 0 ? 'chg-in' : ''}`}>{sign > 0 ? '+' : '−'}{compact(total)}&nbsp;₽</b>}
      </div>
      <p className="pay-group-note">{note}</p>
      {children}
    </section>
  )
}

const end = (amount: number, when: string) => (
  <span className="pay-end">
    <b className={`num ${amount > 0 ? 'chg-in' : ''}`}>{compact(amount, true)}</b>
    <small>{when}</small>
  </span>
)

/**
 * Платежи — отдельной страницей из меню: что ещё не попало в выписку, но точно будет.
 * Каждая группа подписана источником: регулярные найдены в выписке, счета — из 1С, налоги — по календарю.
 */
export function PaymentsPage({ ev, regime, onAdd, onQr }: Props) {
  const { sim, data } = ev
  const last = sim.days[Math.min(HORIZON, sim.days.length) - 1]
  const soon = (e: Ev) => e.date <= last
  const evs = sim.events as Ev[]
  const clients = new Map(data.clients.map((c) => [c.id, c]))

  const taxes = evs.filter((e) => e.kind === 'tax' && soon(e))
  const invoices = evs.filter((e) => e.kind === 'invoice' && soon(e))
  const regularOut = series(evs.filter((e) => e.kind === 'recurring' && e.amount < 0), (e) => `${e.cat}|${e.cp}|${e.title}`)
  const regularIn = series(evs.filter((e) => e.kind === 'pattern' && e.amount > 0), (e) => e.cp)
  const manual = evs.filter((e) => e.source === 'manual' && soon(e))

  // выручка с карт, QR и кассы и закупки идут каждый день — это тоже регулярное: средняя за день по горизонту
  const H = Math.min(HORIZON, sim.days.length)
  const daily = (sign: 1 | -1) => data.forecast.baseline
    .filter((b) => b.sign === sign && (sign < 0 || REVENUE_CATS.has(b.cat)))
    .map((b) => ({ cat: b.cat, daily: b.values.slice(0, H).reduce((s, v) => s + v, 0) / H }))
    .filter((r) => r.daily >= 300)
    .sort((a, b) => b.daily - a.daily)
  const revenue = daily(1)
  const spend = daily(-1)

  const outSoon = regularOut.reduce((s, x) => s + sum(evs.filter((e) => e.kind === 'recurring' && `${e.cat}|${e.cp}|${e.title}` === x.key && soon(e))), 0)
    + spend.reduce((s, r) => s + r.daily * H, 0)
  const inSoon = regularIn.reduce((s, x) => s + sum(evs.filter((e) => e.kind === 'pattern' && e.cp === x.key && soon(e))), 0)
    + revenue.reduce((s, r) => s + r.daily * H, 0)

  return (
    <>
      <h1 className="page-title">Платежи</h1>
      <p className="page-sub">Что спишется и придёт в ближайшие {H} дней. Всё это уже в прогнозе.</p>

      <Group title="Налоги" total={sum(taxes)} sign={-1} note={`По налоговому календарю · ${regime}`}>
        {taxes.length ? taxes.map((e) => (
          <Row key={e.id} icon="tax" end={end(e.amount, fmtDayShort(e.date))}>
            {e.title.startsWith('Налог: ') ? 'Налог' : e.title}
            <small>{e.title.startsWith('Налог: ') ? e.title.slice(7) : e.cp}</small>
          </Row>
        )) : <p className="pay-empty">В ближайшие {H} дней налогов нет.</p>}
      </Group>

      <Group title="Выставленные счета" total={sum(invoices)} sign={1} note="Из 1С · когда заплатят — по тому, как клиент платил раньше">
        {invoices.length ? invoices.map((e) => {
          const c = e.clientId ? clients.get(e.clientId) : undefined
          const late = (e.overdueDays ?? 0) > 0
          return (
            <Row key={e.id} icon="doc" end={end(e.amount, fmtDayShort(e.date))}>
              {shortName(e.cp)}
              <small className={late ? 'red' : ''}>
                {e.docNo ? `Счёт №${e.docNo}` : 'Счёт'}{e.docDate ? ` от ${fmtDayShort(e.docDate)}` : ''}
                {late ? ` · просрочен на ${e.overdueDays} ${plural(e.overdueDays!, 'день', 'дня', 'дней')}`
                  : c?.medianDelay != null ? ` · обычно платит через ${Math.round(c.medianDelay)} ${plural(Math.round(c.medianDelay), 'день', 'дня', 'дней')}` : ''}
              </small>
            </Row>
          )
        }) : (
          <>
            <p className="pay-empty">Неоплаченных счетов нет. Пришёл счёт от поставщика — отсканируйте QR-код, и он встанет в прогноз.</p>
            <button className="link" onClick={onQr}><Icon name="qr" size={16} /> Добавить счёт по QR</button>
          </>
        )}
      </Group>

      <Group title="Регулярные платежи" total={outSoon} sign={-1} note="Из выписки · повторялись 4 месяца из последних 6">
        {regularOut.map((s) => {
          const e = s.first
          const salary = e.cat === 'salary'
          // три строки «Свет, вода, связь» подряд не различить — такие называем получателем, статью пишем ниже
          const twin = !salary && regularOut.filter((x) => x.first.cat === e.cat).length > 1
          return (
            <Row key={s.key} icon={CATS[e.cat].icon} end={end(e.amount, fmtDayShort(e.date))}>
              {salary ? e.title.replace(': ', ' — ') : twin ? shortName(e.cp) : CATS[e.cat].label}
              <small>{twin ? `${CATS[e.cat].label} · ` : ''}{every(s.dates)}{salary || twin ? '' : ` · ${shortName(e.cp)}`}</small>
            </Row>
          )
        })}
        {spend.map((r) => (
          <Row key={r.cat} icon={CATS[r.cat].icon} end={end(-r.daily, 'в день')}>
            {CATS[r.cat].label}
            <small>понемногу почти каждый день — по последним 8 неделям</small>
          </Row>
        ))}
      </Group>

      <Group title="Регулярные поступления" total={inSoon} sign={1} note="Из выписки · выручка по дням недели, оплаты клиентов — по их ритму">
        {revenue.map((r) => (
          <Row key={r.cat} icon={CATS[r.cat].icon} end={end(r.daily, 'в день')}>
            {CATS[r.cat].label}
            <small>каждый день, в среднем</small>
          </Row>
        ))}
        {regularIn.map((s) => (
          <Row key={s.key} icon="doc" end={end(s.first.amount, fmtDayShort(s.first.date))}>
            {shortName(s.first.cp)}
            <small>{every(s.dates, 'по ритму прошлых оплат')} · счёт ещё не выставлен</small>
          </Row>
        ))}
        {!revenue.length && !regularIn.length && <p className="pay-empty">Регулярных поступлений в выписке не нашли.</p>}
      </Group>

      {manual.length > 0 && (
        <Group title="Добавили вы" sign={-1} note="Фразой в чате, по полям или по QR-коду">
          {manual.map((e) => (
            <Row key={e.id} icon={e.amount > 0 ? 'plus' : 'minus'} end={end(e.amount, fmtDayShort(e.date))}>
              {e.title}
            </Row>
          ))}
        </Group>
      )}

      <button className="link" onClick={onAdd}><Icon name="plus" size={16} /> Добавить платёж</button>
    </>
  )
}
