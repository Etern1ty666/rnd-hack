import centrinvestLogo from '../assets/banks/centrinvest.svg'
import sberLogo from '../assets/banks/sber.svg'
import tbankLogo from '../assets/banks/tbank.svg'
import alfaLogo from '../assets/banks/alfa.svg'
import vtbLogo from '../assets/banks/vtb.svg'
import ozonLogo from '../assets/banks/ozon.svg'
import tochkaLogo from '../assets/banks/tochka.svg'
import modulLogo from '../assets/banks/modul.svg'
import wbLogo from '../assets/banks/wb.svg'
import raifLogo from '../assets/banks/raif.svg'
import sovcomLogo from '../assets/banks/sovcom.svg'

/**
 * Банки для подключения счетов. Знаки банков — настоящие SVG: Центр-инвест и Райффайзен —
 * фавиконки с их сайтов, остальные — логотипы с Викисклада, обрезанные до знака.
 * Цвет и буква остаются запасным вариантом (наличные, «другой банк»).
 */
export type BankId =
  | 'centrinvest' | 'sber' | 'tbank' | 'alfa' | 'vtb' | 'ozon' | 'tochka' | 'modul' | 'wb' | 'raif' | 'sovcom' | 'cash' | 'other'

export interface Bank {
  id: BankId
  name: string
  short: string
  bg: string
  fg: string
  logo?: string
}

export const BANKS: Bank[] = [
  { id: 'centrinvest', name: 'Центр-инвест', short: 'Ц', bg: '#50b848', fg: '#ffffff', logo: centrinvestLogo },
  { id: 'sber', name: 'Сбербанк', short: 'С', bg: '#21a038', fg: '#ffffff', logo: sberLogo },
  { id: 'tbank', name: 'Т-Банк', short: 'Т', bg: '#ffdd2d', fg: '#333333', logo: tbankLogo },
  { id: 'alfa', name: 'Альфа-Банк', short: 'А', bg: '#ef3124', fg: '#ffffff', logo: alfaLogo },
  { id: 'vtb', name: 'ВТБ', short: 'ВТБ', bg: '#0a2896', fg: '#ffffff', logo: vtbLogo },
  { id: 'ozon', name: 'Озон Банк', short: 'О', bg: '#005bff', fg: '#ffffff', logo: ozonLogo },
  { id: 'tochka', name: 'Точка', short: 'Т.', bg: '#6c3df4', fg: '#ffffff', logo: tochkaLogo },
  { id: 'modul', name: 'Модульбанк', short: 'М', bg: '#2b2d42', fg: '#ffffff', logo: modulLogo },
  { id: 'wb', name: 'WB Банк', short: 'W', bg: '#cb11ab', fg: '#ffffff', logo: wbLogo },
  { id: 'raif', name: 'Райффайзен', short: 'R', bg: '#fff200', fg: '#111111', logo: raifLogo },
  { id: 'sovcom', name: 'Совкомбанк', short: 'СК', bg: '#e8473c', fg: '#ffffff', logo: sovcomLogo },
  // без логотипа — цветом темы: в тёмной касса светлая, иначе чёрный кружок пропадает на тёмной карточке
  { id: 'cash', name: 'Наличные', short: '₽', bg: 'var(--ink)', fg: 'var(--on-ink)' },
  { id: 'other', name: 'Другой банк', short: '?', bg: 'var(--line-2)', fg: 'var(--ink)' },
]

export const bankById = (id: BankId) => BANKS.find((b) => b.id === id) ?? BANKS[BANKS.length - 1]
