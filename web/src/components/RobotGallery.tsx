import { useRef, useState } from 'react'
import { fidgetOdds, type Fidget } from '../lib/fidgets'
import { usePokes } from '../lib/usePokes'
import { Robot, type RobotLook } from './Robot'

/** Вариант внешности: что изменено и подпись. Чего не задали — как у нынешнего Vi. */
type Variant = RobotLook & { name: string; note: string }

const ORIGINAL: Variant = { name: 'Как сейчас', note: 'Голова 160×150, уши-палочки, короткая антенна, глаза-капсулы' }

const SHAPES: Variant[] = [
  ORIGINAL,
  { name: 'Без ушей', note: 'Всё как сейчас, только без ушей', ears: 'none' },
  { name: 'Антенна длиннее', note: 'Антенна в два раза выше, лампочка крупнее', antennaLen: 36, bulb: 10 },
  { name: 'Без антенны', note: 'Ни антенны, ни лампочки', antenna: 'none' },
  { name: 'Две антенны', note: 'Как у жучка — по краям макушки', antenna: 'double', antennaLen: 22, bulb: 7 },
  { name: 'Антенна сбоку', note: 'Сдвинута вправо и наклонена', antenna: 'side', antennaLen: 26 },
  { name: 'Приплюснутый', note: 'Шире и ниже: 180×120', w: 180, h: 120, r: 42, bezel: [16, 16, 20], eyeH: 40, earH: 36 },
  { name: 'Вытянутый', note: 'Уже и выше: 136×172', w: 136, h: 172, r: 42, gap: 42, eyeW: 20 },
  { name: 'Круглый', note: 'Голова-шар 160×160', w: 160, h: 160, r: 80, bezel: [16, 18, 22], screenR: 64, eyeH: 46 },
  { name: 'Квадратнее', note: 'Углы почти острые: скругление 22 вместо 46', r: 22, screenR: 12 },
  { name: 'Трапеция', note: 'Верх уже низа — устойчивый, как ведёрко', taper: 26, w: 172, r: 34, screenR: 24 },
  { name: 'Уши-кнопки', note: 'Круглые кнопки вместо палочек', ears: 'knob' },
  { name: 'Наушники', note: 'Большие амбушюры и дуга через макушку', ears: 'phones' },
  { name: 'Круглые глаза', note: 'Глаза-кружки вместо капсул', eyes: 'round', eyeW: 32 },
  { name: 'Глаза-точки', note: 'Маленькие точки — спокойнее, строже', eyes: 'dot', eyeW: 16, gap: 44 },
  { name: 'Визор', note: 'Одна светящаяся полоса вместо двух глаз', eyes: 'visor', eyeW: 26, eyeH: 24 },
  { name: 'Детское лицо', note: 'Глаза ниже, крупнее и шире расставлены', eyeDy: 8, gap: 58, eyeW: 26, eyeH: 44 },
  { name: 'Экран во всю голову', note: 'Тонкая рамка вокруг экрана', bezel: [8, 9, 11], screenR: 38 },
  { name: 'Светлый корпус', note: 'Белый пластик, тёмный экран', body: ['#fdfdfb', '#d8d8d3'], trim: '#c4c4bf', screen: '#141416' },
  { name: 'Румянец и улыбка', note: 'Розовые щёчки и улыбка под глазами', cheeks: true, eyeH: 44, eyeDy: -4 },
]

// исходный Vi с одной небольшой правкой — чтобы подобрать пропорции точно
const TWEAKS: Variant[] = [
  ORIGINAL,
  { name: 'Экран чуть больше', note: 'Рамка вокруг экрана тоньше на 4', bezel: [12, 14, 21], screenR: 35 },
  { name: 'Экран заметно больше', note: 'Рамка тоньше на 6–8', bezel: [10, 11, 17], screenR: 37 },
  { name: 'Экран чуть меньше', note: 'Рамка толще на 4', bezel: [20, 22, 30], screenR: 28 },
  { name: 'Экран чуть выше', note: 'Сверху рамка тоньше, снизу толще — лицо выше', bezel: [16, 13, 31] },
  { name: 'Уши чуть больше', note: 'Выше и толще: 18×52 вместо 16×44', earW: 18, earH: 52 },
  { name: 'Уши заметно больше', note: '20×60 и торчат сильнее', earW: 20, earH: 60, earOut: 13 },
  { name: 'Уши чуть меньше', note: '14×34 вместо 16×44', earW: 14, earH: 34 },
  { name: 'Уши торчат сильнее', note: 'Тот же размер, но на 4 дальше от головы', earOut: 14 },
  { name: 'Антенна чуть выше', note: '24 вместо 18', antennaLen: 24 },
  { name: 'Антенна чуть ниже', note: '12 вместо 18', antennaLen: 12 },
  { name: 'Лампочка чуть больше', note: 'Радиус 10 вместо 8', bulb: 10 },
  { name: 'Антенна чуть толще', note: 'Толщина 7 вместо 5', antennaW: 7 },
  { name: 'Голова чуть шире', note: '172×150 вместо 160×150', w: 172 },
  { name: 'Голова чуть уже', note: '150×150 вместо 160×150', w: 150, gap: 46 },
  { name: 'Голова чуть ниже', note: '160×140 вместо 160×150', h: 140, bezel: [16, 17, 23] },
  { name: 'Голова чуть выше', note: '160×160 вместо 160×150', h: 160, bezel: [16, 19, 29] },
  { name: 'Углы чуть круглее', note: 'Скругление 54 вместо 46', r: 54, screenR: 38 },
  { name: 'Углы чуть острее', note: 'Скругление 38 вместо 46', r: 38, screenR: 26 },
  { name: 'Глаза чуть больше', note: '25×58 вместо 22×52', eyeW: 25, eyeH: 58 },
  { name: 'Глаза чуть меньше', note: '19×46 вместо 22×52', eyeW: 19, eyeH: 46 },
  { name: 'Глаза чуть ближе', note: 'Между центрами 42 вместо 48', gap: 42 },
  { name: 'Глаза чуть дальше', note: 'Между центрами 54 вместо 48', gap: 54 },
  { name: 'Глаза чуть выше', note: 'На 6 выше середины экрана', eyeDy: -6 },
  { name: 'Глаза чуть ниже', note: 'На 6 ниже середины экрана', eyeDy: 6 },
]

// выходки от скуки: сами выпадают, когда ничего не происходит; здесь — ещё и по кнопке
const FIDGET_LIST: { kind: Fidget; name: string; note: string }[] = [
  { kind: 'wink', name: 'Подмигивает', note: 'Смотрит на вас, подмигивает и чуть краснеет' },
  { kind: 'hum', name: 'Напевает', note: 'Жмурится, качается в такт, вылетают ноты' },
  { kind: 'hiccup', name: 'Икает', note: 'Три «ик!» с пузырьком — и неловко отводит глаза' },
  { kind: 'doze', name: 'Клюёт носом', note: 'Засыпает с «Z-z-z», вздрагивает и озирается. Чем дольше скучно, тем чаще' },
  { kind: 'sneeze', name: 'Чихает', note: '«А… а…» — и чихает искрами' },
  { kind: 'fly', name: 'Муха', note: 'Следит за мухой, она садится на лампочку — косит глаза и стряхивает её' },
  { kind: 'glitch', name: 'Перезагрузка', note: 'Глючит, гаснет, грузится полоской и включается заново' },
]

const SECTIONS = [
  { title: 'Разные формы', note: 'У каждого изменена одна заметная деталь.', looks: SHAPES },
  { title: 'Мелкие правки исходного', note: 'Тот же Vi, одна деталь чуть больше или меньше. Первый — как сейчас, для сравнения.', looks: TWEAKS },
]

/** Один вариант: тот же Robot, что над строкой ввода, — толкается, злится, оглушается, его можно погладить. */
function Bot({ look, fidget }: { look: Variant; fidget?: { kind: Fidget; n: number } }) {
  const level = useRef(0)
  const { push, dizzy, pet, handlers } = usePokes()
  return (
    <button className="rg-bot" {...handlers} aria-label={`Вариант «${look.name}» — толкнуть`}>
      <Robot mood={dizzy ? 'dizzy' : 'idle'} level={level} stand push={push} onPet={pet} fidget={fidget} look={look} />
    </button>
  )
}

/** Выходка от скуки: робот, подпись, как часто выпадает, и кнопка — показать ещё раз. */
function FidgetItem({ kind, name, note }: (typeof FIDGET_LIST)[number]) {
  const [fidget, setFidget] = useState({ kind, n: 0 })
  return (
    <figure className="rg-item">
      <div className="rg-stage"><Bot look={ORIGINAL} fidget={fidget} /></div>
      <div className="rg-bar" />
      <figcaption className="rg-cap">
        <b>{name} <small>{Math.round(fidgetOdds(kind) * 100)}%</small></b>
        <span>{note}</span>
        <button className="rg-play" onClick={() => setFidget((f) => ({ kind, n: f.n + 1 }))}>Показать</button>
      </figcaption>
    </figure>
  )
}

/**
 * Тестовая страница: варианты внешности Vi рядом — сначала разные формы, потом мелкие правки исходного.
 * У каждого изменена одна деталь — так видно, что именно поменять. Все следят за курсором,
 * по клику толкаются, а если плавно поводить по голове — их можно погладить.
 */
export function RobotGallery() {
  return (
    <main className="rg">
      <header className="rg-head">
        <div>
          <h1>Варианты Vi</h1>
          <p>Варианты внешности рядом: каждый подписан, что в нём изменено. Все следят за курсором; нажмите на робота — толкнёте, плавно поводите курсором по голове — погладите.</p>
        </div>
        <a href="/">← К приложению</a>
      </header>
      <section className="rg-section">
        <h2>Когда скучно</h2>
        <p>Если секунд десять ничего не происходит, Vi что-нибудь выкидывает, потом раз в 15–30 секунд. Процент — как часто выпадает именно эта выходка.</p>
        <div className="rg-grid">
          {FIDGET_LIST.map((f) => <FidgetItem key={f.kind} {...f} />)}
        </div>
      </section>
      {SECTIONS.map((sec, k) => {
        // нумерация сквозная — чтобы назвать вариант одним числом
        const from = SECTIONS.slice(0, k).reduce((n, x) => n + x.looks.length, 0)
        return (
          <section key={sec.title} className="rg-section">
            <h2>{sec.title}</h2>
            <p>{sec.note}</p>
            <div className="rg-grid">
              {sec.looks.map((l, i) => (
                <figure key={l.name} className="rg-item">
                  <div className="rg-stage"><Bot look={l} /></div>
                  <div className="rg-bar" />
                  <figcaption className="rg-cap">
                    <b>{from + i + 1}. {l.name}</b>
                    <span>{l.note}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )
      })}
    </main>
  )
}
