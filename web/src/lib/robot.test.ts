import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Robot } from '../components/Robot'

/**
 * Vi — лицо продукта: робот сидит на строке ввода на любом экране. Если его случайно удалят,
 * тесты упадут, а с ними и деплой — .github/workflows/pages.yml гоняет их перед сборкой.
 */
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8')

describe('робот Vi на месте', () => {
  it('строка ввода показывает Vi', () => {
    expect(src('../components/ViChat.tsx')).toMatch(/<ViBot\b/)
  })
  it('Vi на строке — это робот, которого можно толкать и гладить', () => {
    const bot = src('../components/ViBot.tsx')
    expect(bot).toMatch(/<Robot\b/)
    expect(bot).toMatch(/usePokes/)
  })
  it('голосовой режим — тоже с роботом', () => {
    expect(src('../components/VoiceAssistant.tsx')).toMatch(/<Robot\b/)
  })
  it('робот рисуется', () => {
    expect(typeof Robot).toBe('function')
  })
})
