import type { CatKey, CompanyData } from '../lib/types'
import { CATS, INCOME_CATS } from '../lib/categories'
import { compact } from '../lib/format'

// «На себя» — обычная статья: у малого бизнеса личное и рабочее идут с одной карты
const OUT_ORDER: CatKey[] = ['suppliers', 'salary', 'owner_out', 'tax', 'rent', 'loan', 'utilities', 'services', 'marketing', 'bank', 'other']

/** «Из каждых 100 ₽» — каждая точка — рубль. Мелкие категории сворачиваем в «Прочее». */
export function Hundred({ data }: { data: CompanyData }) {
  const c = data.categories.last90
  const income = INCOME_CATS.reduce((s, k) => s + (c[k] ?? 0), 0)
  if (!income) return null
  const per = (v: number) => (v / income) * 100

  const all = OUT_ORDER.map((k) => ({ k, v: per(c[k] ?? 0) })).filter((r) => r.v > 0.4)
  const big = all.filter((r) => r.v >= 3)
  const rest = all.filter((r) => r.v < 3).reduce((s, r) => s + r.v, 0)
  const rows = [...big.map((r) => ({ label: CATS[r.k].label, v: r.v })), ...(rest > 0.5 ? [{ label: 'Прочее', v: rest }] : [])]
  const left = 100 - all.reduce((s, r) => s + r.v, 0)

  return (
    <div>
      <p className="lead-note">За 90 дней пришло {compact(income)} ₽. Куда ушли каждые 100 ₽ — вместе с тем, что вы взяли на себя:</p>
      {rows.map((r) => (
        <div className="hundred-row" key={r.label}>
          <span>{r.label}</span>
          <div className="coins" aria-hidden="true">{Array.from({ length: Math.round(r.v) }, (_, i) => <i key={i} className="coin" />)}</div>
          <b className="num">{Math.round(r.v)} ₽</b>
        </div>
      ))}
      <div className="hundred-row total">
        <span>{left >= 0 ? 'Осталось' : 'Не хватило'}</span>
        <div className="coins" aria-hidden="true">
          {Array.from({ length: Math.abs(Math.round(left)) }, (_, i) => <i key={i} className={`coin ${left < 0 ? 'red' : 'in'}`} />)}
        </div>
        <b className="num" style={{ color: left < 0 ? 'var(--red)' : 'var(--green)' }}>{Math.round(left)} ₽</b>
      </div>
    </div>
  )
}
