import { describe, expect, it } from 'vitest'
import { parsePhrase } from './phrase'

const TODAY = '2026-09-30'

describe('событие из фразы', () => {
  it('клиент обещал заплатить', () => {
    expect(parsePhrase('клиент обещал 300 тыс. 20-го', TODAY)).toEqual({ amount: 300000, date: '2026-10-20', dir: 'in', title: 'Клиент' })
  })

  it('покупка в конкретный день месяца', () => {
    expect(parsePhrase('15 ноября куплю кофемашину за 150к', TODAY)).toMatchObject({ amount: 150000, date: '2026-11-15', dir: 'out', title: 'Кофемашину' })
  })

  it('миллионы и месяц без числа', () => {
    expect(parsePhrase('в декабре куплю оборудование за 1,2 млн', TODAY)).toMatchObject({ amount: 1200000, date: '2026-12-01', dir: 'out' })
  })

  it('относительные даты', () => {
    expect(parsePhrase('завтра вернут долг 45 000', TODAY)).toMatchObject({ amount: 45000, date: '2026-10-01', dir: 'in' })
    expect(parsePhrase('через неделю штраф 30 тыс', TODAY)).toMatchObject({ amount: 30000, date: '2026-10-07', dir: 'out' })
    expect(parsePhrase('в пятницу заплачу поставщику 80к', TODAY)).toMatchObject({ amount: 80000, date: '2026-10-02', dir: 'out' })
  })

  it('число месяца, которое уже прошло, — в следующем месяце', () => {
    expect(parsePhrase('Агрохолдинг заплатит 450 тыс 5-го', TODAY)).toMatchObject({ date: '2026-10-05', dir: 'in', title: 'Агрохолдинг' })
  })

  it('без суммы и даты возвращает пустые поля', () => {
    expect(parsePhrase('что-то будет', TODAY)).toMatchObject({ amount: null, date: null })
  })
})
