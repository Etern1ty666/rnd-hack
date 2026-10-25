import type { CatKey, CompanyData } from '../lib/types'
import { CATS } from '../lib/categories'
import { compact, daysBetween, fmtDay, MONTHS_NOM, plural } from '../lib/format'
import { OpsDonut } from './OpsDonut'
import { Icon } from './Icon'

// поступления — всё, что пришло на счёт, включая свои деньги и кредиты; остальное — траты
const IN_CATS = new Set<CatKey>(['card', 'sbp', 'cash', 'marketplace', 'clients', 'owner_in', 'loan_in', 'refund_in'])
const MONTHS = 6
const withYear = (d: string) => `${fmtDay(d)} ${d.slice(0, 4)}`

/** Шесть столбиков — сумма статьи по месяцам: видно, растёт она или нет. */
function Bars({ values, months }: { values: number[]; months: string[] }) {
  const max = Math.max(...values, 1)
  return (
    <svg className="cat-bars" width={MONTHS * 9 - 3} height={20} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 2 : 0, (v / max) * 20)
        return <rect key={months[i]} x={i * 9} y={20 - h} width={6} height={h} rx={1.5}><title>{`${MONTHS_NOM[+months[i].slice(5) - 1]}: ${compact(v)} ₽`}</title></rect>
      })}
    </svg>
  )
}

/**
 * Операции — отдельной страницей из меню: как разобрали выписку и что получилось по статьям.
 * Каждая статья — сумма за 90 дней, 90 дней до этого и столбики по месяцам.
 */
export function OpsPage({ data }: { data: CompanyData }) {
  const { last90, prev90, monthly } = data.categories
  const q = data.quality
  const months = [...new Set(monthly.map((x) => x.m))].sort().slice(-MONTHS)
  const byMonth = (k: CatKey) => months.map((m) => monthly.filter((x) => x.m === m && x.cat === k).reduce((s, x) => s + x.v, 0))
  const cats = (Object.keys(CATS) as CatKey[]).filter((k) => (last90[k] ?? 0) > 0 || (prev90[k] ?? 0) > 0)
  const span = Math.max(1, Math.round(daysBetween(data.company.firstDate, data.asOf) / 30.4))

  const notes = [
    q.duplicates ? `${q.duplicates} ${plural(q.duplicates, 'дубль убрали', 'дубля убрали', 'дублей убрали')}` : 'дублей нет',
    q.emptyPurpose ? `у ${q.emptyPurpose} без назначения платежа статью нашли по контрагенту` : null,
    q.gaps.length ? `${q.gaps.length} ${plural(q.gaps.length, 'пропуск', 'пропуска', 'пропусков')} в выписке — остаток не сходится, учли` : 'пропусков в выписке нет',
  ].filter(Boolean)

  const table = (title: string, list: CatKey[]) => {
    const rows = list.sort((a, b) => (last90[b] ?? 0) - (last90[a] ?? 0))
    if (!rows.length) return null
    return (
      <div className="cat-table">
        <div className="cat-row cat-head" aria-hidden="true">
          <span />
          <span>{title}</span>
          <span className="cat-spark">6 мес.</span>
          <span>90 дней</span>
          <span>до этого</span>
        </div>
        {rows.map((k) => {
          const now = last90[k] ?? 0
          const before = prev90[k] ?? 0
          const d = before > 0 ? now / before - 1 : null
          return (
            <div key={k} className="cat-row">
              <span className="row-lead"><Icon name={CATS[k].icon} size={20} /></span>
              <span className="cat-name">{CATS[k].label}</span>
              <span className="cat-spark"><Bars values={byMonth(k)} months={months} /></span>
              <span className="num cat-now">
                <b>{compact(now)}</b>
                {d != null && Math.abs(d) >= 0.1 && <small>{d > 0 ? '↑' : '↓'}{Math.round(Math.abs(d) * 100)}%</small>}
              </span>
              <span className="num muted">{compact(before)}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <h1 className="page-title">Операции</h1>
      <p className="page-sub">
        Разобрали {q.rows.toLocaleString('ru-RU')} {plural(q.rows, 'операцию', 'операции', 'операций')} за {span} {plural(span, 'месяц', 'месяца', 'месяцев')} — с {withYear(data.company.firstDate)} по {withYear(data.asOf)}.
        Каждую разложили по статьям: по назначению платежа и контрагенту. {notes.join(', ').replace(/^./, (c) => c.toUpperCase())}.
      </p>

      <OpsDonut data={data} />

      <section className="card-block">
        <h2>По статьям</h2>
        {table('Поступления', cats.filter((k) => IN_CATS.has(k)))}
        {table('Траты', cats.filter((k) => !IN_CATS.has(k)))}
        <p className="pay-group-note">Столбики — последние {MONTHS} месяцев. Отсюда прогноз берёт ритм выручки и регулярные платежи.</p>
      </section>
    </>
  )
}
