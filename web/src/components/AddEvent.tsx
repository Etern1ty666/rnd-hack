import { useEffect, useRef, useState } from 'react'
import type { PlannedEvent } from '../lib/types'
import { compact, fmtDay, fmtDayShort, rub } from '../lib/format'
import { parsePhrase } from '../lib/phrase'
import { Icon } from './Icon'

interface Props {
  days: string[]
  horizon: number
  items: PlannedEvent[]
  onAdd: (e: PlannedEvent) => void
  onRemove: (id: string) => void
}

/** Распознавание речи есть в Chrome и Safari, в Firefox — нет; тогда остаётся ввод фразой. */
interface Recognition {
  lang: string
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
const Speech = w.SpeechRecognition ?? w.webkitSpeechRecognition

const EXAMPLES = ['клиент обещал 300 тыс. 20-го', 'в пятницу куплю кофемашину за 150к', 'через неделю штраф 30 тыс']

/** Событие одной фразой; если фраза не разобралась — те же поля руками. */
export function AddEvent({ today, days, horizon, items, onAdd, onRemove }: Props & { today: string }) {
  const [text, setText] = useState('')
  const [hearing, setHearing] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const rec = useRef<Recognition | null>(null)
  const voice = () => {
    if (!Speech) return
    if (rec.current) return rec.current.stop()
    const r = new Speech()
    r.lang = 'ru-RU'
    r.interimResults = true
    // обработчики привязаны к этой записи: брошенная запись не должна трогать состояние
    r.onresult = (e) => { if (rec.current === r) setText(Array.from(e.results, (x) => x[0].transcript).join(' ')) }
    r.onerror = (e) => rec.current === r && setVoiceNote(e.error === 'not-allowed' ? 'Нет доступа к микрофону — разрешите его в браузере или напишите фразой.' : e.error === 'no-speech' ? 'Ничего не услышали — нажмите на микрофон и скажите ещё раз.' : 'Не получилось распознать — напишите фразой.')
    r.onend = () => { if (rec.current === r) { rec.current = null; setHearing(false) } }
    rec.current = r
    setVoiceNote('')
    setText('')
    setHearing(true)
    r.start()
  }
  useEffect(() => () => { const r = rec.current; rec.current = null; r?.abort() }, [])
  const [manual, setManual] = useState(false)
  const parsed = text.trim() ? parsePhrase(text, today) : null
  const ready = parsed?.amount && parsed.date
  const inRange = parsed?.date ? days.includes(parsed.date) : false
  const addParsed = () => {
    if (!parsed?.amount || !parsed.date) return
    onAdd({
      id: `m${Date.now()}`, date: parsed.date, amount: parsed.dir === 'in' ? parsed.amount : -parsed.amount, cat: 'manual', kind: 'manual',
      title: parsed.title || (parsed.dir === 'in' ? 'Обещанная оплата' : 'Плановый расход'), cp: parsed.title, source: 'manual',
    })
    setText('')
  }
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState(300000)
  const [day, setDay] = useState(Math.min(19, horizon - 1))
  const [who, setWho] = useState('')

  const submit = () => {
    if (!amount || amount <= 0) return
    onAdd({
      id: `m${Date.now()}`,
      date: days[day],
      amount: dir === 'in' ? amount : -amount,
      cat: 'manual',
      kind: 'manual',
      title: who.trim() || (dir === 'in' ? 'Обещанная оплата' : 'Плановый расход'),
      cp: who.trim(),
      source: 'manual',
    })
    setWho('')
  }

  return (
    <div>
      <div className="phrase">
        <div className="phrase-row">
          <input
            className="phrase-input" value={text} autoFocus placeholder={hearing ? 'Говорите…' : 'Например: клиент обещал 300 тыс. 20-го'}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addParsed()} aria-label="Событие одной фразой"
          />
          {Speech && (
            <button className={`mic ${hearing ? 'on' : ''}`} onClick={voice} aria-pressed={hearing} aria-label={hearing ? 'Остановить запись' : 'Сказать голосом'}>
              <Icon name="mic" size={20} stroke={2} />
            </button>
          )}
        </div>
        {voiceNote && <p className="set-note">{voiceNote}</p>}
        {!text && !hearing && (
          <div className="phrase-examples">
            {EXAMPLES.map((x) => <button key={x} onClick={() => setText(x)}>{x}</button>)}
          </div>
        )}
        {parsed && (
          <div className={`phrase-preview ${ready ? '' : 'partial'}`}>
            <span className={parsed.dir === 'in' ? 'pos' : ''}>{parsed.amount ? rub(parsed.dir === 'in' ? parsed.amount : -parsed.amount) : 'сумма?'}</span>
            <span>{parsed.date ? fmtDay(parsed.date) : 'когда?'}</span>
            <span>{parsed.title || (parsed.dir === 'in' ? 'поступление' : 'расход')}</span>
          </div>
        )}
        {parsed && ready && !inRange && <p className="set-note">Дата дальше 60 дней прогноза — событие сохранится, но в расчёт попадёт позже.</p>}
        {parsed && !ready && <p className="set-note">Не хватает {!parsed.amount && !parsed.date ? 'суммы и даты' : !parsed.amount ? 'суммы' : 'даты'} — допишите во фразе.</p>}
        <button className="btn" onClick={addParsed} disabled={!ready} style={{ marginTop: 14 }}>Добавить в прогноз</button>
      </div>

      <button className="link muted-link" style={{ marginTop: 20 }} onClick={() => setManual(!manual)}>{manual ? 'Скрыть поля' : 'Заполнить по полям'}</button>
      {manual && (<>
      <div className="add-form" style={{ marginTop: 12 }}>
        <select value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')} aria-label="Направление">
          <option value="in">Мне заплатят</option>
          <option value="out">Я заплачу</option>
        </select>
        <input type="number" min={0} step={10000} value={amount} onChange={(e) => setAmount(+e.target.value)} aria-label="Сумма" />
        <span>₽</span>
        <select value={day} onChange={(e) => setDay(+e.target.value)} aria-label="Дата">
          {days.slice(0, Math.max(horizon, 60)).map((d, i) => <option key={d} value={i}>{fmtDay(d)}</option>)}
        </select>
        <input type="text" placeholder={dir === 'in' ? 'кто' : 'за что'} value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="Комментарий" />
      </div>
      <button className="btn" onClick={submit} style={{ marginTop: 20 }}>Добавить в прогноз</button>
      </>)}
      {items.length > 0 && (
        <div className="manual-list">
          {items.map((e) => (
            <div className="manual-item" key={e.id}>
              <b className="num" style={{ color: e.amount > 0 ? 'var(--green)' : undefined }}>{compact(e.amount, true)}</b>
              <span>{fmtDayShort(e.date)} · {e.title}</span>
              <button onClick={() => onRemove(e.id)} aria-label="Удалить"><Icon name="cross" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
