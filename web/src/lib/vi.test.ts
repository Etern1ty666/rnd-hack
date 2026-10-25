import { describe, expect, it } from 'vitest'
import C140 from '../data/C140.json'
import C065 from '../data/C065.json'
import { evaluate } from './evaluate'
import { defaultSettings } from './settings'
import type { CompanyData } from './types'
import { viAnswer, viFile, viSuggestions } from './vi'

const ev = (raw: unknown) => {
  const data = raw as CompanyData
  return evaluate(data, defaultSettings(data), [], new Set())
}
// кафе — впереди разрыв, кофейня — всё спокойно
const gap = ev(C140)
const calm = ev(C065)

describe('Vi читает приложенный файл', () => {
  const qr = { name: 'ООО Ромашка', sum: 45000, purpose: 'Оплата по счёту 12', inn: '', bank: '', account: '' }

  it('счёт с QR ставит платёж: сегодня, а с подписью — на названный день', () => {
    const today = viFile({ name: 'счёт.png', kind: 'invoice', qr }, '', gap)
    expect(today.add).toMatchObject({ amount: -45000, date: gap.data.forecast.days[0], title: 'ООО Ромашка' })
    expect(today.actions?.[0].undo).toBe(today.add!.id)
    const later = viFile({ name: 'счёт.png', kind: 'invoice', qr }, 'оплатить 30-го', gap)
    expect(later.add!.date.slice(-2)).toBe('30')
  })

  it('без суммы в коде и без кода — ничего не записывает, а зовёт сканировать', () => {
    expect(viFile({ name: 'счёт.png', kind: 'invoice', qr: { ...qr, sum: null } }, '', gap).add).toBeUndefined()
    expect(viFile({ name: 'кот.jpg', kind: 'image' }, '', gap).actions?.[0].sheet).toBe('qr')
  })

  it('выписку предлагает подключить счётом', () => {
    expect(viFile({ name: 'sber_1c.txt', kind: 'statement' }, '', gap).widget).toBe('newAccount')
  })
})

describe('Vi отвечает', () => {
  it('фразу с суммой и датой записывает в прогноз и даёт отменить', () => {
    const r = viAnswer('клиент обещал 300 тысяч 20-го', gap)
    expect(r.add).toMatchObject({ amount: 300000, cat: 'manual', kind: 'manual' })
    expect(r.actions?.[0].undo).toBe(r.add!.id)
  })

  it('вопрос с датой не принимает за событие', () => {
    expect(viAnswer('Хватит ли на зарплату 20-го?', gap).add).toBeUndefined()
  })

  it('сумму без даты переспрашивает', () => {
    const r = viAnswer('куплю кофемашину за 150к', gap)
    expect(r.add).toBeUndefined()
    expect(r.text).toMatch(/на какой день/)
  })

  it('когда не хватает — предлагает шаги, когда хватает — нет', () => {
    expect(viAnswer('Что делать?', gap).steps?.length).toBeGreaterThan(0)
    expect(viAnswer('Как успеть?', calm).steps).toBeUndefined()
  })

  it('про зарплату показывает только зарплату', () => {
    const r = viAnswer('хватит денег на зарплату?', gap)
    expect(r.bills?.length).toBeGreaterThan(0)
    expect(r.bills!.every((b) => b.label === 'Зарплата')).toBe(true)
  })

  it('разделы показывает прямо в переписке', () => {
    expect(viAnswer('покажи платежи', gap).widget).toBe('payments')
    expect(viAnswer('Все платежи', gap).widget).toBe('payments')
    expect(viAnswer('а что если клиент задержит оплату', gap).widget).toBe('whatif')
    expect(viAnswer('куда уходят деньги?', gap).widget).toBe('money')
    expect(viAnswer('насколько точен прогноз?', gap).widget).toBe('trust')
    expect(viAnswer('открой настройки', gap).widget).toBe('settings')
    expect(viAnswer('хочу добавить счёт', gap).widget).toBe('newAccount')
  })

  it('«добавить новый платёж» — подсказка, как записать, а не событие', () => {
    const r = viAnswer('Добавить новый платёж', gap)
    expect(r.add).toBeUndefined()
    expect(r.actions?.map((a) => a.sheet)).toEqual(['add', 'qr'])
  })

  it('вопрос о налоге — ответ, а не раздел', () => {
    expect(viAnswer('когда ближайший налог?', gap).widget).toBeUndefined()
  })

  it('непонятное — не событие, а подсказки, о чём спросить', () => {
    const r = viAnswer('абракадабра', gap)
    expect(r.add).toBeUndefined()
    expect(r.actions?.length).toBeGreaterThan(0)
  })
})

describe('Vi предлагает', () => {
  it('с чего начать разговор — зависит от статуса', () => {
    expect(viSuggestions(gap)[0]).toBe('Как успеть?')
    expect(viSuggestions(calm)[0]).toBe('Сколько я могу взять себе?')
  })
})
