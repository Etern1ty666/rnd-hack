import { useEffect, useState } from 'react'
import type { Evaluation } from '../lib/evaluate'
import type { Account } from '../lib/settings'
import { buildBills, type Bill } from '../lib/bills'
import type { PlannedEvent } from '../lib/types'
import type { ViCard, ViWidget } from '../lib/vi'
import { addDays, compact, fmtDayShort, MONTHS_NOM, parseDate, pct, rub } from '../lib/format'
import { load, save } from '../lib/store'
import { CardStack, Row, type StackCard } from './CardStack'
import { BankBadge } from './BankBadge'
import { Icon } from './Icon'

/** Какую карточку показать и подсветить: приходит с каждым ответом Vi. */
export interface Focus {
  card: ViCard
  n: number
}

interface Props {
  bizId: string
  /** Шапка сводки: какой бизнес и его статус; там же — переключить бизнес. */
  biz: React.ReactNode
  ev: Evaluation
  accounts: Account[]
  manual: PlannedEvent[]
  focus: Focus | null
  /** Открыть раздел в чате: Vi покажет его под ответом. */
  onShow: (w: ViWidget, label: string) => void
  onRemoveManual: (id: string) => void
}

/**
 * Платежи месяца таймлайном: оплаченный — галочка, ещё нет — пустой кружок.
 * Что раньше даты данных — уже прошло; остальное человек отмечает сам, нажав на кружок.
 */
function MonthBills({ bills, today, paid, onToggle }: { bills: Bill[]; today: string; paid: string[]; onToggle: (key: string) => void }) {
  if (!bills.length) return <p className="info-sub">Крупных платежей в этом месяце нет.</p>
  return (
    <ol className="timeline">
      {bills.map((b) => {
        const past = b.date <= today
        const done = past || paid.includes(b.key)
        return (
          <li key={b.key} className={`tl-item ${done ? 'done' : ''} ${b.status}`}>
            <button
              className="tl-mark" onClick={() => onToggle(b.key)} disabled={past} aria-pressed={done}
              aria-label={done ? `${b.label} — оплачено` : `Отметить «${b.label}» оплаченным`}
            >
              {done && <Icon name="check" size={12} stroke={3} />}
            </button>
            <span className="tl-name">{b.label}<small>{fmtDayShort(b.date)}{b.note ? ` · ${b.note}` : ''}</small></span>
            <span className="tl-sum num">
              {compact(b.amount)}
              {!done && b.status === 'short' && <small>не хватит {compact(b.short)}</small>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Платежи по месяцам прогноза: у каждого месяца свой заголовок — нажать, чтобы раскрыть или свернуть.
 * «Этот месяц» раскрыт сразу, остальные — по желанию.
 */
function PayMonths({ months, bills, today, paid, open, onOpen, onToggle }: {
  months: string[]
  bills: Bill[]
  today: string
  paid: string[]
  open: string[]
  onOpen: (month: string) => void
  onToggle: (key: string) => void
}) {
  const year = today.slice(0, 4)
  return (
    <>
      {months.map((m) => {
        const on = open.includes(m)
        const name = MONTHS_NOM[parseDate(`${m}-01`).getUTCMonth()]
        return (
          <section key={m} className="pay-month">
            <button className="pay-month-head" onClick={() => onOpen(m)} aria-expanded={on}>
              {m.startsWith(year) ? name : `${name} ${m.slice(0, 4)}`}
              <span className={`nav-caret ${on ? '' : 'closed'}`} aria-hidden="true" />
            </button>
            {on && <MonthBills bills={bills.filter((b) => b.date.startsWith(m))} today={today} paid={paid} onToggle={onToggle} />}
          </section>
        )
      })}
    </>
  )
}

/**
 * Правая колонка: сверху — какой бизнес и хватит ли денег, ниже счета и платежи по месяцам — карточками со строками.
 * Когда Vi отвечает про что-то из этого, карточка раскрывается и подсвечивается;
 * «Изменения» появляются, когда есть свои события, «Точность» — когда о ней спросили.
 */
export function InfoPanel({ bizId, biz, ev, accounts, manual, focus, onShow, onRemoveManual }: Props) {
  const [askedTrust, setAskedTrust] = useState(false)
  useEffect(() => { if (focus?.card === 'trust') setAskedTrust(true) }, [focus])
  // какие платежи месяца человек отметил оплаченными
  const [paid, setPaid] = useState<string[]>(() => load(`paid:${bizId}`, []))
  // какое изменение сейчас просят подтвердить к отмене
  const [confirm, setConfirm] = useState<string | null>(null)
  useEffect(() => save(`paid:${bizId}`, paid), [bizId, paid])
  // «этот месяц» — тот, что начинается сразу после даты данных: выписка до 30 сентября — значит, октябрь
  const today = ev.data.asOf
  const month = addDays(today, 1).slice(0, 7)
  const bills = buildBills(ev.sim, ev.sim.days.length, ev.minEvent)
  const months = [...new Set([month, ...bills.map((b) => b.date.slice(0, 7))])].sort()
  // какие месяцы раскрыты: сначала только этот
  const [openMonths, setOpenMonths] = useState<string[]>(() => load(`months:${bizId}`, [month]))
  useEffect(() => save(`months:${bizId}`, openMonths), [bizId, openMonths])
  const bt = ev.data.backtest
  const more = (label: string, fn: () => void) => <button className="link info-more" onClick={fn}>{label} <Icon name="arrow" size={14} /></button>

  // итог по счетам — в заголовке, как на билете: подпись слева, значение справа; копейки — на странице счёта
  const total = <span className="info-total num">{rub(ev.total)}</span>
  const cards: StackCard[] = [
    {
      id: 'money',
      title: 'Счета',
      head: total,
      peek: <span className="num">{rub(ev.total)}</span>,
      body: (
        <>
          {accounts.map((a) => (
            <Row
              key={a.id} lead={<BankBadge bank={a.bank} size={22} round />} onClick={() => onShow(`account:${a.id}`, `Счёт «${a.name}»`)}
              end={<span className={`num ${a.inForecast ? '' : 'muted'}`}>{rub(a.balance)}</span>}
            >
              {a.name}{a.last4 ? ` •${a.last4}` : ''}
              {!a.inForecast && <small>не учитывается в прогнозе</small>}
            </Row>
          ))}
          <Row icon="plus" quiet onClick={() => onShow('newAccount', 'Новый счёт')}>Новый счёт</Row>
        </>
      ),
    },
    {
      id: 'bills',
      title: 'Платежи',
      body: (
        <PayMonths
          months={months} bills={bills} today={today} paid={paid} open={openMonths}
          onOpen={(m) => setOpenMonths((o) => (o.includes(m) ? o.filter((x) => x !== m) : [...o, m]))}
          onToggle={(k) => setPaid((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
        />
      ),
    },
  ]
  if (manual.length) {
    // свёрнутая — итог как у изменений в коде: зелёным сколько придёт, красным сколько уйдёт
    const plus = manual.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0)
    const minus = manual.filter((m) => m.amount < 0).reduce((s, m) => s - m.amount, 0)
    cards.push({
      id: 'added',
      title: 'Изменения',
      peek: (
        <span className="chg-peek num">
          {plus > 0 && <span className="chg-in">+{compact(plus)}</span>}
          {minus > 0 && <span className="chg-out">−{compact(minus)}</span>}
        </span>
      ),
      body: manual.map((m) => {
        const income = m.amount > 0
        return (
          <Row
            key={m.id} lead={<Icon name={income ? 'plus' : 'minus'} size={18} stroke={2.4} className={income ? 'chg-in' : 'chg-out'} />}
            end={confirm === m.id ? (
              // отменить изменение — только после подтверждения
              <span className="chg-confirm">
                Отменить?
                <button className="chg-yes" onClick={() => { setConfirm(null); onRemoveManual(m.id) }}>Да</button>
                <button className="chg-no" onClick={() => setConfirm(null)}>Нет</button>
              </span>
            ) : (
              <>
                <b className={`num ${income ? 'chg-in' : 'chg-out'}`}>{compact(Math.abs(m.amount))}</b>
                <button className="row-x" onClick={() => setConfirm(m.id)} aria-label={`Отменить изменение «${m.title}»`} title="Отменить изменение">
                  <Icon name="refund" size={16} />
                </button>
              </>
            )}
          >
            {m.title}
            <small>{fmtDayShort(m.date)}</small>
          </Row>
        )
      }),
    })
  }
  if (askedTrust) {
    cards.push({
      id: 'trust',
      title: 'Точность',
      head: more('Подробно', () => onShow('trust', 'Точность прогноза')),
      body: (
        <>
          <Row icon="clock" end={<b className="num">±{compact(bt.mae.d14.model)}</b>}>Ошибка через 2 недели</Row>
          <Row icon="shield" end={<b className="num">{pct(bt.coverage)}</b>}>Дней в серой зоне</Row>
          <Row icon="warn" end={<b className="num">{bt.gapWindows ? `${bt.gapCaught} из ${bt.gapWindows}` : '—'}</b>}>Прошлых разрывов заметили</Row>
        </>
      ),
    })
  }

  return <CardStack top={biz} cards={cards} hot={focus ? { id: focus.card, n: focus.n } : null} />
}
