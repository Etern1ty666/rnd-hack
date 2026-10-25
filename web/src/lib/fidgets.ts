/**
 * Выходки Vi от скуки: когда ничего не происходит, он время от времени что-нибудь выкидывает.
 * Каждая выходка — поза как функция времени (куда смотрят глаза, наклон, веки…) и толчки
 * в нужные моменты (подпрыгнуть, дёрнуть антенной, выпустить ноты). Сам кадр рисует Robot:
 * поза только сдвигает цели его пружин, поэтому выходка начинается и обрывается плавно.
 */

export type Fidget = 'wink' | 'hum' | 'hiccup' | 'doze' | 'sneeze' | 'fly' | 'glitch'
/** что вылетает: «Z», нота, пузырёк, искра */
export type Bit = 'z' | 'note' | 'bubble' | 'spark'

/** Поза в момент выходки; чего не задали — как обычно. */
export interface Pose {
  /** куда смотрят глаза: сдвиг в единицах рисунка (обычно до ±12 по x и ±9 по y) */
  look?: [number, number]
  /** наклон головы, градусы — прибавляется к обычному */
  lean?: number
  /** вытягивается (+) или сплющивается (−) */
  squash?: number
  /** мелкая дрожь */
  tremble?: number
  /** насколько открыты глаза, 0…1 (больше 1 — вытаращил) */
  lid?: number
  /** то же — для каждого глаза отдельно: левый, правый */
  eye?: [number, number]
  /** глаза к переносице */
  cross?: number
  /** глаза крупнее обычного */
  pop?: number
  /** глаза видны (0…1): гаснут на перезагрузке */
  on?: number
  shape?: 'happy' | 'ouch'
  blush?: number
  /** лампочка: цвет и яркость */
  bulb?: string
  glow?: number
  /** полоска загрузки на экране, 0…1 */
  bar?: number
  /** муха: где, насколько видна, машет ли крыльями */
  fly?: { x: number; y: number; o: number; flap: boolean }
}

/** Толчок в момент at: скорости пружин (наклон, сдвиг, сплющивание, антенна), подскок и что вылетает. */
export interface Beat {
  at: number
  hop?: number
  rot?: number
  shift?: number
  squash?: number
  ant?: number
  bit?: Bit
  /** сколько штук, в какую сторону (−1 — влево), какого размера */
  n?: number
  dir?: number
  size?: number
}

/** Что выходка знает о роботе: в какую сторону она сегодня, куда садится муха, где центр глаз. */
export interface Ctx {
  s: number
  perch: [number, number]
  face: [number, number]
}

interface Spec {
  ms: number
  /** как часто выпадает: чем больше, тем чаще */
  weight: number
  /** разбудили раньше этого момента — сразу сюда (вздрагивает и просыпается) */
  wake?: number
  beats: (s: number) => Beat[]
  pose: (f: number, c: Ctx) => Pose
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 0 до a, 1 после b, плавно между */
const ramp = (f: number, a: number, b: number) => {
  const k = clamp01((f - a) / (b - a))
  return k * k * (3 - 2 * k)
}
/** 0 → 1 (a…b) → держится → 0 (c…d) */
const hump = (f: number, a: number, b: number, c: number, d: number) => ramp(f, a, b) * (1 - ramp(f, c, d))
/** вспышка в момент at и затухание */
const decay = (f: number, at: number, ms: number) => (f < at ? 0 : Math.exp(-(f - at) / ms))
/** псевдослучайное 0…1, одно и то же для одного n — глюк дёргается, но не мерцает каждый кадр */
const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const mix = (a: [number, number], b: [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
/** взгляд на точку: как за мышью — направление, а не расстояние */
const lookAt = (p: [number, number], face: [number, number]): [number, number] => {
  const dx = p[0] - face[0]
  const dy = p[1] - face[1]
  const d = Math.hypot(dx, dy) || 1
  const k = Math.min(1, d / 60)
  return [(dx / d) * 13 * k, (dy / d) * 10 * k]
}

const HICS = [200, 1250, 1850]
const WAKE = 4300
const ACHOO = 1400
const GLITCH = ['var(--red)', 'var(--blue)', 'var(--yellow)', 'var(--green)']

export const FIDGETS: Record<Fidget, Spec> = {
  // смотрит на вас, подмигивает и чуть краснеет
  wink: {
    ms: 1300,
    weight: 3,
    beats: (s) => [{ at: 320, ant: s * 170 }],
    pose: (f, { s }) => {
      const shut = hump(f, 260, 340, 640, 780)
      const smile = hump(f, 200, 340, 700, 1000)
      const other = 1 - smile * 0.15
      return {
        look: [0, 0],
        lean: s * 5 * hump(f, 0, 260, 850, 1250),
        eye: s < 0 ? [1 - shut * 0.9, other] : [other, 1 - shut * 0.9],
        blush: 0.55 * hump(f, 280, 450, 850, 1250),
      }
    },
  },

  // жмурится «^ ^», качается в такт, вылетают ноты
  hum: {
    ms: 4300,
    weight: 3,
    beats: (s) => [300, 1000, 1700, 2400, 3100].map((at, i) => ({ at, bit: 'note' as const, dir: i % 2 ? -s : s, size: 0.85 + (i % 3) * 0.15 })),
    pose: (f) => {
      const on = hump(f, 0, 400, 3500, 4100)
      const sway = Math.sin((f / 1400) * Math.PI * 2)
      return {
        shape: f < 3900 ? 'happy' : undefined,
        lean: sway * 7 * on,
        squash: Math.sin((f / 700) * Math.PI * 2) * 0.022 * on,
        look: [sway * 5 * on, -5 * on],
      }
    },
  },

  // три «ик!» с пузырьком — и неловко отводит глаза
  hiccup: {
    ms: 3100,
    weight: 2.5,
    beats: (s) => HICS.map((at, i) => ({ at, hop: 150, squash: 3.2, ant: (i % 2 ? -1 : 1) * s * 240, bit: 'bubble' as const, dir: i % 2 ? -s : s })),
    pose: (f, { s }) => {
      const kick = HICS.reduce((m, at) => Math.max(m, decay(f, at, 110)), 0)
      const after = ramp(f, 2250, 2500)
      return {
        pop: 1 + kick * 0.28,
        look: [s * 10 * after, (1 - after) * (-3 - 6 * kick) + after * 4],
        blush: 0.45 * hump(f, 2250, 2450, 2800, 3100),
      }
    },
  },

  // клюёт носом: веки тяжелеют, «Z-z-z», голова клонится — вздрагивает и озирается
  doze: {
    ms: 5600,
    weight: 2,
    wake: WAKE,
    beats: (s) => [
      { at: 2100, bit: 'z', size: 0.7, dir: s },
      { at: 2750, rot: s * 70, bit: 'z', size: 0.95, dir: s },
      { at: 3450, bit: 'z', size: 1.2, dir: s },
      { at: WAKE, hop: 200, rot: -s * 120, ant: s * 420 },
    ],
    pose: (f, { s }) => {
      if (f < WAKE) {
        const sleep = ramp(f, 300, 2100)
        // ещё борется: раз разлепляет глаза
        const fight = 0.4 * hump(f, 950, 1050, 1150, 1450)
        const deep = ramp(f, 2000, 2400)
        return {
          lid: Math.max(0.07, 1 - 0.93 * sleep + fight),
          look: [0, 7 * sleep],
          lean: s * (2 + 8 * ramp(f, 700, 3800)),
          squash: -0.03 * sleep + Math.sin((f / 1700) * Math.PI * 2) * 0.016 * deep,
          glow: 1 - 0.65 * sleep,
        }
      }
      // «я не спал!»
      const u = f - WAKE
      return {
        pop: 1 + 0.25 * decay(u, 0, 260),
        look: u < 260 ? [-s * 12, -3] : u < 560 ? [s * 12, -3] : [0, 0],
      }
    },
  },

  // «а… а…» — и чихает искрами
  sneeze: {
    ms: 2700,
    weight: 1.2,
    beats: (s) => [{ at: ACHOO, hop: 110, rot: s * 240, shift: s * 90, squash: -7, ant: s * 540, bit: 'spark', n: 5, dir: s }],
    pose: (f, { s }) => {
      if (f < ACHOO) {
        const inhale = ramp(f, 100, 1350)
        return {
          lid: 1 - 0.55 * inhale + 0.3 * hump(f, 620, 700, 760, 900),
          look: [0, -9 * ramp(f, 100, 800)],
          squash: 0.065 * inhale,
          lean: -s * 6 * inhale,
          tremble: 0.7 * ramp(f, 850, 1380),
        }
      }
      const u = f - ACHOO
      return {
        shape: u < 330 ? 'ouch' : u < 1050 ? 'happy' : undefined,
        bulb: u < 220 ? 'var(--yellow)' : undefined,
        look: [0, 0],
        blush: 0.3 * hump(u, 300, 450, 800, 1100),
      }
    },
  },

  // муха петляет вокруг, садится на лампочку — косит глаза, трясёт головой, и она улетает
  fly: {
    ms: 6900,
    weight: 0.8,
    beats: (s) => [
      { at: 4700, rot: s * 110, ant: s * 460 },
      { at: 4880, rot: -s * 190, ant: -s * 560 },
      { at: 5060, rot: s * 120, ant: s * 320 },
    ],
    pose: (f, { s, perch, face }) => {
      // путь мухи — сумма синусов несоизмеримых частот: петляет и не повторяется; к 0,9 с — со своей стороны
      const ph = s > 0 ? -0.52 : -0.52 - Math.PI
      const path = (g: number): [number, number] => [
        110 + 88 * Math.sin(g / 430 + ph) + 24 * Math.sin(g / 170) + 4 * Math.sin(g / 23),
        46 + 34 * Math.sin(g / 310 + 1) + 14 * Math.sin(g / 130) + 4 * Math.cos(g / 29),
      ]
      const exit: [number, number] = [110 - s * 210, -70]
      let p: [number, number]
      if (f < 2900) p = mix([110 + s * 200, 0], path(f), ramp(f, 0, 900))
      else if (f < 3500) p = mix(path(f), perch, ramp(f, 2900, 3500))
      else if (f < 5050) p = perch
      else {
        const k = clamp01((f - 5050) / 1350)
        p = mix(perch, exit, k * k)
        p = [p[0] + 5 * Math.sin(f / 23) * k, p[1] + 4 * Math.cos(f / 29) * k]
      }
      const o = ramp(f, 0, 150) * (1 - ramp(f, 6100, 6400))
      const landed = f >= 3500 && f < 5050
      const fly = { x: p[0], y: p[1], o, flap: !landed || (f > 4050 && f < 4180) }
      if (landed) {
        return {
          fly,
          look: [0, -12],
          cross: 6 * ramp(f, 3550, 3900) * (1 - ramp(f, 4600, 4750)),
          lid: 1 - 0.4 * hump(f, 4550, 4680, 5000, 5250),
        }
      }
      return {
        fly,
        look: o > 0.3 ? lookAt(p, face) : [0, 0],
        lean: o > 0.3 ? Math.max(-4, Math.min(4, (p[0] - face[0]) * 0.03)) : 0,
        shape: f > 6350 ? 'happy' : undefined,
      }
    },
  },

  // глючит, гаснет, грузится полоской и включается заново — «что это было?»
  glitch: {
    ms: 3700,
    weight: 0.5,
    beats: (s) => [
      { at: 0, ant: s * 200 },
      { at: 380, rot: -s * 70, shift: s * 30 },
      { at: 2450, hop: 130, ant: s * 300 },
    ],
    pose: (f, { s }) => {
      if (f < 800) {
        const n = Math.floor(f / 70)
        return {
          look: [(noise(n) * 2 - 1) * 12, (noise(n + 99) * 2 - 1) * 7],
          on: noise(n + 7) < 0.3 ? 0.15 : 1,
          eye: [1, noise(n + 5) < 0.25 ? 0.3 : 1],
          tremble: 0.9,
          bulb: GLITCH[Math.floor(noise(n + 3) * GLITCH.length)],
        }
      }
      if (f < 2450) {
        // быстро до трети, застряла, рывок, медленно до конца
        const bar = 0.32 * ramp(f, 850, 1150) + 0.5 * ramp(f, 1600, 1750) + 0.18 * ramp(f, 1850, 2350)
        return { on: 0, bar, look: [0, 0], bulb: 'var(--yellow)', glow: f % 500 < 250 ? 1 : 0.35 }
      }
      // глаза раскрываются из полоски с перехлёстом
      const u = f - 2450
      const open = u < 300 ? ramp(u, 0, 220) * 1.12 : 1 + 0.12 * (1 - ramp(u, 300, 450))
      return {
        lid: Math.max(0.05, open),
        look: u < 500 ? [0, 0] : u < 800 ? [-s * 11, 0] : u < 1100 ? [s * 11, 0] : [0, 0],
        bulb: u < 300 ? 'var(--green)' : undefined,
      }
    },
  },
}

const KINDS = Object.keys(FIDGETS) as Fidget[]
// давно скучает — чаще клюёт носом
const SLEEPY_MS = 40000
const weight = (k: Fidget, quietMs: number) => FIDGETS[k].weight * (k === 'doze' && quietMs > SLEEPY_MS ? 3 : 1)

/** Какая выходка следующая: по весам, и не та же, что только что была. */
export function pickFidget(prev: Fidget | null, quietMs: number, rnd = Math.random): Fidget {
  const all = KINDS.filter((k) => k !== prev)
  let r = rnd() * all.reduce((sum, k) => sum + weight(k, quietMs), 0)
  for (const k of all) {
    r -= weight(k, quietMs)
    if (r < 0) return k
  }
  return all[all.length - 1]
}

/** Доля выходки среди всех — для подписи на /robots.html. */
export function fidgetOdds(k: Fidget) {
  return FIDGETS[k].weight / KINDS.reduce((sum, x) => sum + FIDGETS[x].weight, 0)
}
