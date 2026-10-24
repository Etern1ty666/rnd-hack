import { useState } from 'react'
import type { Evaluation } from '../lib/evaluate'
import { ActionList } from './ActionList'
import { Bills } from './Bills'
import { Drawer } from './Drawer'
import { Icon } from './Icon'

interface Props {
  ev: Evaluation
  applied: Set<string>
  onToggle: (id: string) => void
}

/**
 * На главном — одна общая фраза: хватит или нет. Когда, на что именно
 * и как успеть — в панели по нажатию, чтобы экран не превращался в отчёт.
 */
export function StatusCard({ ev, applied, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const { tone } = ev.status
  const icon = <Icon name={tone === 'ok' ? 'check' : tone === 'risk' ? 'warn' : 'cross'} size={18} stroke={2.4} />

  // всё хорошо и без шагов — подробностей не нужно
  if (ev.before.status === 'ok') {
    return (
      <div className="status ok">
        <span className="status-ico">{icon}</span>
        <div>
          <b>{ev.status.title}</b>
          <span>{ev.status.sub}</span>
        </div>
      </div>
    )
  }

  const title = tone === 'short' ? 'Не хватит денег на платежи' : tone === 'risk' ? 'Может не хватить денег на платежи' : ev.status.title
  const sub = tone === 'ok' ? 'Посмотреть шаги' : 'Посмотреть, когда и как успеть'
  const atRisk = ev.bills.filter((b) => b.status !== 'ok')

  return (
    <>
      <button className={`status ${tone} status-btn`} onClick={() => setOpen(true)}>
        <span className="status-ico">{icon}</span>
        <div>
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <Icon name="arrow" size={20} className="status-go" />
      </button>

      {open && (
        <Drawer title="Подробности" onClose={() => setOpen(false)}>
          <div className="status-details">
            <div className={`status ${tone}`}>
              <span className="status-ico">{icon}</span>
              <div>
                <b>{ev.status.title}</b>
                <span>{ev.status.sub}</span>
              </div>
            </div>

            {atRisk.length > 0 && <Bills bills={atRisk} title="Под угрозой" />}

            <section className="card-block">
              <h2>Как успеть</h2>
              <p className="muted status-hint">Отметьте шаги — прогноз сразу пересчитается.</p>
              <ActionList actions={ev.actions} applied={applied} onToggle={onToggle} />
            </section>
          </div>
        </Drawer>
      )}
    </>
  )
}
