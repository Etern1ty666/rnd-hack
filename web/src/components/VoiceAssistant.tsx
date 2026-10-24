import { useEffect, useRef, useState } from 'react'
import type { Evaluation } from '../lib/evaluate'
import type { PlannedEvent } from '../lib/types'
import { compact, fmtDay } from '../lib/format'
import { parsePhrase } from '../lib/phrase'
import { Robot, type Mood } from './Robot'
import { Wave } from './Wave'
import { Icon } from './Icon'

interface Props {
  ev: Evaluation
  onAdd: (e: PlannedEvent) => void
  onRemove: (id: string) => void
  onGo: (page: 'payments' | 'whatif') => void
}

type Phase = 'idle' | 'listening' | 'thinking' | 'reply'
interface Reply {
  text: string
  action?: { label: string; run: () => void }
}
interface Scenario {
  q: string
  answer: () => Reply
}

const GREETING = 'Привет! Я слежу за деньгами вашего бизнеса. Спросите меня о платежах — я посчитаю.'
const rub = (v: number) => `${compact(v)}\u00a0₽`

/**
 * Голосовой помощник. Пока это витрина: речь не распознаём, а «проигрываем» готовые вопросы
 * слово за словом, как это делает потоковое распознавание. Ответы — настоящие, из прогноза.
 * Чтобы подключить живой микрофон, достаточно заменить start(): слова кладём в setHeard/setPartial,
 * громкость — в level, конец фразы — вызов think().
 */
export function VoiceAssistant({ ev, onAdd, onRemove, onGo }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [partial, setPartial] = useState('')
  const [reply, setReply] = useState(GREETING)
  const [typing, setTyping] = useState(false)
  const [cheer, setCheer] = useState(false)
  const [action, setAction] = useState<Reply['action']>()
  const level = useRef(0)
  const speaking = useRef(false)
  const timers = useRef<number[]>([])
  const turn = useRef(0)
  const said = useRef('')
  const current = useRef<Scenario | null>(null)
  const evRef = useRef(ev)
  useEffect(() => { evRef.current = ev }, [ev])

  const scenarios: Scenario[] = [
    {
      q: 'Хватит ли денег на зарплату?',
      answer: () => {
        const e = evRef.current
        const pay = e.bills.filter((b) => b.label === 'Зарплата')
        const b = pay.find((x) => x.status !== 'ok') ?? pay[0]
        if (!b) return { text: 'В ближайший месяц зарплаты не вижу.' }
        const help = e.actions[0] ? ` Выручит: ${e.actions[0].title.charAt(0).toLowerCase()}${e.actions[0].title.slice(1)}.` : ''
        const open = { label: 'Открыть платежи', run: () => onGo('payments') }
        if (b.status === 'short') return { text: `${fmtDay(b.date)} на зарплату не хватит ${rub(b.short)}.${help}`, action: open }
        if (b.status === 'risk') return { text: `${fmtDay(b.date)} на зарплату может не хватить — всё зависит от поступлений.${help}`, action: open }
        return { text: `Хватает: зарплата ${fmtDay(b.date)}, ${rub(b.amount)}.` }
      },
    },
    {
      q: 'Клиент обещал 300 тысяч 20-го',
      answer: () => {
        const e = evRef.current
        const p = parsePhrase('клиент обещал 300 тысяч 20-го', e.data.asOf)
        if (!p.amount || !p.date) return { text: 'Не расслышал сумму или дату — повторите, пожалуйста.' }
        const id = `v${Date.now()}`
        onAdd({ id, date: p.date, amount: p.amount, cat: 'manual', kind: 'manual', title: 'Обещанная оплата', cp: 'Клиент', source: 'manual' })
        return {
          text: `Записал: клиент заплатит ${rub(p.amount)} ${fmtDay(p.date)}. Прогноз уже обновил.`,
          action: { label: 'Отменить', run: () => { onRemove(id); setAction(undefined); setReply('Хорошо, убрал эту оплату из прогноза.') } },
        }
      },
    },
    {
      q: 'Сколько я могу взять себе?',
      answer: () => {
        const free = evRef.current.free
        return free > 0
          ? { text: `Без риска для платежей — до ${rub(free)}.` }
          : { text: 'Пока лучше ничего не выводить: все деньги уйдут на платежи месяца.', action: { label: 'Посчитать «что если»', run: () => onGo('whatif') } }
      },
    },
    {
      q: 'Когда ближайший налог?',
      answer: () => {
        const b = evRef.current.bills.find((x) => x.label === 'Налог')
        if (!b) return { text: 'В ближайший месяц налогов нет.' }
        return {
          text: `${fmtDay(b.date)} — налог ${rub(b.amount)}.${b.status === 'short' ? ` На него не хватит ${rub(b.short)}.` : ' На него хватает.'}`,
          action: { label: 'Открыть платежи', run: () => onGo('payments') },
        }
      },
    },
  ]

  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }
  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    speaking.current = false
  }
  useEffect(() => clear, [])

  // громкость «голоса»: пока звучит слово — громко и неровно, между словами — почти тишина
  useEffect(() => {
    let raf = 0
    const f = () => {
      const target = speaking.current ? 0.35 + Math.random() * 0.65 : 0.02 + Math.random() * 0.04
      level.current += (target - level.current) * 0.25
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])

  /** Фраза закончилась — без кнопки «Отправить»: робот думает и отвечает. */
  const think = (s: Scenario) => {
    setPhase('thinking')
    at(2600, () => {
      const r = s.answer()
      setPhase('reply')
      setAction(r.action)
      setCheer(true)
      setTyping(true)
      for (let k = 1; k <= r.text.length; k += 2) at(k * 14, () => setReply(r.text.slice(0, k + 1)))
      at(r.text.length * 14 + 20, () => setTyping(false))
      at(r.text.length * 14 + 1400, () => setCheer(false))
    })
  }

  const start = (s: Scenario) => {
    clear()
    setPhase('listening')
    setHeard('')
    setPartial('')
    setAction(undefined)
    setCheer(false)
    said.current = ''
    const words = s.q.split(' ')
    let t = 450
    words.forEach((w, i) => {
      const dur = 160 + w.length * 45
      at(t, () => { speaking.current = true })
      // слово «дописывается» на глазах, как в потоковом распознавании
      const steps = Math.min(w.length, 3)
      for (let k = 1; k <= steps; k++) at(t + (dur * k) / (steps + 1), () => setPartial(w.slice(0, Math.ceil((w.length * k) / steps))))
      at(t + dur, () => {
        speaking.current = false
        said.current = words.slice(0, i + 1).join(' ')
        setHeard(said.current)
        setPartial('')
      })
      t += dur + 90 + Math.random() * 140
    })
    at(t + 700, () => think(s))
    current.current = s
  }

  const mic = () => {
    if (phase !== 'listening') return start(scenarios[turn.current++ % scenarios.length])
    // остановили раньше — отвечаем на то, что успели услышать
    clear()
    setPartial('')
    const s = current.current
    if (s && said.current === s.q) think(s)
    else if (said.current) think({ q: said.current, answer: () => ({ text: 'Кажется, вы не договорили. Скажите ещё раз — я слушаю.' }) })
    else setPhase('idle')
  }

  const mood: Mood = phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : cheer ? 'happy' : 'idle'

  return (
    <div className="voice">
      <div className="voice-bot"><Robot mood={mood} level={level} /></div>

      <div className="voice-bubble" aria-live="polite">
        {phase === 'thinking' ? (
          <span className="dots" aria-label="Думаю"><i /><i /><i /></span>
        ) : phase === 'listening' ? (
          <span className="muted">Слушаю…</span>
        ) : (
          <>
            {reply}
            {action && !typing && (
              <button className="link voice-action" onClick={action.run}>{action.label} <Icon name="arrow" size={16} /></button>
            )}
          </>
        )}
      </div>

      <p className={`voice-said ${phase === 'listening' ? 'live' : ''}`}>
        {heard}
        {partial && <span className="partial">{heard ? ' ' : ''}{partial}</span>}
        {phase === 'listening' && <span className="caret" />}
        {!heard && !partial && phase !== 'listening' && <span className="voice-placeholder">Нажмите на микрофон и спросите</span>}
      </p>

      <Wave level={level} active={phase === 'listening'} />

      <button className={`voice-mic ${phase === 'listening' ? 'on' : ''}`} onClick={mic} aria-label={phase === 'listening' ? 'Остановить' : 'Сказать'}>
        <Icon name="mic" size={30} stroke={2} />
      </button>
      <div className="voice-chips">
        <div>{scenarios.map((s) => <button key={s.q} onClick={() => start(s)}>{s.q}</button>)}</div>
      </div>
    </div>
  )
}
