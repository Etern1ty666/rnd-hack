import type { PlannedEvent } from '../lib/types'
import { INDUSTRIES, type BizSettings } from '../lib/settings'
import { REGIMES } from '../lib/tax'
import { compact, fmtDay } from '../lib/format'

interface Props {
  s: BizSettings
  onChange: (s: BizSettings) => void
  onReset: () => void
  /** Есть, только если бизнесов несколько. */
  onRemove?: () => void
  /** Ближайшие налоги — чтобы сразу показать, что даёт выбор системы. */
  taxes: PlannedEvent[]
}

/** Настройки самого бизнеса. Счета живут отдельно — в левой колонке и на своих страницах. */
export function Settings({ s, onChange, onReset, onRemove, taxes }: Props) {
  const set = (patch: Partial<BizSettings>) => onChange({ ...s, ...patch })
  const nextTax = taxes[0]

  return (
    <div className="settings">
      <h1 className="page-title">Настройки бизнеса</h1>

      <div className="settings-grid">
        <div className="set-col">
          <section className="set-block">
            <h2>О бизнесе</h2>
            <div className="card-list">
              <label className="field">
                <span>Название</span>
                <input value={s.name} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="field">
                <span>Чем занимаетесь</span>
                <select value={s.industry} onChange={(e) => set({ industry: e.target.value })}>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </label>
              <div className="field">
                <span>Форма</span>
                <div className="seg">
                  {(['ИП', 'ООО'] as const).map((f) => (
                    <button key={f} className={s.form === f ? 'on' : ''} onClick={() => set({ form: f, regime: f === 'ООО' && s.regime === 'psn' ? 'auto' : s.regime })}>{f}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="set-block">
            <h2>Неприкосновенный запас</h2>
            <div className="card-list">
              <label className="field">
                <span>Не тратить ниже</span>
                <input type="number" step={10000} min={0} value={s.cushion} onChange={(e) => set({ cushion: Math.max(0, +e.target.value) })} />
              </label>
            </div>
            <p className="set-note">Эти деньги не попадут в «свободно» — подушка на непредвиденное.</p>
          </section>
        </div>

        <div className="set-col">
          <section className="set-block">
            <h2>Система налогов</h2>
            <div className="card-list">
              {REGIMES.map((r) => {
                const disabled = r.onlyIP && s.form !== 'ИП'
                return (
                  <button key={r.id} className={`radio ${s.regime === r.id ? 'on' : ''}`} disabled={disabled} onClick={() => set({ regime: r.id })}>
                    <span className="radio-dot" />
                    <span className="radio-text"><b>{r.name}</b><span>{disabled ? 'только для ИП' : r.hint}</span></span>
                  </button>
                )
              })}
            </div>
            {nextTax && (
              <p className="set-note">
                Ближайший налог — <b>{fmtDay(nextTax.date)}, {compact(-nextTax.amount)} ₽</b>
                {nextTax.title.startsWith('Налог: ') ? ` (${nextTax.title.slice(7)})` : ''}. Сумму пересчитаем, когда придёт новая выручка.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="set-foot">
        <button className="link muted-link" onClick={onReset}>Сбросить настройки демо</button>
        {onRemove && <button className="link danger-link" onClick={onRemove}>Убрать бизнес</button>}
      </div>
    </div>
  )
}
