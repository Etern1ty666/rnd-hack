import { describe, expect, it } from 'vitest'
import { FIDGETS, fidgetOdds, pickFidget, type Fidget } from './fidgets'

const KINDS = Object.keys(FIDGETS) as Fidget[]
const ctx = { s: 1, perch: [110, 10] as [number, number], face: [110, 107] as [number, number] }

describe('выходки от скуки', () => {
  it('одна и та же не выпадает два раза подряд', () => {
    for (const prev of KINDS) {
      for (let i = 0; i < 50; i++) expect(pickFidget(prev, 0, () => i / 50)).not.toBe(prev)
    }
  })

  it('частые выпадают чаще редких', () => {
    const n: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const k = pickFidget(null, 0, () => (i + 0.5) / 1000)
      n[k] = (n[k] ?? 0) + 1
    }
    expect(n.wink).toBeGreaterThan(n.glitch * 4)
    expect(KINDS.reduce((s, k) => s + fidgetOdds(k), 0)).toBeCloseTo(1)
  })

  it('давно скучает — чаще клюёт носом', () => {
    const count = (quiet: number) => {
      let c = 0
      for (let i = 0; i < 1000; i++) if (pickFidget(null, quiet, () => (i + 0.5) / 1000) === 'doze') c++
      return c
    }
    expect(count(60000)).toBeGreaterThan(count(0) * 2)
  })

  it('позы — конечные числа на всём протяжении, толчки — по порядку и внутри выходки', () => {
    for (const k of KINDS) {
      const spec = FIDGETS[k]
      for (let f = 0; f <= spec.ms; f += 37) {
        const p = spec.pose(f, ctx)
        const nums = [...(p.look ?? []), ...(p.eye ?? []), p.lean, p.squash, p.lid, p.cross, p.pop, p.on, p.bar, p.glow, p.fly?.x, p.fly?.y, p.fly?.o]
        for (const v of nums) if (v !== undefined) expect(Number.isFinite(v)).toBe(true)
      }
      const at = spec.beats(1).map((b) => b.at)
      expect(at).toEqual([...at].sort((a, b) => a - b))
      expect(at.every((t) => t >= 0 && t < spec.ms)).toBe(true)
    }
  })

  it('муха садится на лампочку', () => {
    const p = FIDGETS.fly.pose(4000, ctx)
    expect(p.fly).toMatchObject({ x: 110, y: 10, flap: false })
  })
})
