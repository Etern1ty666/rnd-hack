import { useEffect, useRef, useState } from 'react'
import type { ViAction, ViMsg } from '../lib/vi'
import { Robot, type Mood } from './Robot'
import { Wave } from './Wave'
import { Icon } from './Icon'

interface Props {
  /** Спросить Vi: вопрос и ответ попадают и в переписку. */
  ask: (q: string) => ViMsg
  /** Нажали кнопку под ответом; если вернулся текст — показываем его вместо ответа. */
  onAction: (a: ViAction, msgId: string) => string | void
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
const QUESTIONS = ['Хватит ли денег на зарплату?', 'Клиент обещал 300 тысяч 20-го', 'Сколько я могу взять себе?', 'Когда ближайший налог?']

/**
 * Голосовой режим Vi. Пока это витрина: речь не распознаём, а «проигрываем» готовые вопросы
 * слово за словом, как это делает потоковое распознавание. Ответы — настоящие, из прогноза (lib/vi.ts).
 * Чтобы подключить живой микрофон, достаточно заменить start(): слова кладём в setHeard/setPartial,
 * громкость — в level, конец фразы — вызов think().
 */
export function VoiceAssistant({ ask, onAction }: Props) {
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

  const scenarios: Scenario[] = QUESTIONS.map((q) => ({
    q,
    answer: () => {
      const m = ask(q)
      const a = m.actions?.[0]
      return {
        text: m.text,
        action: a && {
          label: a.label,
          run: () => {
            const t = onAction(a, m.id)
            if (t) { setAction(undefined); setReply(t) }
          },
        },
      }
    },
  }))

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
