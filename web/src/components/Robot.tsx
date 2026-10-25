import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FIDGETS, pickFidget, type Beat, type Bit, type Fidget, type Pose } from '../lib/fidgets'

export type Mood = 'idle' | 'listening' | 'thinking' | 'happy' | 'dizzy'
type Shape = 'open' | 'happy' | 'dizzy' | 'ouch'
const shapeOf = (m: Mood): Shape => (m === 'happy' ? 'happy' : m === 'dizzy' ? 'dizzy' : 'open')

/** Внешность: всё, чем варианты на /robots.html отличаются от нынешнего Vi. Чего не задали — как у Vi. */
export interface RobotLook {
  /** голова: ширина, высота, скругление углов; низ всегда на строке ввода, по центру */
  w?: number
  h?: number
  r?: number
  /** на сколько верх уже низа с каждой стороны — трапеция */
  taper?: number
  /** рамка экрана: сбоку, сверху, снизу; и скругление экрана */
  bezel?: [number, number, number]
  screenR?: number
  ears?: 'bar' | 'none' | 'knob' | 'phones'
  /** уши: ширина, высота и на сколько торчат за край головы */
  earW?: number
  earH?: number
  earOut?: number
  antenna?: 'single' | 'none' | 'double' | 'side'
  antennaLen?: number
  antennaW?: number
  bulb?: number
  eyes?: 'capsule' | 'round' | 'dot' | 'visor'
  eyeW?: number
  eyeH?: number
  /** расстояние между центрами глаз и сдвиг глаз вниз от середины экрана */
  gap?: number
  eyeDy?: number
  body?: [string, string]
  trim?: string
  screen?: string
  /** улыбка под глазами */
  smile?: boolean
}
type Look = Required<RobotLook>

const VI: Look = {
  w: 160, h: 150, r: 46, taper: 0, bezel: [16, 18, 26], screenR: 32,
  ears: 'bar', earW: 16, earH: 44, earOut: 10, antenna: 'single', antennaLen: 18, antennaW: 5, bulb: 8,
  eyes: 'capsule', eyeW: 22, eyeH: 52, gap: 48, eyeDy: 0,
  body: ['#3a3a3e', '#141416'], trim: '#2a2a2d', screen: '#09090a', smile: false,
}

interface Props {
  mood: Mood
  /** Громкость речи 0…1: пока человек говорит, глаза подпрыгивают в такт. */
  level: React.RefObject<number>
  /** Сидит на строке ввода: низ головы — ровно по нижнему краю рамки, без тени и без парения. */
  stand?: boolean
  /** Куда смотреть, пока человек пишет: точка на экране (курсор в поле ввода) и когда курсор последний раз двигался. */
  gaze?: React.RefObject<{ x: number; y: number; at: number } | null>
  /** Толчок: каждый новый n — удар; dir — куда толкнули (1 — вправо, −1 — влево); hits — который удар подряд. */
  push?: { n: number; dir: number; hits?: number }
  /** Начали гладить — успокаивается (тот, кто считает удары, сбрасывает злость и оглушение). */
  onPet?: () => void
  /** Выходка от скуки прямо сейчас, не дожидаясь тишины (на /robots.html): каждый новый n — заново. */
  fidget?: { kind: Fidget; n: number }
  look?: RobotLook
  /** Кукла (на /robots.html): настоящую мышь не замечает и сам выходки не выкидывает — двигается только по тому, что передали. */
  puppet?: boolean
  /** Ненастоящая мышь: точка на экране и когда она последний раз двигалась — смотрит на неё, как на мышь. */
  pointer?: React.RefObject<{ x: number; y: number; at: number } | null>
  /** Ненастоящая ладонь: где она по ширине головы (−1…1), null — убрали. Водят — гладят; рисуется курсором на макушке. */
  hand?: React.RefObject<number | null>
}

/** Пружина тянется к цели, перелетает и успокаивается: движения складываются, а не обрываются. */
interface Spring { x: number; v: number }
function spring(s: Spring, target: number, k: number, d: number, dt: number) {
  s.v += (k * (target - s.x) - d * s.v) * dt
  s.x += s.v * dt
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Глаза-спирали, когда оглушён. */
function spiral(cx: number, cy: number) {
  let d = ''
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 4
    const r = 2 + a * 1.55
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`
  }
  return d
}

/** Многоугольник со скруглёнными углами — для головы-трапеции. */
function roundedPoly(pts: [number, number][], r: number) {
  const n = pts.length
  const toward = (a: [number, number], b: [number, number]) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    const k = Math.min(r, d / 2) / d
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k].map((v) => v.toFixed(1)).join(' ')
  }
  let d = `M${toward(pts[0], pts[n - 1])}`
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    d += ` Q${p[0]} ${p[1]} ${toward(p, pts[(i + 1) % n])} L${toward(pts[(i + 1) % n], p)}`
  }
  return `${d}Z`
}

// низ головы — на строке; вокруг его середины он качается, как неваляшка
const BOTTOM = 188
const BLINK_MS = 170
const GRAVITY = 1500
// злость по номеру удара подряд: первый — только «ой», второй — хмурится, третий — «💢», четвёртый — кипит
const ANGER = [0, 0, 0.45, 0.75, 1]
// гладят — копится «удовольствие»: с какого уровня он понимает, что его гладят, и на каком — что перестали
const PET_ON = 0.9
const PET_OFF = 0.25
const HEART = 'M0 6C-8 0-7-7-3.5-7C-1.6-7-.4-5.8 0-4.6C.4-5.8 1.6-7 3.5-7C7-7 8 0 0 6Z'
// от скуки: сколько тишины считается «ничего не происходит» и сколько потом ждать выходку — в первый раз и между ними
const QUIET_MS = 3000
const FIRST_WAIT = [7000, 12000]
const NEXT_WAIT = [12000, 25000]
const NOTE = 'M2 4V-9h1.4c.3 3 4.6 3.6 4.4 8.2c-.8-2.6-2.4-3.6-4.4-3.8V4ZM-3.4 4a3.4 2.6 0 1 0 6.8 0a3.4 2.6 0 1 0-6.8 0Z'
/** Что вылетает на выходках: форма, цвета, размер и сколько живёт. */
const BITS: Record<Bit, { d: string; fill: string; stroke: string; w: number; k: number; ms: number }> = {
  z: { d: 'M-5-5.5H5L-5 5.5H5', fill: 'none', stroke: 'var(--ink-3)', w: 2.6, k: 1.5, ms: 1900 },
  note: { d: NOTE, fill: 'var(--ink-2)', stroke: 'none', w: 0, k: 1.5, ms: 1600 },
  bubble: { d: 'M-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z', fill: 'rgba(42, 120, 214, 0.1)', stroke: 'var(--blue)', w: 1.8, k: 1.3, ms: 1150 },
  spark: { d: 'M0-6L1.6-1.6L6 0L1.6 1.6L0 6L-1.6 1.6L-6 0L-1.6-1.6Z', fill: '#ffb300', stroke: 'none', w: 0, k: 1.2, ms: 650 },
}
const BIT_SLOTS = 8
const REST: Pose = {}

/** Где что стоит: всё считается от размеров головы. */
function geometry(L: Look) {
  const x0 = 110 - L.w / 2
  const y0 = BOTTOM - L.h
  const topHalf = L.w / 2 - L.taper
  const halfAt = (y: number) => topHalf + L.taper * ((y - y0) / L.h)
  const [bx, bt, bb] = L.bezel
  const sy0 = y0 + bt
  const sh = L.h - bt - bb
  const ey = sy0 + sh / 2 - 2 + L.eyeDy
  const eyeH = L.eyes === 'capsule' || L.eyes === 'visor' ? L.eyeH : L.eyeW
  const by = y0 + 2
  const antennas = L.antenna === 'none' ? []
    : L.antenna === 'double' ? [{ x: 110 - L.w * 0.2, rot: -20 }, { x: 110 + L.w * 0.2, rot: 20 }]
      : L.antenna === 'side' ? [{ x: 110 + L.w * 0.2, rot: 22 }]
        : [{ x: 110, rot: 0 }]
  return {
    x0, y0, topHalf, halfAt, bx, sy0, sh, ey, eyeH, by, antennas,
    eyeTop: ey - eyeH / 2,
    eyeX: [110 - L.gap / 2, 110 + L.gap / 2],
    earY: y0 + L.h * 0.52,
    bulbY: by - L.antennaLen - (L.bulb - 2),
    vein: [110 + halfAt(sy0) - bx - 16, sy0 + 16],
    halfFlat: L.w / 2 - L.r,
    barW: L.gap + L.eyeW + 16,
  }
}
type Geo = ReturnType<typeof geometry>

/**
 * Злые веки: верх глаз срезан клином, внутренний угол ниже — нахмурился. Это вырез (clip), а не накладка,
 * поэтому свечение повторяет злую форму глаз и нигде не видно краёв.
 */
const CLIP_BOX = 'M-60 -80H280V280H-60Z'
function brows(L: Look, G: Geo, depth: number) {
  if (depth < 0.5) return CLIP_BOX
  const hw = L.eyeW / 2 + 5
  const top = (G.eyeTop - 31).toFixed(1)
  const inner = (G.eyeTop - 4 + depth).toFixed(1)
  const outer = (G.eyeTop - 4 + depth * 0.15).toFixed(1)
  return G.eyeX.map((cx, k) => {
    const s = k ? 1 : -1
    return `M${cx + s * hw} ${top}H${cx - s * hw}V${inner}L${cx + s * hw} ${outer}Z`
  }).reduce((d, w) => `${d} ${w}`, CLIP_BOX)
}

/**
 * Робот-помощник: тёмное лицо-экран и два светящихся глаза-капсулы.
 * Всё движение — в одном кадре анимации, на пружинах, без перерисовки React: наклон, подскок,
 * сплющивание, болтающаяся антенна, взгляд, моргание. Поэтому переходы между состояниями
 * не рвутся, а толчки складываются. Выражение глаз меняется через моргание.
 * Толкнули — зажмуривается «> <», плюхается как желе, антенна пружинит, покачивается и косится на толкнувшего.
 * Толкают подряд — начинает злиться: веки хмурятся, на экране вспыхивает «💢», лампочка краснеет,
 * он упирается навстречу и чуть кипит. Ещё удар — оглушён (это решает тот, кто считает удары), лампочка горит красным.
 * Гладят — плавно водят курсором по голове: жмурится от удовольствия «^ ^», ластится к руке,
 * антенна гнётся под ладонью, чуть мурчит и пускает сердечки; злость проходит.
 * Ничего не происходит — время от времени что-нибудь выкидывает от скуки (lib/fidgets.ts): подмигивает,
 * напевает, икает, клюёт носом, чихает, ловит взглядом муху, перезагружается. Редкие выпадают реже.
 */
export function Robot({ mood, level, stand = false, gaze, push, onPet, fidget, look, puppet = false, pointer, hand }: Props) {
  const L = useMemo<Look>(() => ({ ...VI, ...look }), [look])
  const G = useMemo(() => geometry(L), [L])
  const spirals = useMemo(() => G.eyeX.map((cx) => spiral(cx, G.ey)), [G])
  const tilt = useRef<SVGGElement>(null)
  const ants = useRef<SVGGElement>(null)
  const ears = useRef<SVGGElement>(null)
  const screen = useRef<SVGGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const lids = useRef<SVGGElement>(null)
  const brow = useRef<SVGPathElement>(null)
  const vein = useRef<SVGGElement>(null)
  const hearts = useRef<SVGGElement>(null)
  const bar = useRef<SVGGElement>(null)
  const barFill = useRef<SVGRectElement>(null)
  const fly = useRef<SVGGElement>(null)
  const wings = useRef<SVGGElement>(null)
  const sprites = useRef<SVGGElement>(null)
  const palm = useRef<SVGGElement>(null)
  const moodRef = useRef(mood)
  useEffect(() => { moodRef.current = mood }, [mood])
  const pushRef = useRef(push)
  useEffect(() => { pushRef.current = push }, [push])
  const onPetRef = useRef(onPet)
  useEffect(() => { onPetRef.current = onPet }, [onPet])
  const fidgetRef = useRef(fidget)
  useEffect(() => { fidgetRef.current = fidget }, [fidget])
  // какие глаза нарисованы сейчас; меняет их только кадр анимации — в момент, когда веки закрыты
  const [shape, setShape] = useState<Shape>(() => shapeOf(mood))
  // роботов на странице бывает много — id градиентов не должны совпадать
  const uid = `robot${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    const rot: Spring = { x: 0, v: 0 }
    const shift: Spring = { x: 0, v: 0 }
    const squash: Spring = { x: 0, v: 0 }
    const ant: Spring = { x: 0, v: 0 }
    const veinPop: Spring = { x: 0, v: 0 }
    let y = 0, vy = 0
    let gx = 0, gy = 0, tx = 0, ty = 0
    let startle = 0, startleDir = 0
    // зажмурился от удара до этого момента; злость — от ударов подряд, остывает, когда перестали
    let ouchUntil = 0
    let anger = 0, angerTarget = 0, lastHitAt = -1e9, hitDir = 0
    // гладят: сколько «удовольствия» накопилось, где ладонь по ширине головы (−1…1) и куда едет
    let pet = 0, petting = false, petAmt = 0, petX = 0, petVx = 0
    let prevMove: { x: number; y: number; t: number } | null = null
    let prevHand: number | null = null
    const flying: ({ t0: number; x: number } | null)[] = [null, null, null]
    let nextHeart = 0
    // моргают вразнобой, даже когда роботов много
    let blinkAt = -1e9, nextBlink = last + 600 + Math.random() * 2000, nextGlance = 0
    let shown = shapeOf(moodRef.current), swapping = false
    let prevMood = moodRef.current
    let lastPush = pushRef.current?.n ?? 0
    let mouse: { x: number; y: number; at: number } | null = null
    // от скуки: тишина дольше wait — выходка; s — в какую сторону она в этот раз
    type Fid = { kind: Fidget; t0: number; s: number; beats: Beat[]; beat: number; forced: boolean }
    let fid: Fid | null = null
    let prevFid: Fidget | null = null
    let lastFidget = fidgetRef.current?.n ?? 0
    const between = ([a, b]: number[]) => a + Math.random() * (b - a)
    let stillFrom = last, idleFrom = last, wait = between(FIRST_WAIT), wasQuiet = true
    // куда садится муха — считается каждый кадр по антенне и наклону головы
    let perch: [number, number] = [110, G.y0]
    const bits: ({ kind: Bit; t0: number; x: number; y: number; dx: number; dy: number; size: number } | null)[] = Array(BIT_SLOTS).fill(null)
    const startFidget = (kind: Fidget, t: number, forced: boolean) => {
      const s = Math.random() < 0.5 ? -1 : 1
      fid = { kind, t0: t, s, beats: FIDGETS[kind].beats(s), beat: 0, forced }
      prevFid = kind
    }
    // «Z» и ноты — над макушкой сбоку, пузырьки — у края головы, искры — веером с лица
    const spawn = (kind: Bit, dir: number, size: number, i: number, n: number, t: number) => {
      const k = bits.findIndex((b) => !b)
      const el = sprites.current?.children[k] as SVGPathElement | undefined
      if (k < 0 || !el) return
      const B = BITS[kind]
      el.setAttribute('d', B.d)
      el.style.fill = B.fill
      el.style.stroke = B.stroke
      el.style.strokeWidth = String(B.w)
      const a = (i - (n - 1) / 2) * 0.5 - 0.3
      const r = 70 + Math.random() * 25
      const at = kind === 'z' ? { x: 110 + dir * L.w * 0.3, y: G.y0 - 4, dx: dir * 28, dy: -52 }
        : kind === 'note' ? { x: 110 + dir * L.w * 0.32, y: G.y0, dx: dir * 24, dy: -48 }
          : kind === 'bubble' ? { x: 110 + dir * L.w * 0.38, y: G.y0 + 14, dx: dir * 12, dy: -46 }
            : { x: 110 + dir * L.w * 0.18, y: G.ey + 16, dx: dir * Math.cos(a) * r, dy: Math.sin(a) * r }
      bits[k] = { kind, t0: t, size, ...at }
    }

    // провели по голове: d — сколько проехали, dx — из них вбок (в ширинах головы), x — где рука (−1…1)
    const stroke = (d: number, dx: number, dt: number, x: number) => {
      // скорость — в «головах в секунду»: у маленького и большого робота одинаково
      if (dt > 0 && dt < 0.2 && d / dt < 9) {
        pet = Math.min(1.8, pet + d * 0.6)
        petVx += (dx / dt - petVx) * 0.3
      }
      petX = x
    }

    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      mouse = { x: e.clientX, y: e.clientY, at: now }
      // гладят — это плавно водят по голове; быстрый проход мимо не считается
      const svg = tilt.current?.ownerSVGElement
      if (!svg) return
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const k = r.width / vb.width
      const left = r.left + (G.x0 - vb.x) * k
      const width = L.w * k
      const top = r.top + (G.y0 - vb.y) * k
      const bottom = r.top + (BOTTOM - vb.y) * k
      const inside = e.clientX > left - 4 && e.clientX < left + width + 4 && e.clientY > top - 12 && e.clientY < bottom
      if (inside && prevMove) {
        const d = Math.hypot(e.clientX - prevMove.x, e.clientY - prevMove.y)
        stroke(d / width, (e.clientX - prevMove.x) / width, (now - prevMove.t) / 1000, clamp((e.clientX - left - width / 2) / (width / 2), -1, 1))
      }
      prevMove = inside ? { x: e.clientX, y: e.clientY, t: now } : null
    }
    if (!puppet) window.addEventListener('pointermove', onMove)

    const frame = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000)
      last = t
      const m = moodRef.current
      const svg = tilt.current?.ownerSVGElement

      // толкнули: зажмурился, подлетел, сплющился как желе, антенна спружинила — и косится на толкнувшего
      const p = pushRef.current
      if (p && p.n !== lastPush) {
        lastPush = p.n
        if (!calm) {
          rot.v += p.dir * 170
          shift.v += p.dir * 70
          if (y === 0) vy = -130
          squash.v -= 4.5
          ant.v += p.dir * 420
        }
        ouchUntil = t + 380
        startle = 1
        startleDir = -p.dir
        hitDir = p.dir
        lastHitAt = t
        angerTarget = ANGER[Math.min(p.hits ?? 1, 4)]
        nextBlink = t + 1200
        pet = 0
        fid = null
      }

      // ненастоящая ладонь гладит так же, как курсор
      const h = hand?.current ?? null
      if (h !== null && prevHand !== null) stroke(Math.abs(h - prevHand) / 2, (h - prevHand) / 2, dt, h)
      prevHand = h
      palm.current?.setAttribute('opacity', h === null ? '0' : '1')
      if (h !== null) palm.current?.setAttribute('transform', `translate(${(110 + (h * L.w) / 2).toFixed(1)} ${G.y0 + 6})`)

      // гладят: накопилось — блаженствует; перестали — ещё чуть жмурится и отпускает
      pet = Math.max(0, pet - dt * 0.45)
      petVx *= Math.exp(-dt * 6)
      if (!petting && pet > PET_ON) {
        petting = true
        onPetRef.current?.()
      } else if (petting && pet < PET_OFF) petting = false
      petAmt += ((petting ? 1 : 0) - petAmt) * (1 - Math.exp(-dt * 5))

      // перестали толкать, оглушён или гладят — злость остывает
      if (t - lastHitAt > 2600 || m === 'dizzy' || petting) angerTarget = 0
      anger += (angerTarget - anger) * (1 - Math.exp(-dt * (angerTarget > anger ? 12 : m === 'dizzy' || petting ? 14 : 2.2)))
      // обрадовался — подпрыгивает
      if (m === 'happy' && prevMood !== 'happy' && y === 0 && vy === 0 && !calm) vy = -210
      prevMood = m

      // от скуки: ни мыши, ни текста, ни толчков, не гладят — время от времени что-нибудь выкидывает
      const caret = gaze?.current
      const ptr = pointer?.current ?? mouse
      const fp = fidgetRef.current
      if (fp && fp.n !== lastFidget) {
        lastFidget = fp.n
        if (!calm) startFidget(fp.kind, t, true)
      }
      const busy = (ptr && t - ptr.at < QUIET_MS) || (caret && caret.at > 0 && t - caret.at < QUIET_MS)
      const quiet = m === 'idle' && !petting && petAmt < 0.05 && anger < 0.05 && t - lastHitAt > QUIET_MS && !busy
      // заговорили или гладят — выходка обрывается
      if (fid && (m !== 'idle' || petting)) fid = null
      if (fid && t - fid.t0 >= FIDGETS[fid.kind].ms) {
        fid = null
        stillFrom = t
        wait = between(NEXT_WAIT)
      }
      if (!quiet) {
        if (wasQuiet) wait = between(FIRST_WAIT)
        stillFrom = t
        idleFrom = t
        // шевельнули мышью — обрывается; задремавший вздрагивает и просыпается
        if (fid && !fid.forced) {
          const { wake } = FIDGETS[fid.kind]
          const f = t - fid.t0
          if (wake && f > 600 && f < wake) {
            fid.t0 = t - wake
            while (fid.beat < fid.beats.length && fid.beats[fid.beat].at < wake) fid.beat++
          } else if (!wake || f < wake) fid = null
        }
      } else if (!fid && !calm && !puppet && t - stillFrom > wait) startFidget(pickFidget(prevFid, t - idleFrom), t, false)
      wasQuiet = quiet
      const P = fid ? FIDGETS[fid.kind].pose(t - fid.t0, { s: fid.s, perch, face: [110, G.ey] }) : REST
      if (fid) {
        const f = t - fid.t0
        for (; fid.beat < fid.beats.length && fid.beats[fid.beat].at <= f; fid.beat++) {
          const b = fid.beats[fid.beat]
          if (b.hop && y === 0) vy = -b.hop
          rot.v += b.rot ?? 0
          shift.v += b.shift ?? 0
          squash.v += b.squash ?? 0
          ant.v += b.ant ?? 0
          const n = b.n ?? 1
          if (b.bit) for (let i = 0; i < n; i++) spawn(b.bit, b.dir ?? fid.s, b.size ?? 1, i, n, t)
        }
      }

      // от удара зажмуривается сразу; гладят — жмурится от удовольствия; другое выражение — пока веки закрыты
      const want: Shape = t < ouchUntil && m !== 'dizzy' ? 'ouch'
        : petting && (m === 'idle' || m === 'happy') ? 'happy'
          : P.shape ?? shapeOf(m)
      if (want === 'ouch' && shown !== 'ouch') {
        shown = 'ouch'
        swapping = false
        setShape('ouch')
      } else if (want !== shown && !swapping) {
        swapping = true
        blinkAt = t
      }

      // куда смотреть
      const look = caret ?? (ptr && t - ptr.at < 2500 ? ptr : null)
      let lean = 0
      if (m === 'dizzy' || t < ouchUntil) {
        tx = 0
        ty = 0
      } else if (startle > 0.2) {
        tx = startleDir * 12
        ty = -2
      } else if (m === 'thinking') {
        // думает — глаза перебегают и замирают, взгляд вверх
        tx = Math.tanh(Math.sin(t / 320) * 3) * 11
        ty = -9
      } else if (m === 'listening') {
        tx = Math.sin(t / 700) * 2
        ty = 3
      } else if (P.look) {
        tx = P.look[0]
        ty = P.look[1]
      } else if (look && svg) {
        const r = svg.getBoundingClientRect()
        const dx = look.x - (r.left + r.width / 2)
        // строка ниже глаз: вертикаль усиливаем, иначе взгляд почти горизонтальный и «вниз» не читается
        const dy = (look.y - (r.top + r.height * 0.45)) * (caret ? 2.5 : 1)
        const d = Math.hypot(dx, dy) || 1
        const k = Math.min(1, d / 220)
        tx = (dx / d) * (caret ? 16 : 12) * k
        ty = (dy / d) * (caret ? 12 : 9) * k
        // пишут — тянется к тексту всем телом; затихли — выпрямляется, но глазами следит дальше
        if (caret && m === 'idle') lean = clamp(dx * 0.02, -7, 7) * clamp(1 - (t - caret.at - 1800) / 900, 0, 1)
      } else if (t > nextGlance) {
        const center = Math.random() < 0.4
        tx = center ? 0 : (Math.random() * 2 - 1) * 12
        ty = center ? 0 : (Math.random() * 2 - 1) * 7
        nextGlance = t + 900 + Math.random() * 2200
      }
      const ease = 1 - Math.exp(-dt * 14)
      gx += (tx - gx) * ease
      gy += (ty - gy) * ease

      // наклон: слушает — к человеку, думает — склонил голову и чуть покачивает, пишут — к тексту;
      // злится — упирается навстречу толкнувшему; гладят — ластится к ладони и тянется за ней
      const lean0 = (m === 'listening' ? -5 : m === 'thinking' ? 3 + Math.sin(t / 700) * 1.5 : lean)
        - hitDir * anger * 5 + petAmt * (petX * 6 + clamp(petVx * 1.5, -3, 3)) + (P.lean ?? 0)
      spring(rot, lean0, 90, 6, dt)
      rot.x = clamp(rot.x, -24, 24)
      spring(shift, 0, 70, 10, dt)
      // в полёте чуть вытягивается, на земле — желе; гладят — разомлел и чуть приплюснулся под ладонью
      spring(squash, y < 0 ? clamp(-vy * 0.0005, -0.04, 0.07) : -petAmt * 0.035 + (P.squash ?? 0), 300, 10, dt)
      // антенна догоняет голову с опозданием — болтается; ладонь проезжает — гнётся вслед
      spring(ant, -rot.v * 0.09 - shift.v * 0.12 + petAmt * clamp(petVx * 9, -28, 28), 160, 8, dt)
      ant.x = clamp(ant.x, -35, 35)

      // полёт и приземление: тяжёленький — плюхается, сплющивается и чуть подскакивает ещё раз
      if (y < 0 || vy < 0) {
        vy += GRAVITY * dt
        y += vy * dt
        if (y >= 0) {
          squash.v -= vy * 0.012
          vy = vy > 160 ? -vy * 0.28 : 0
          y = 0
        }
      }
      startle = Math.max(0, startle - dt * 1.4)

      const breath = calm ? 0 : Math.sin(t / 510) * 0.012
      const s = squash.x + breath
      // совсем разозлился — мелко кипит; гладят — тихонько мурчит
      const tremble = (anger > 0.7 && !calm ? Math.sin(t / 26) * (anger - 0.7) * 2.5 : 0) + Math.sin(t / 23) * (P.tremble ?? 0) * 1.2
      const purr = calm ? 0 : Math.sin(t / 21) * 0.4 * petAmt
      // перекатывается на скруглённом низе: приподнимаем ровно на столько, на сколько опустился бы угол,
      // иначе при наклоне голова проваливается в строку ввода
      // (угол — эллипс после сплющивания: считаем его нижнюю точку точно)
      const th = (rot.x * Math.PI) / 180
      const sx = 1 - s * 0.6
      const sy = 1 + s
      const sin = Math.abs(Math.sin(th))
      const cos = Math.cos(th)
      const lift = G.halfFlat * sx * sin - L.r * sy * cos + L.r * Math.hypot(sx * sin, sy * cos)
      const ox = shift.x + tremble
      const oy = y - lift + purr
      tilt.current?.setAttribute('transform',
        `translate(${ox.toFixed(2)} ${oy.toFixed(2)}) translate(110 ${BOTTOM}) rotate(${rot.x.toFixed(2)}) `
        + `scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(-110 ${-BOTTOM})`)
      ants.current?.querySelectorAll<SVGGElement>(':scope > g').forEach((el, i) => {
        const a = G.antennas[i]
        if (a) el.setAttribute('transform', `rotate(${(a.rot + ant.x).toFixed(2)} ${a.x} ${G.by})`)
      })
      // куда садится муха: на макушку лампочки — с поворотом антенны и наклоном головы; без антенны — на макушку головы
      const a0 = G.antennas[0]
      const pa = a0 ? ((a0.rot + ant.x) * Math.PI) / 180 : 0
      const reach = G.by - (G.bulbY - L.bulb - 3.5)
      const px = (a0 ? a0.x + reach * Math.sin(pa) : 110 + L.w * 0.12) - 110
      const py = (a0 ? G.by - reach * Math.cos(pa) : G.y0 - 4) - BOTTOM
      perch = [110 + px * sx * cos - py * sy * Math.sin(th) + ox, BOTTOM + px * sx * Math.sin(th) + py * sy * cos + oy]
      // экран чуть уходит за взглядом, уши — навстречу: похоже на поворот головы
      screen.current?.setAttribute('transform', `translate(${(gx * 0.18).toFixed(2)} ${(gy * 0.12).toFixed(2)})`)
      ears.current?.setAttribute('transform', `translate(${(-gx * 0.1).toFixed(2)} 0)`)

      // моргание: закрыть → (сменить выражение) → открыть
      if (t > nextBlink && !swapping && !fid) {
        blinkAt = t
        // иногда моргает дважды подряд
        nextBlink = t + (Math.random() < 0.2 ? 280 : (m === 'listening' ? 3500 : 1800) + Math.random() * 3000)
      }
      const bp = (t - blinkAt) / BLINK_MS
      const lid = bp < 0 || bp >= 1 ? 0 : bp < 0.4 ? bp / 0.4 : bp < 0.55 ? 1 : 1 - (bp - 0.55) / 0.45
      if (swapping && bp >= 0.4) {
        shown = want === 'ouch' ? shapeOf(m) : want
        swapping = false
        setShape(shown)
      }
      const ey = (1 - lid * 0.92) * (P.lid ?? 1) * (m === 'listening' ? 1 + (level.current ?? 0) * 0.25 : 1)
      eyes.current?.setAttribute('transform', `translate(${gx.toFixed(2)} ${gy.toFixed(2)})`)
      lids.current?.setAttribute('transform', `translate(110 ${G.ey}) scale(1 ${ey.toFixed(3)}) translate(-110 ${-G.ey})`)
      // выходки: подмигнуть одним глазом, скосить глаза к переносице, вытаращить; на перезагрузке — погасить
      const pair = lids.current?.children
      if (pair?.length === 2) {
        const pop = P.pop ?? 1
        for (let i = 0; i < 2; i++) {
          const cx = G.eyeX[i]
          const dx = (i ? -1 : 1) * (P.cross ?? 0)
          pair[i].setAttribute('transform', `translate(${(cx + dx).toFixed(2)} ${G.ey}) scale(${pop.toFixed(3)} ${((P.eye?.[i] ?? 1) * pop).toFixed(3)}) translate(${-cx} ${-G.ey})`)
        }
      }
      lids.current?.setAttribute('opacity', (P.on ?? 1).toFixed(2))
      bar.current?.setAttribute('opacity', P.bar === undefined ? '0' : '1')
      if (P.bar !== undefined) barFill.current?.setAttribute('width', Math.max(10, P.bar * G.barW).toFixed(1))
      // злость: веки хмурятся, «💢» выскакивает и пульсирует
      brow.current?.setAttribute('d', brows(L, G, (shown === 'open' ? anger : 0) * G.eyeH * 0.5))
      spring(veinPop, anger > 0.5 ? 1 + Math.sin(t / 150) * 0.1 : 0, 320, 13, dt)
      const vs = Math.max(0, veinPop.x)
      vein.current?.setAttribute('transform', `translate(${G.vein[0].toFixed(1)} ${G.vein[1].toFixed(1)}) scale(${vs.toFixed(3)})`)
      vein.current?.setAttribute('opacity', vs > 0.02 ? '1' : '0')
      // разозлили или оглушили — лампочка горит красным
      const red = anger > 0.5 || m === 'dizzy'
      const bulbFill = red ? 'var(--red)' : P.bulb ?? ''
      const glow = P.glow === undefined ? '' : P.glow.toFixed(2)
      ants.current?.querySelectorAll<SVGCircleElement>('.robot-bulb').forEach((b) => {
        b.style.fill = bulbFill
        b.style.opacity = glow
      })
      // гладят — всплывают сердечки
      if (petting && t > nextHeart && !calm) {
        const i = flying.findIndex((h) => !h)
        if (i >= 0) flying[i] = { t0: t, x: 110 + (Math.random() * 2 - 1) * L.w * 0.3 }
        nextHeart = t + 650 + Math.random() * 400
      }
      hearts.current?.querySelectorAll<SVGPathElement>('path').forEach((el, i) => {
        const h = flying[i]
        const k = h ? (t - h.t0) / 1400 : 1
        if (!h || k >= 1) {
          flying[i] = null
          el.setAttribute('opacity', '0')
          return
        }
        const rise = 1 - (1 - k) * (1 - k)
        const sc = Math.min(1, k * 5) * (1.1 - k * 0.3)
        el.setAttribute('opacity', (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35).toFixed(3))
        el.setAttribute('transform', `translate(${(h.x + Math.sin(k * Math.PI * 2) * 5).toFixed(1)} ${(G.y0 + 8 - rise * 52).toFixed(1)}) scale(${sc.toFixed(3)})`)
      })
      // выходки: «Z», ноты и пузырьки всплывают и тают, искры разлетаются веером
      sprites.current?.querySelectorAll<SVGPathElement>('path').forEach((el, i) => {
        const b = bits[i]
        const k = b ? (t - b.t0) / BITS[b.kind].ms : 1
        if (!b || k >= 1) {
          bits[i] = null
          el.setAttribute('opacity', '0')
          return
        }
        const out = 1 - (1 - k) * (1 - k)
        let qx = b.x + b.dx * out
        const qy = b.y + b.dy * out
        let sc = b.size * BITS[b.kind].k
        let turn = 0
        let op = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
        if (b.kind === 'z') {
          qx += Math.sin(k * Math.PI * 2) * 4
          sc *= 0.6 + k * 0.8
          turn = -12 + k * 20
        } else if (b.kind === 'note') {
          qx += Math.sin(k * Math.PI * 3) * 5
          sc *= Math.min(1, k * 6)
          turn = Math.sin(k * 9) * 15
        } else if (b.kind === 'bubble') {
          // в конце лопается: чуть раздувается и исчезает
          qx += Math.sin(k * 10) * 2.5
          sc *= Math.min(1, k * 4) * (k > 0.85 ? 1 + (k - 0.85) * 3 : 1)
          op = k < 0.85 ? 0.9 : ((1 - k) / 0.15) * 0.9
        } else {
          sc *= 1 - k * 0.6
          turn = k * 180
          op = 1 - k * k
        }
        el.setAttribute('opacity', op.toFixed(3))
        el.setAttribute('transform', `translate(${qx.toFixed(1)} ${qy.toFixed(1)}) rotate(${turn.toFixed(1)}) scale(${sc.toFixed(3)})`)
      })
      // муха: летает — крылья мелькают, сидит — сложены
      fly.current?.setAttribute('opacity', P.fly ? P.fly.o.toFixed(3) : '0')
      if (P.fly) {
        fly.current?.setAttribute('transform', `translate(${P.fly.x.toFixed(1)} ${P.fly.y.toFixed(1)})`)
        wings.current?.setAttribute('transform', `scale(1 ${(P.fly.flap ? 0.25 + 0.75 * Math.abs(Math.sin(t / 11)) : 1).toFixed(2)})`)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [level, gaze, L, G, puppet, pointer, hand])

  const { x0, y0, topHalf, halfAt, bx, sy0, sh, ey, eyeX, earY, by } = G
  const tapered = L.taper > 0
  const sTop = halfAt(sy0) - bx
  const sBot = halfAt(sy0 + sh) - bx
  const edge = halfAt(earY)
  const padTop = earY - 28
  const arcW = L.eyeW / 2 + 1
  const stroke = clamp(L.eyeW * 0.41, 6, 10)

  return (
    <svg className={`robot ${mood} ${stand ? 'standing' : ''}`} viewBox={stand ? '0 -32 220 220' : '0 0 220 220'} role="img" aria-label="Vi">
      <defs>
        <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={L.body[0]} />
          <stop offset="1" stopColor={L.body[1]} />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id={`${uid}-brow`}>
          <path ref={brow} d={CLIP_BOX} clipRule="evenodd" />
        </clipPath>
      </defs>
      {!stand && <ellipse className="robot-shadow" cx="110" cy="206" rx="56" ry="7" />}
      <g className="robot-body">
        <g ref={tilt}>
          <g ref={ants}>
            {G.antennas.map((a) => (
              <g key={a.x} transform={`rotate(${a.rot} ${a.x} ${by})`}>
                <line x1={a.x} y1={by} x2={a.x} y2={by - L.antennaLen} stroke={L.trim} strokeWidth={L.antennaW} strokeLinecap="round" />
                {/* думает — лампочка горит ровно, а от неё расходятся волны сигнала */}
                {mood === 'thinking' && (
                  <g className="robot-signal">
                    {[0, 1, 2].map((i) => <circle key={i} cx={a.x} cy={G.bulbY} r={L.bulb} vectorEffect="non-scaling-stroke" />)}
                  </g>
                )}
                <circle className="robot-bulb" cx={a.x} cy={G.bulbY} r={L.bulb} />
              </g>
            ))}
          </g>
          <g ref={ears} fill={L.trim}>
            {L.ears === 'bar' && [-1, 1].map((s) => (
              <rect key={s} x={110 + s * (edge + L.earOut - L.earW / 2) - L.earW / 2} y={earY - L.earH / 2} width={L.earW} height={L.earH} rx={L.earW / 2} />
            ))}
            {L.ears === 'knob' && [-1, 1].map((s) => <circle key={s} cx={110 + s * (edge + 3)} cy={earY} r="11" />)}
            {L.ears === 'phones' && (
              <>
                <path
                  d={`M${110 - edge - 4} ${padTop + 6} C${110 - edge - 4} ${y0 - 40} ${110 + edge + 4} ${y0 - 40} ${110 + edge + 4} ${padTop + 6}`}
                  fill="none" stroke={L.trim} strokeWidth="8" strokeLinecap="round"
                />
                {[-1, 1].map((s) => <rect key={s} x={110 + s * (edge + 4) - 12} y={padTop} width="24" height="56" rx="12" />)}
              </>
            )}
          </g>
          {tapered
            ? <path d={roundedPoly([[110 - topHalf, y0], [110 + topHalf, y0], [110 + L.w / 2, BOTTOM], [110 - L.w / 2, BOTTOM]], L.r)} fill={`url(#${uid}-head)`} />
            : <rect x={x0} y={y0} width={L.w} height={L.h} rx={L.r} fill={`url(#${uid}-head)`} />}
          <g ref={screen}>
            {tapered
              ? <path d={roundedPoly([[110 - sTop, sy0], [110 + sTop, sy0], [110 + sBot, sy0 + sh], [110 - sBot, sy0 + sh]], L.screenR)} fill={L.screen} />
              : <rect x={x0 + bx} y={sy0} width={L.w - 2 * bx} height={sh} rx={L.screenR} fill={L.screen} />}
            {/* «💢» — когда разозлили */}
            <g ref={vein} opacity="0" fill="none" stroke="#ff4d4d" strokeWidth="2.8" strokeLinecap="round">
              <path d="M-2.5 -8Q-2.5 -2.5 -8 -2.5M2.5 -8Q2.5 -2.5 8 -2.5M-2.5 8Q-2.5 2.5 -8 2.5M2.5 8Q2.5 2.5 8 2.5" />
            </g>
          </g>
          <g ref={eyes} filter={`url(#${uid}-glow)`}>
            <g clipPath={`url(#${uid}-brow)`}>
              <g ref={lids}>
                {shape === 'dizzy' ? (
                  spirals.map((d) => <path key={d} className="robot-spiral" d={d} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />)
                ) : shape === 'ouch' ? (
                  // зажмурился от удара: > <
                  eyeX.map((cx, k) => {
                    const s = k ? 1 : -1
                    return <path key={cx} d={`M${cx + s * 10} ${ey - 16} L${cx - s * 11} ${ey} L${cx + s * 10} ${ey + 16}`} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                  })
                ) : shape === 'happy' ? (
                  eyeX.map((cx) => <path key={cx} d={`M${cx - arcW} ${ey - 5} q${arcW} ${-Math.max(12, G.eyeH * 0.38)} ${arcW * 2} 0`} fill="none" stroke="#fff" strokeWidth={stroke} strokeLinecap="round" />)
                ) : L.eyes === 'visor' ? (
                  <rect x={110 - (L.gap + L.eyeW) / 2} y={ey - L.eyeH / 2} width={L.gap + L.eyeW} height={L.eyeH} rx={L.eyeH / 2} fill="#fff" />
                ) : L.eyes === 'capsule' ? (
                  eyeX.map((cx) => <rect key={cx} x={cx - L.eyeW / 2} y={ey - L.eyeH / 2} width={L.eyeW} height={L.eyeH} rx={L.eyeW / 2} fill="#fff" />)
                ) : (
                  eyeX.map((cx) => <circle key={cx} cx={cx} cy={ey} r={L.eyeW / 2} fill="#fff" />)
                )}
              </g>
            </g>
            {L.smile && <path d={`M101 ${ey + G.eyeH / 2 + 8} q9 7 18 0`} fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />}
            {/* перезагрузка: полоска загрузки вместо глаз */}
            <g ref={bar} opacity="0" fill="#fff">
              <rect x={110 - G.barW / 2} y={ey - 5} width={G.barW} height="10" rx="5" opacity="0.2" />
              <rect ref={barFill} x={110 - G.barW / 2} y={ey - 5} width="10" height="10" rx="5" />
            </g>
          </g>
        </g>
        {/* муха: прилетает от скуки и садится на лампочку */}
        <g ref={fly} opacity="0">
          <g ref={wings} fill="rgba(255, 255, 255, 0.85)" stroke="rgba(110, 130, 160, 0.7)" strokeWidth="1">
            <ellipse cx="-4.5" cy="-4.5" rx="5.5" ry="3.2" transform="rotate(-35 -4.5 -4.5)" />
            <ellipse cx="4.5" cy="-4.5" rx="5.5" ry="3.2" transform="rotate(35 4.5 -4.5)" />
          </g>
          <circle r="5" fill="#1c1c1e" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="1.2" />
        </g>
        {/* «Z», ноты, пузырьки, искры — что вылетает на выходках */}
        <g ref={sprites} strokeLinecap="round" strokeLinejoin="round">
          {Array.from({ length: BIT_SLOTS }, (_, i) => <path key={i} opacity="0" />)}
        </g>
      </g>
      {/* сердечки, пока гладят: всплывают над головой и тают */}
      <g ref={hearts} fill="#ff6b9a">
        {[0, 1, 2].map((i) => <path key={i} d={HEART} opacity="0" />)}
      </g>
      {/* ненастоящая ладонь — курсор на макушке */}
      {hand && (
        <g ref={palm} opacity="0">
          <path d="M0 0V21L5.4 16.2L9 24L12.6 22.4L9.1 14.8H16.4Z" fill="#121212" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}
