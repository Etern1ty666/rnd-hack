import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decode1c, parse1c } from './parse1c'
import { buildCompanyData } from './forecast'
import type { CompanyData } from '../types'

const sample = () => decode1c(new Uint8Array(readFileSync(new URL('../../../public/samples/sber_1c.txt', import.meta.url))))
const python = JSON.parse(readFileSync(new URL('./__fixtures__/C023.python.json', import.meta.url), 'utf-8')) as CompanyData

const MINI = [
  '1CClientBankExchange', 'ВерсияФормата=1.03', 'Кодировка=Windows', 'Отправитель=СберБизнес',
  'ДатаНачала=01.09.2026', 'ДатаКонца=30.09.2026', 'РасчСчет=40802810000000000001',
  'СекцияРасчСчет', 'ДатаНачала=01.09.2026', 'ДатаКонца=30.09.2026', 'РасчСчет=40802810000000000001',
  'НачальныйОстаток=1000.00', 'ВсегоПоступило=500.00', 'ВсегоСписано=300.00', 'КонечныйОстаток=1200.00', 'КонецРасчСчет',
  'СекцияДокумент=Платежное поручение', 'Номер=1', 'Дата=02.09.2026', 'Сумма=500.00',
  'ПлательщикСчет=40702810000000000002', 'Плательщик=ИНН 0012345678 ООО «Клиент»', 'ПлательщикИНН=0012345678',
  'ПолучательСчет=40802810000000000001', 'ДатаПоступило=03.09.2026', 'Получатель=ИНН 001234567890 ИП Иванов',
  'ПолучательИНН=001234567890', 'НазначениеПлатежа=Оплата по счету № 7 от 01.09.2026', 'КонецДокумента',
  'СекцияДокумент=Платежное поручение', 'Номер=2', 'Дата=04.09.2026', 'Сумма=300,00',
  'ПлательщикСчет=40802810000000000001', 'ДатаСписано=05.09.2026', 'Плательщик1=ИП Иванов', 'ПлательщикИНН=001234567890',
  'ПолучательСчет=40702810000000000003', 'Получатель1=АО «Арендодатель»', 'ПолучательИНН=0098765432',
  'НазначениеПлатежа=Оплата аренды за сентябрь', 'КонецДокумента', 'КонецФайла',
].join('\r\n')

describe('parse1c', () => {
  it('разбирает поступление и списание по своему счёту', () => {
    const s = parse1c(MINI)
    expect(s.accounts).toEqual(['40802810000000000001'])
    expect(s.opening).toBe(1000)
    expect(s.closing).toBe(1200)
    expect(s.ops).toEqual([
      { date: '2026-09-03', amount: 500, dir: 'in', cp: 'ООО «Клиент»', inn: '0012345678', purpose: 'Оплата по счету № 7 от 01.09.2026', docNo: '1' },
      { date: '2026-09-05', amount: 300, dir: 'out', cp: 'АО «Арендодатель»', inn: '0098765432', purpose: 'Оплата аренды за сентябрь', docNo: '2' },
    ])
    expect(s.ownerName).toBe('ИП Иванов')
  })

  it('отказывается от файла не в формате 1С', () => {
    expect(() => parse1c('дата;сумма\n01.09.2026;100')).toThrow(/1CClientBankExchange/)
  })

  it('читает настоящую выгрузку в Windows-1251', () => {
    const s = parse1c(sample())
    expect(s.sender).toBe('СберБизнес')
    expect(s.ops).toHaveLength(2243)
    expect(s.closing).toBeCloseTo(1682397.97, 2)
    expect(s.ownerName).toBe('ООО «Автосервис-074»')
  })
})

describe('прогноз в браузере совпадает с Python-моделью', () => {
  const s = parse1c(sample())
  const ts = buildCompanyData({ id: 'U1', name: s.ownerName, inn: s.ownerInn, ops: s.ops, opening: s.opening, closing: s.closing })

  it('тот же остаток и та же категоризация', () => {
    expect(ts.balanceNow).toBeCloseTo(python.balanceNow, -1)
    for (const [cat, v] of Object.entries(python.categories.last90)) {
      expect(ts.categories.last90[cat as keyof typeof ts.categories.last90], cat).toBeCloseTo(v as number, -1)
    }
  })

  it('те же регулярные платежи и налоги', () => {
    const fixed = (d: CompanyData) => d.events.filter((e) => e.kind !== 'pattern' && e.kind !== 'invoice')
    const a = fixed(ts)
    const b = fixed(python)
    expect(a.map((e) => `${e.cat}:${e.title}`).sort()).toEqual(b.map((e) => `${e.cat}:${e.title}`).sort())
    const sameDate = a.filter((e) => b.some((x) => x.cat === e.cat && x.date === e.date && Math.abs(x.amount - e.amount) <= Math.abs(e.amount) * 0.01))
    expect(sameDate.length / a.length).toBeGreaterThan(0.9)
  })

  it('выручка по дням недели почти та же', () => {
    for (const b of python.forecast.baseline) {
      const t = ts.forecast.baseline.find((x) => x.cat === b.cat)
      expect(t, b.cat).toBeDefined()
      const sa = t!.values.reduce((s, v) => s + v, 0)
      const sb = b.values.reduce((s, v) => s + v, 0)
      expect(Math.abs(sa - sb) / sb, b.cat).toBeLessThan(0.1)
    }
  })

  it('коридор вокруг прогноза не перевёрнут', () => {
    expect(ts.forecast.days).toHaveLength(60)
    ts.forecast.lo.forEach((lo, i) => expect(lo).toBeLessThanOrEqual(ts.forecast.hi[i]))
    expect(ts.backtest.cutoffs).toBeGreaterThan(10)
    expect(ts.backtest.coverage).toBeGreaterThan(0.6)
  })
})
