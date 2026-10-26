import { useEffect, useRef, useState } from 'react'
import type { Evaluation } from '../lib/evaluate'
import type { PlannedEvent } from '../lib/types'
import { viAnswer, viFile, viSuggestions, viWidget, type Attachment, type ViAction, type ViCard, type ViMsg, type ViWidget } from '../lib/vi'
import { load, save } from '../lib/store'
import type { Mood } from './Robot'
import { ViBot } from './ViBot'
import { VoiceAssistant } from './VoiceAssistant'
import { MiniBills } from './MiniBills'
import { PlusMenu } from './PlusMenu'
import { Icon, type IconName } from './Icon'

/** Показать раздел в переписке по команде снаружи (ссылки в карточках справа). */
export interface ViCommand {
  n: number
  widget: ViWidget
  label: string
}

interface Props {
  ev: Evaluation
  /** Группа чата — бизнес или «без группы»; переписка хранится под группой и id чата. */
  group: string
  page: string
  /** Открытая страница (новый бизнес); null — переписка с Vi. */
  view: React.ReactNode
  applied: Set<string>
  /** Широкий экран: курсор сразу в строке и подсказка в ней подлиннее. */
  roomy: boolean
  /** Чат этого бизнеса: у каждого своя переписка. */
  chatId: string
  /** Кнопки меню и сводки — только на узком экране, где колонок не видно. */
  bar?: React.ReactNode
  /** Человек написал Vi — первое сообщение становится названием чата. */
  onSent: (text: string) => void
  onToggle: (id: string) => void
  onAdd: (e: PlannedEvent) => void
  onRemove: (id: string) => void
  /** Живой раздел под ответом Vi: платежи, «что если», расходы, точность, настройки, счёт. */
  renderWidget: (w: ViWidget) => React.ReactNode
  command: ViCommand | null
  onSheet: (s: 'add' | 'qr') => void
  onShowChat: () => void
  onFocus: (card: ViCard) => void
}

const KEEP = 60
// что можно открыть из «+» в строке ввода — разделы бизнеса прямо в переписке.
// Платежи и расходы — отдельные страницы в меню, новый счёт — в карточке «Счета»: здесь их не повторяем
const TOOLS: { w: ViWidget; label: string; icon: IconName }[] = [
  { w: 'whatif', label: 'Что если', icon: 'spark' },
  { w: 'trust', label: 'Точность прогноза', icon: 'shield' },
  { w: 'settings', label: 'Настройки бизнеса', icon: 'gear' },
]
let seq = 0
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * Что в приложенном файле. Картинку проверяем на платёжный QR-код — распознавание тяжёлое,
 * поэтому грузим его, только когда приложили картинку; .txt — скорее всего выписка 1С.
 */
async function readAttachment(f: File): Promise<Attachment> {
  if (f.type.startsWith('image/')) {
    try {
      const { findQrInFile, parsePayQr } = await import('../lib/payqr')
      const bytes = await findQrInFile(f)
      const qr = bytes && parsePayQr(bytes)
      if (qr) return { name: f.name, kind: 'invoice', qr }
    } catch { /* картинка не открылась — как будто кода нет */ }
    return { name: f.name, kind: 'image' }
  }
  return { name: f.name, kind: /\.txt$/i.test(f.name) ? 'statement' : 'other' }
}

/** Кнопки из прошлой версии вели на отдельные страницы — теперь они показывают раздел в переписке. */
function upgrade(m: ViMsg): ViMsg {
  if (!m.actions) return m
  return { ...m, actions: m.actions.map((a) => { const go = (a as { go?: ViWidget }).go; return go ? { ...a, widget: go } : a }) }
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
}

let mirror: HTMLDivElement | null = null
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'wordSpacing', 'tabSize',
] as const

/**
 * Где мигает курсор в строке ввода — туда смотрит Vi. Копируем поле в невидимое «зеркало»
 * с теми же шрифтом, шириной и переносами и ставим метку на место курсора — так учитываются
 * и Enter, и перенос длинной строки.
 */
function caretPoint(el: HTMLTextAreaElement) {
  if (!mirror) {
    mirror = document.createElement('div')
    mirror.setAttribute('aria-hidden', 'true')
    Object.assign(mirror.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', height: 'auto' })
    document.body.appendChild(mirror)
  }
  const cs = getComputedStyle(el)
  for (const k of MIRRORED) mirror.style[k] = cs[k]
  const at = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd
  mirror.textContent = el.value.slice(0, at)
  const mark = document.createElement('span')
  mark.textContent = '\u200b'
  mirror.appendChild(mark)
  const r = el.getBoundingClientRect()
  // время движения — только когда в строке есть текст: к пустой строке Vi не тянется, только смотрит
  return { x: r.left + mark.offsetLeft, y: r.top + mark.offsetTop + mark.offsetHeight / 2 - el.scrollTop, at: el.value ? performance.now() : 0 }
}

/**
 * Центр экрана — разговор с Vi, как у Claude: переписка, ответ печатается на глазах,
 * под ответом — платежи, шаги «как успеть» и кнопки. Внизу всегда строка ввода, на ней стоит Vi.
 * Открытый раздел (платежи, «что если»…) встаёт на место переписки; написали Vi — вернулись к ней.
 * Каждый чат хранится отдельно и переживает перезагрузку; голосовые вопросы попадают туда же.
 */
export function ViChat(props: Props) {
  const { ev, group, page, view, applied, roomy, chatId, bar } = props
  const { onSent, onToggle, onAdd, onRemove, renderWidget, command, onSheet, onShowChat, onFocus } = props
  const key = `chat:${group}:${chatId}`
  const [msgs, setMsgs] = useState<ViMsg[]>(() => load<ViMsg[]>(key, []).map(upgrade))
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'chat' | 'voice'>('chat')
  // вопрос, над которым Vi «думает», и сколько букв ответа уже напечатано
  const [pending, setPending] = useState<{ q: string; widget?: ViWidget; file?: Promise<Attachment> } | null>(null)
  // приложенный файл ждёт в строке ввода, пока сообщение не отправят
  const [file, setFile] = useState<File | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<{ id: string; len: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // пока строка активна, Vi смотрит на курсор в ней
  const gaze = useRef<{ x: number; y: number; at: number } | null>(null)
  const look = () => { if (field.current && document.activeElement === field.current) gaze.current = caretPoint(field.current) }
  // курсор двигают и стрелками, и мышью — следим за любым его движением
  useEffect(() => {
    document.addEventListener('selectionchange', look)
    return () => document.removeEventListener('selectionchange', look)
  }, [])
  // «+» в строке ввода: платёж по полям или QR со счёта
  const [plus, setPlus] = useState(false)
  const plusBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!plus) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !plusBox.current?.contains(e.target as Node)) setPlus(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [plus])
  const evRef = useRef(ev)
  useEffect(() => { evRef.current = ev }, [ev])
  useEffect(() => save(key, msgs.slice(-KEEP)), [key, msgs])

  /** Ответ Vi; если это событие — сразу пишем его в прогноз; раздел — показываем под ответом. Карточка справа подсвечивается. */
  const reply = (q: string, widget?: ViWidget, seen?: Attachment): ViMsg => {
    const r = widget ? viWidget(widget) : seen ? viFile(seen, q, evRef.current) : viAnswer(q, evRef.current)
    if (r.add) onAdd(r.add)
    if (r.focus) onFocus(r.focus)
    return { id: uid(), role: 'vi', text: r.text, bills: r.bills, steps: r.steps, actions: r.actions, widget: r.widget }
  }

  const send = (raw: string) => {
    const q = raw.trim()
    if ((!q && !file) || pending != null) return
    if (view) onShowChat()
    onSent(q || file!.name)
    setStream(null)
    setInput('')
    setMsgs((list) => [...list, { id: uid(), role: 'user', text: q, file: file?.name }])
    setPending({ q, file: file ? readAttachment(file) : undefined })
    setFile(null)
  }

  /** Раздел по кнопке или ссылке: в переписке — как будто попросили, а Vi отвечает самим разделом. */
  const show = (widget: ViWidget, label: string) => {
    if (pending != null) return
    setMode('chat')
    setPlus(false)
    if (view) onShowChat()
    onSent(label)
    setStream(null)
    setMsgs((list) => [...list, { id: uid(), role: 'user', text: label }])
    setPending({ q: label, widget })
  }

  // небольшая пауза «думаю» — так ответ не выглядит заготовкой
  // приложили файл — ответ ждёт ещё и его разбора
  useEffect(() => {
    if (pending == null) return
    let live = true
    const t = window.setTimeout(async () => {
      const seen = await pending.file
      if (!live) return
      const m = reply(pending.q, pending.widget, seen)
      setMsgs((list) => [...list, m])
      setPending(null)
      setStream({ id: m.id, len: 0 })
    }, 650 + Math.random() * 450)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [pending]) // eslint-disable-line react-hooks/exhaustive-deps

  // ответ печатается по нескольку букв за кадр
  useEffect(() => {
    if (!stream) return
    const m = msgs.find((x) => x.id === stream.id)
    if (!m || stream.len >= m.text.length) { setStream(null); return }
    const t = window.setTimeout(() => setStream({ id: stream.id, len: stream.len + 3 }), 16)
    return () => clearTimeout(t)
  }, [stream, msgs])

  /** Голосовой режим: ответ показывает сам, а в переписку кладём оба сообщения сразу. */
  const ask = (q: string): ViMsg => {
    onSent(q)
    const m = reply(q)
    setMsgs((list) => [...list, { id: uid(), role: 'user', text: q }, m])
    return m
  }

  const run = (a: ViAction, msgId: string): string | void => {
    if (a.undo) {
      onRemove(a.undo)
      const text = 'Хорошо, убрал это из прогноза.'
      setMsgs((list) => [
        ...list.map((m) => (m.id === msgId ? { ...m, actions: m.actions?.filter((x) => !x.undo) } : m)),
        { id: uid(), role: 'vi', text },
      ])
      return text
    }
    if (a.ask) { setMode('chat'); return send(a.ask) }
    if (a.sheet) return onSheet(a.sheet)
    if (a.widget) show(a.widget, a.label)
  }

  // ссылки в карточках справа: показываем раздел один раз на каждую новую команду
  const handled = useRef(command?.n ?? 0)
  useEffect(() => {
    if (!command || command.n === handled.current) return
    handled.current = command.n
    show(command.widget, command.label)
  }, [command]) // eslint-disable-line react-hooks/exhaustive-deps

  // раздел открываем с начала, переписку — с последнего сообщения
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = view ? 0 : el.scrollHeight
  }, [page, view == null]) // eslint-disable-line react-hooks/exhaustive-deps
  // пришёл раздел — показываем его с начала, а не прокручиваем в самый низ
  useEffect(() => {
    const el = scroller.current
    if (!el || view) return
    const last = msgs[msgs.length - 1]
    if (last?.widget && !stream && pending == null) el.querySelector(`[data-msg="${last.id}"]`)?.scrollIntoView({ block: 'start' })
    else el.scrollTop = el.scrollHeight
  }, [msgs, stream, pending, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // поле растёт вместе с текстом, но не выше пяти строк
  useEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden'
    look()
  }, [input, mode])

  const live = new Set(ev.actions.map((a) => a.id))
  const last = [...msgs].reverse().find((m) => m.role === 'vi' && m.steps)?.id
  // кнопки-подсказки — только у последнего ответа, пока человек ничего не отправил после него
  const tail = pending == null ? msgs[msgs.length - 1]?.id : undefined
  const mood: Mood = pending != null ? 'thinking' : stream ? 'happy' : 'idle'

  if (mode === 'voice') {
    return (
      <section className="center">
        {bar}
        <div className="vi-voice">
          <button className="icon-btn vi-voice-close" onClick={() => setMode('chat')} aria-label="Вернуться к переписке" title="Вернуться к переписке">
            <Icon name="cross" size={22} />
          </button>
          <VoiceAssistant ask={ask} onAction={run} />
        </div>
      </section>
    )
  }

  return (
    <section className="center">
      {bar}
      <div className="center-scroll" ref={scroller}>
        {view ? (
          <div className="center-page content" key={page}>{view}</div>
        ) : (
          <div className="vi-thread" aria-live="polite">
            {msgs.length === 0 && pending == null ? (
              // новый чат начинается с ответа на главный вопрос — хватит ли денег; подсказки — что делать дальше
              <div className="vi-welcome">
                <p className="vi-hello">{greeting()}! Я&nbsp;Vi</p>
                <h2 className="vi-verdict"><span className={`tone-dot ${ev.status.tone}`} />{ev.status.title}</h2>
                <p className="vi-verdict-sub">{ev.status.sub}</p>
                <div className="vi-suggest">
                  {viSuggestions(ev).map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            ) : msgs.map((m) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="vi-msg user">
                    {m.file && <span className="vi-msg-file"><Icon name="clip" size={15} /> {m.file}</span>}
                    {m.text}
                  </div>
                )
              }
              const typing = stream?.id === m.id
              return (
                <div key={m.id} className="vi-msg vi" data-msg={m.id}>
                  <div className="vi-msg-body">
                    <p>{typing ? m.text.slice(0, stream.len) : m.text}{typing && <span className="vi-cursor" />}</p>
                    {!typing && m.widget && <div className="vi-widget">{renderWidget(m.widget)}</div>}
                    {!typing && m.bills && m.bills.length > 0 && <MiniBills bills={m.bills} />}
                    {!typing && m.steps && (
                      <div className="vi-steps">
                        {m.steps.map((s, i) => {
                          const on = applied.has(s.id)
                          return (
                            <button key={s.id} className={`vi-step ${on ? 'on' : ''}`} onClick={() => onToggle(s.id)} disabled={!live.has(s.id)} aria-pressed={on}>
                              <span className="step-check">{on ? <Icon name="check" size={16} stroke={2.4} /> : i + 1}</span>
                              <span className="vi-step-text"><b>{s.title}</b><small>{s.detail}</small></span>
                            </button>
                          )
                        })}
                        {m.id === last && m.steps.some((s) => applied.has(s.id)) && (
                          <p className="vi-steps-now"><span className={`tone-dot ${ev.status.tone}`} />{ev.status.title}</p>
                        )}
                      </div>
                    )}
                    {!typing && m.id === tail && m.actions && m.actions.length > 0 && (
                      <div className="vi-actions">
                        {m.actions.map((a) => (
                          <button key={a.label} className={a.ask ? 'ask' : ''} onClick={() => run(a, m.id)}>
                            {a.label}{a.widget && <Icon name="arrow" size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {pending != null && (
              <div className="vi-msg vi">
                <span className="dots" aria-label="Vi думает"><i /><i /><i /></span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="vi-dockbar">
        <ViBot ev={ev} mood={mood} gaze={gaze} />
        {/* одна строка: «+» слева, текст, справа микрофон — или «отправить», когда что-то написано */}
        <form className="vi-composer" onSubmit={(e) => { e.preventDefault(); send(input) }}>
          {/* приложенный файл — над текстом; отправится вместе с сообщением */}
          {file && (
            <div className="vi-attach">
              <span className="vi-file">
                <Icon name="clip" size={15} />
                <span className="vi-file-name">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} aria-label="Убрать файл" title="Убрать файл"><Icon name="cross" size={14} stroke={2} /></button>
              </span>
            </div>
          )}
          <div className="vi-plus" ref={plusBox}>
            <button type="button" className={`vi-tool ${plus ? 'on' : ''}`} onClick={() => setPlus(!plus)} aria-label="Добавить" aria-expanded={plus} aria-haspopup="menu">
              <Icon name="plus" size={22} />
            </button>
            {plus && (
              <PlusMenu
                tools={TOOLS}
                onAttach={() => { setPlus(false); picker.current?.click() }}
                onSheet={(s) => { setPlus(false); onSheet(s) }}
                onShow={show}
              />
            )}
            <input
              ref={picker} type="file" accept="image/*,.txt" hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setFile(f)
                e.target.value = ''
                field.current?.focus()
              }}
            />
          </div>
          <textarea
            ref={field} rows={1} value={input} autoFocus={roomy}
            placeholder={file ? 'Подпись, например «оплатить 30-го»' : roomy ? 'Спросите Vi или запишите платёж' : 'Спросите Vi'} aria-label="Сообщение для Vi"
            onChange={(e) => setInput(e.target.value)}
            onFocus={look} onSelect={look} onScroll={look} onBlur={() => { gaze.current = null }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
            }}
          />
          {input.trim() || file ? (
            <button type="submit" className="vi-send" disabled={pending != null} aria-label="Отправить"><Icon name="up" size={18} stroke={2.2} /></button>
          ) : (
            <button type="button" className="vi-tool" onClick={() => setMode('voice')} aria-label="Сказать голосом" title="Сказать голосом"><Icon name="mic" size={22} /></button>
          )}
        </form>
      </div>
    </section>
  )
}
