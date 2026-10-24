import type { Action } from '../lib/model'
import { Icon } from './Icon'

interface Props {
  actions: Action[]
  applied: Set<string>
  onToggle: (id: string) => void
}

/** Три шага, отмечаются галочкой — прогноз над ними сразу пересчитывается. */
export function ActionList({ actions, applied, onToggle }: Props) {
  return (
    <ol className="steps">
      {actions.map((a, i) => {
        const on = applied.has(a.id)
        return (
          <li key={a.id}>
            <button className={`step ${on ? 'on' : ''}`} onClick={() => onToggle(a.id)} aria-pressed={on}>
              <span className="step-check">{on ? <Icon name="check" size={16} stroke={2.4} /> : i + 1}</span>
              <span className="step-text">
                <b>{a.title}</b>
                <span>{a.detail}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
