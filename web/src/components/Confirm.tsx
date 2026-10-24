import { useState } from 'react'
import type { Answer, Question } from '../lib/confirm'

interface Props {
  questions: Question[]
  onAnswer: (id: string, a: Answer) => void
}

/** Карточка «Похоже, … — верно?»: один вопрос за раз, ответ в один тап. */
export function Confirm({ questions, onAnswer }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState(0)
  const q = questions[0]
  if (!q) return null

  return (
    <section className="confirm" key={q.id}>
      <div className="confirm-head">
        <span>Проверьте догадку</span>
        <span>{questions.length > 1 ? `ещё ${questions.length - 1}` : 'последняя'}</span>
      </div>
      <p className="confirm-text">{q.text}</p>
      {editing === q.id ? (
        <div className="confirm-edit">
          <input
            type="text" inputMode="numeric" value={value ? value.toLocaleString('ru-RU') : ''} autoFocus aria-label="Сумма"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setValue(+e.target.value.replace(/\D/g, '') || 0)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value > 0) { onAnswer(q.id, { s: 'amount', v: q.income ? value : -value }); setEditing(null) } }}
          />
          <span>₽</span>
          <button className="btn" disabled={!(value > 0)} onClick={() => { onAnswer(q.id, { s: 'amount', v: q.income ? value : -value }); setEditing(null) }}>Сохранить</button>
          <button className="link" onClick={() => setEditing(null)}>Отмена</button>
        </div>
      ) : (
        <div className="confirm-btns">
          <button className="btn" onClick={() => onAnswer(q.id, { s: 'yes' })}>Да</button>
          <button className="btn ghost" onClick={() => { setValue(q.amount); setEditing(q.id) }}>Другая сумма</button>
          <button className="btn ghost" onClick={() => onAnswer(q.id, { s: 'no' })}>{q.no}</button>
        </div>
      )}
    </section>
  )
}
