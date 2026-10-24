import type { CompanyData } from '../lib/types'
import { shortName } from '../lib/format'

const MAX = 60

/** Кто как платит: точка — одна оплата, позиция — сколько дней после счёта. */
export function Clients({ data }: { data: CompanyData }) {
  const rows = data.clients.filter((c) => c.delays.length >= 3).sort((a, b) => b.total - a.total).slice(0, 5)
  if (!rows.length) return null
  const x = (d: number) => `${(Math.min(Math.max(d, 0), MAX) / MAX) * 100}%`
  return (
    <div>
      <p className="lead-note">Через сколько дней после счёта платят крупные клиенты:</p>
      {rows.map((c) => {
        const med = Math.round(c.medianDelay ?? 0)
        return (
          <div className="cl-row" key={c.id}>
            <span>{shortName(c.name)}</span>
            <div className="cl-strip">
              <div className="axis" />
              {c.delays.map((d, i) => <i key={i} className="pt" style={{ left: x(d) }} />)}
              <i className="med" style={{ left: x(med) }} />
            </div>
            <b className={`num ${med > 30 ? 'red' : ''}`}>{med} дн.</b>
          </div>
        )
      })}
      <div className="cl-row scale">
        <span />
        <div className="cl-strip"><span style={{ left: 0 }}>0</span><span style={{ left: x(30) }}>30</span><span style={{ left: '100%' }}>60+ дн.</span></div>
        <span />
      </div>
    </div>
  )
}
