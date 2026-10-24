import { describe, expect, it } from 'vitest'
import { parsePayQr } from './payqr'

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('parsePayQr', () => {
  it('разбирает счёт в UTF-8: получатель, сумма из копеек, назначение', () => {
    const q = parsePayQr(utf8('ST00012|Name=ООО «Ромашка»|PersonalAcc=40702810900000012345|BankName=ПАО Сбербанк|BIC=044525225|PayeeINN=7701234567|Sum=8450050|Purpose=Оплата по счёту № 318'))
    expect(q).toEqual({ name: 'ООО «Ромашка»', sum: 84500.5, purpose: 'Оплата по счёту № 318', inn: '7701234567', bank: 'ПАО Сбербанк', account: '40702810900000012345' })
  })

  it('понимает windows-1251 и другой разделитель', () => {
    // «Ромашка» в cp1251
    const name = [0xd0, 0xee, 0xec, 0xe0, 0xf8, 0xea, 0xe0]
    const bytes = new Uint8Array([...utf8('ST00011#Name='), ...name, ...utf8('#Sum=100000')])
    expect(parsePayQr(bytes)).toMatchObject({ name: 'Ромашка', sum: 1000 })
  })

  it('без суммы — сумму спросим у человека', () => {
    expect(parsePayQr(utf8('ST00012|Name=ИП Иванов|PersonalAcc=40802810000000000001'))?.sum).toBeNull()
  })

  it('обычный QR со ссылкой — не платёжный', () => {
    expect(parsePayQr(utf8('https://example.com'))).toBeNull()
  })
})
