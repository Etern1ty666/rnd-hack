import { useEffect, useRef, useState } from 'react'
import { FIDGETS, fidgetOdds, type Fidget } from '../lib/fidgets'
import { FIDGET_LIST, type Variant } from '../lib/robotVariants'
import { usePokes } from '../lib/usePokes'
import { Robot, type Mood } from './Robot'

type Point = { x: number; y: number; at: number }
/** Шаг круга: через сколько мс от начала круга и что сделать. */
type Step = [number, () => void]

/** Повторяет круг длиной ms; все шаги — раньше конца круга. Возвращает «остановить». */
function loop(ms: number, steps: Step[]) {
  let timers: number[] = []
  const lap = () => {
    timers = steps.map(([at, f]) => window.setTimeout(f, at))
    timers.push(window.setTimeout(lap, ms))
  }
  lap()
  return () => timers.forEach(clearTimeout)
}

/** Каждый кадр, с мс от начала: для того, что движется плавно, — мышь, ладонь, голос. */
function useFrame(cb: (ms: number) => void) {
  const ref = useRef(cb)
  useEffect(() => { ref.current = cb })
  useEffect(() => {
    let raf = 0
    let t0 = -1
    const tick = (t: number) => {
      if (t0 < 0) t0 = t
      ref.current(t - t0)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

const NONE: Step[] = []

/** Толчки по кругу: [когда, куда (1 — вправо), который удар подряд]; more — что ещё сделать за круг. Всё — константы. */
function usePushes(ms: number, hits: [number, number, number][], more = NONE) {
  const [push, setPush] = useState({ n: 0, dir: 1, hits: 1 })
  useEffect(() => loop(ms, [
    ...hits.map(([at, dir, n]): Step => [at, () => setPush((p) => ({ n: p.n + 1, dir, hits: n }))]),
    ...more,
  ]), [ms, hits, more])
  return push
}

/** Ячейка: робот на полоске, как на строке ввода, и подпись. */
function Cell({ name, note, bar, children }: { name: React.ReactNode; note: string; bar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="rg-item">
      <div className="rg-stage">{children}</div>
      <div className={bar ? 'rg-bar ra-bar' : 'rg-bar'}>{bar}</div>
      <figcaption className="rg-cap">
        <b>{name}</b>
        <span>{note}</span>
      </figcaption>
    </figure>
  )
}

type BotProps = Omit<React.ComponentProps<typeof Robot>, 'mood' | 'level' | 'stand' | 'puppet'> & {
  mood?: Mood
  level?: React.RefObject<number>
  box?: React.Ref<HTMLDivElement>
  className?: string
  children?: React.ReactNode
}

/** Робот-кукла: мышь не замечает, сам ничего не выкидывает — только то, что показывает ячейка. */
function Puppet({ mood = 'idle', level, box, className = '', children, ...rest }: BotProps) {
  const silent = useRef(0)
  return (
    <div ref={box} className={`rg-bot ra-bot ${className}`}>
      <Robot mood={mood} level={level ?? silent} stand puppet {...rest} />
      {children}
    </div>
  )
}

/** Куда нажали: кружок сбоку головы — с той стороны, откуда толкнули. */
function Tap({ dir }: { dir: number }) {
  return <span className="ra-tap" style={{ left: dir > 0 ? '24%' : '76%' }} />
}

const CURSOR = 'M0 0V21L5.4 16.2L9 24L12.6 22.4L9.1 14.8H16.4Z'

type Demo = { look: Variant }

// ——— сам по себе ———

function Live({ look }: Demo) {
  const level = useRef(0)
  const { push, dizzy, pet, handlers } = usePokes()
  return (
    <Cell name="Живой" note="Как в приложении: следит за мышью, толкается, гладится, а если оставить в покое — сам что-нибудь выкинет.">
      <button className="rg-bot" {...handlers} aria-label="Толкнуть">
        <Robot mood={dizzy ? 'dizzy' : 'idle'} level={level} stand push={push} onPet={pet} look={look} />
      </button>
    </Cell>
  )
}

function Idle({ look }: Demo) {
  return (
    <Cell name="Спокоен" note="Дышит, моргает (иногда дважды подряд) и поглядывает по сторонам.">
      <Puppet look={look} />
    </Cell>
  )
}

const TONES = [
  { tone: 'ok', text: 'Денег хватает' },
  { tone: 'risk', text: 'Может не хватить' },
  { tone: 'short', text: 'Не хватит' },
]

function Tone({ look }: Demo) {
  const [k, setK] = useState(0)
  useEffect(() => loop(TONES.length * 2500, TONES.map((_, i): Step => [i * 2500, () => setK(i)])), [])
  const { tone, text } = TONES[k]
  return (
    <Cell name="Лампочка — статус" note="Горит цветом бизнеса: зелёный — хватает, жёлтый — риск, красный — разрыв, и тогда мигает." bar={<><i className={`tone-dot ${tone}`} />{text}</>}>
      <Puppet look={look} className={`ra-tone-${tone}`} />
    </Cell>
  )
}

function Listening({ look }: Demo) {
  const level = useRef(0)
  useFrame((ms) => {
    // говорят фразами: слоги по ~0,2 с, между фразами пауза
    const f = ms % 3400
    level.current = f < 2500 ? Math.abs(Math.sin(f / 70)) * (0.6 + 0.4 * Math.sin(f / 380)) : 0
  })
  return (
    <Cell name="Слушает" note="Голосовой режим: наклонился к человеку, глаза подпрыгивают в такт голосу, лампочка мигает красным.">
      <Puppet look={look} mood="listening" level={level} />
    </Cell>
  )
}

function Thinking({ look }: Demo) {
  return (
    <Cell name="Думает" note="Глаза перебегают и замирают, голова склонена, от жёлтой лампочки расходятся волны.">
      <Puppet look={look} mood="thinking" />
    </Cell>
  )
}

function Answering({ look }: Demo) {
  const [mood, setMood] = useState<Mood>('idle')
  useEffect(() => loop(5000, [[1200, () => setMood('happy')], [3800, () => setMood('idle')]]), [])
  return (
    <Cell name="Отвечает" note="Обрадовался — подпрыгивает и улыбается «^ ^». Выражение меняется через моргание.">
      <Puppet look={look} mood={mood} />
    </Cell>
  )
}

function Mouse({ look }: Demo) {
  const box = useRef<HTMLDivElement>(null)
  const cursor = useRef<SVGSVGElement>(null)
  const pointer = useRef<Point | null>(null)
  useFrame((ms) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !cursor.current) return
    // восьмёрка над головой и по бокам
    const a = (ms / 3400) * Math.PI * 2
    const dx = Math.sin(a) * r.width * 0.64
    const dy = r.width * (-0.24 + 0.2 * Math.sin(2 * a))
    cursor.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
    // ячейка тесная: смещение растягиваем — направление то же, а глаза уходят до упора, как за мышью вдалеке
    pointer.current = { x: r.left + r.width / 2 + dx * 4, y: r.top + r.height * 0.45 + dy * 4, at: performance.now() }
  })
  return (
    <Cell name="Следит за мышью" note="Глаза ведут за курсором, экран чуть поворачивается вслед, уши — навстречу.">
      <Puppet look={look} box={box} pointer={pointer}>
        <svg ref={cursor} className="ra-cursor" viewBox="-2 -2 21 29" aria-hidden><path d={CURSOR} /></svg>
      </Puppet>
    </Cell>
  )
}

const PHRASE = 'Хватит на зарплату?'

function Typing({ look }: Demo) {
  const [n, setN] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLElement>(null)
  const gaze = useRef<Point | null>(null)
  const typedAt = useRef(0)
  useEffect(() => { typedAt.current = performance.now() }, [n])
  // печатает по букве, ждёт, стирает
  useEffect(() => loop(7500, [...[...PHRASE].map((_, i): Step => [600 + i * 110, () => setN(i + 1)]), [6400, () => setN(0)]]), [])
  useFrame(() => {
    const c = caret.current?.getBoundingClientRect()
    const b = box.current?.getBoundingClientRect()
    if (!c || !b) return
    // в приложении строка широкая и Vi сидит справа, тут — узкая: растягиваем вбок, чтобы тянулся так же
    const cx = b.left + b.width / 2
    gaze.current = { x: cx + (c.left - cx) * 3, y: c.top + c.height / 2, at: typedAt.current }
  })
  return (
    <Cell name="Следит за текстом" note="Пока пишут: смотрит на курсор в строке и тянется к тексту. Затихли — выпрямляется, но следит." bar={<><span>{PHRASE.slice(0, n)}</span><i ref={caret} className="ra-caret" /></>}>
      <Puppet look={look} box={box} gaze={gaze} />
    </Cell>
  )
}

// ——— толчки и поглаживания ———

const ONE: [number, number, number][] = [[400, 1, 1], [2000, -1, 1]]

function Push({ look }: Demo) {
  const push = usePushes(3200, ONE)
  return (
    <Cell name="Толчок" note="Зажмуривается «> <», подлетает и плюхается как желе, антенна пружинит, косится на толкнувшего.">
      <Puppet look={look} push={push}>{push.n > 0 && <Tap key={push.n} dir={push.dir} />}</Puppet>
    </Cell>
  )
}

const ANGRY: [number, number, number][] = [1, 2, 3, 4].map((h, i) => [300 + i * 420, 1, h])

function Angry({ look }: Demo) {
  const push = usePushes(6500, ANGRY)
  return (
    <Cell name="Злится" note="Толкают подряд: со второго хмурится, с третьего — «💢» и красная лампочка, на четвёртом кипит. Перестали — остывает.">
      <Puppet look={look} push={push}>{push.n > 0 && <Tap key={push.n} dir={push.dir} />}</Puppet>
    </Cell>
  )
}

const DIZZY_HITS: [number, number, number][] = [1, 2, 3, 4, 5].map((h, i) => [300 + i * 330, 1, h])
const KNOCKOUT = 300 + 4 * 330

function Dizzy({ look }: Demo) {
  const [dizzy, setDizzy] = useState(false)
  const [more] = useState<Step[]>(() => [[KNOCKOUT, () => setDizzy(true)], [KNOCKOUT + 3600, () => setDizzy(false)]])
  const push = usePushes(7600, DIZZY_HITS, more)
  return (
    <Cell name="Оглушён" note="Пятый толчок за пару секунд: глаза-спирали, лампочка красная. Через несколько секунд приходит в себя.">
      <Puppet look={look} mood={dizzy ? 'dizzy' : 'idle'} push={push}>{push.n > 0 && <Tap key={push.n} dir={push.dir} />}</Puppet>
    </Cell>
  )
}

function Pet({ look }: Demo) {
  const hand = useRef<number | null>(null)
  useFrame((ms) => {
    // шесть секунд гладят туда-сюда, потом отпускают — он ещё чуть жмурится и успокаивается
    const f = ms % 10000
    hand.current = f < 6000 ? 0.7 * Math.sin((f / 850) * Math.PI * 2) : null
  })
  return (
    <Cell name="Гладят" note="Жмурится «^ ^», ластится к руке, антенна гнётся под ладонью, мурчит и пускает сердечки.">
      <Puppet look={look} hand={hand} />
    </Cell>
  )
}

// ——— когда скучно ———

function Bored({ look, kind, name, note }: Demo & { kind: Fidget; name: string; note: string }) {
  const [fidget, setFidget] = useState({ kind, n: 0 })
  useEffect(() => loop(FIDGETS[kind].ms + 1400, [[400, () => setFidget((f) => ({ kind, n: f.n + 1 }))]]), [kind])
  return (
    <Cell name={<>{name} <small>{Math.round(fidgetOdds(kind) * 100)}%</small></>} note={note}>
      <Puppet look={look} fidget={fidget} />
    </Cell>
  )
}

const SECTIONS: { title: string; note: string; demos: ((p: Demo) => React.ReactNode)[] }[] = [
  { title: 'Сам по себе', note: 'Состояния из приложения. Первый — живой, его можно трогать; остальные мышь не замечают.', demos: [Live, Idle, Tone, Listening, Thinking, Answering, Mouse, Typing] },
  { title: 'Толчки и поглаживания', note: 'Кружок — куда нажали, стрелка — курсор, которым гладят.', demos: [Push, Angry, Dizzy, Pet] },
]

/**
 * Страница одного варианта (/robots.html?v=N): все анимации Vi сразу, каждая в своей ячейке и по кругу —
 * состояния, толчки, злость, оглушение, поглаживание и выходки от скуки.
 */
export function RobotAnimations({ look }: { look: Variant }) {
  useEffect(() => { document.title = `Vi — ${look.name}` }, [look])
  return (
    <main className="rg">
      <header className="rg-head">
        <div>
          <h1>{look.name}</h1>
          <p>{look.note}. Все анимации сразу — каждая крутится по кругу.</p>
        </div>
        <a href={location.pathname}>← Все варианты</a>
      </header>
      {SECTIONS.map((sec) => (
        <section key={sec.title} className="rg-section">
          <h2>{sec.title}</h2>
          <p>{sec.note}</p>
          <div className="rg-grid">
            {sec.demos.map((D, i) => <D key={i} look={look} />)}
          </div>
        </section>
      ))}
      <section className="rg-section">
        <h2>Когда скучно</h2>
        <p>В приложении выпадают сами, когда ничего не происходит; здесь — все сразу и по кругу. Процент — как часто выпадает именно эта.</p>
        <div className="rg-grid">
          {FIDGET_LIST.map((f) => <Bored key={f.kind} look={look} {...f} />)}
        </div>
      </section>
    </main>
  )
}
