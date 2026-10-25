import type { Evaluation } from './evaluate'
import type { Bill } from './bills'
import type { PayQr } from './payqr'
import type { CatKey, PlannedEvent } from './types'
import { CATS, INCOME_CATS } from './categories'
import { compact, daysBetween, fmtDay, pct } from './format'
import { parsePhrase } from './phrase'

/**
 * Vi — помощник, который отвечает на вопросы о деньгах бизнеса.
 * Пока это правила, как и разбор фраз: вопрос → намерение → ответ из настоящего прогноза.
 * Ответ — только данные (текст, платежи, шаги, кнопки, раздел), поэтому переписку можно сохранить,
 * а на место правил потом встанет языковая модель с тем же форматом ответа.
 */
/** Раздел, который Vi показывает прямо в переписке — живым блоком, а не отдельной страницей. */
export type ViWidget = 'payments' | 'whatif' | 'money' | 'trust' | 'settings' | 'newAccount' | `account:${string}`
/** Карточка справа, к которой относится ответ: она всплывает наверх. */
export type ViCard = 'status' | 'money' | 'bills' | 'chart' | 'added' | 'trust'

export interface ViAction {
  label: string
  /** Показать раздел в переписке. */
  widget?: ViWidget
  /** Задать следующий вопрос. */
  ask?: string
  /** Открыть панель добавления платежа. */
  sheet?: 'add' | 'qr'
  /** Убрать событие, которое Vi только что записал. */
  undo?: string
}

export interface ViStep {
  id: string
  title: string
  detail: string
}

export interface ViReply {
  text: string
  bills?: Bill[]
  steps?: ViStep[]
  actions?: ViAction[]
  /** Событие, которое нужно записать в прогноз. */
  add?: PlannedEvent
  /** Раздел под ответом: платежи, «что если», расходы, точность, настройки, счёт. */
  widget?: ViWidget
  focus?: ViCard
}

/** Сообщение переписки с Vi — только данные, чтобы её можно было сохранить. */
export interface ViMsg {
  id: string
  role: 'user' | 'vi'
  text: string
  /** Приложенный файл — только имя: сам файл в переписке не храним. */
  file?: string
  bills?: Bill[]
  steps?: ViStep[]
  actions?: ViAction[]
  widget?: ViWidget
}

const rub = (v: number) => `${compact(v)}\u00a0₽`
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

const ASK_STEPS: ViAction = { label: 'Как успеть?', ask: 'Как успеть?' }
const OPEN_PAYMENTS: ViAction = { label: 'Все платежи', widget: 'payments' }

/** «Хватит ли на …» по одному виду платежей: зарплата, налог, аренда, кредит. */
function billAnswer(ev: Evaluation, label: string, acc: string, none: string): ViReply {
  const list = ev.bills.filter((b) => b.label === label)
  if (!list.length) return { text: none }
  const b = list.find((x) => x.status !== 'ok') ?? list[0]
  const note = b.note && label === 'Налог' ? ` (${b.note})` : ''
  const help = ev.actions[0] ? ` Выручит: ${lower(ev.actions[0].title)}.` : ''
  if (b.status === 'short') {
    return { text: `${fmtDay(b.date)} на ${acc}${note} не хватит ${rub(b.short)} из ${rub(b.amount)}.${help}`, bills: list, actions: [ASK_STEPS, OPEN_PAYMENTS], focus: 'bills' }
  }
  if (b.status === 'risk') {
    return { text: `${fmtDay(b.date)} на ${acc}${note} может не хватить — всё зависит от поступлений до этого дня.${help}`, bills: list, actions: [ASK_STEPS, OPEN_PAYMENTS], focus: 'bills' }
  }
  if (list.length > 1) {
    const sum = list.reduce((s, x) => s + x.amount, 0)
    return { text: `Хватает на все платежи: ${list.map((x) => `${fmtDay(x.date)} — ${rub(x.amount)}`).join(', ')}. Всего ${rub(sum)}.`, bills: list, focus: 'bills' }
  }
  return { text: `Хватает: ${lower(label)}${note} ${fmtDay(b.date)}, ${rub(b.amount)}.`, bills: list, focus: 'bills' }
}

function freeAnswer(ev: Evaluation): ViReply {
  if (ev.free > 0) {
    return { text: `Без риска для платежей можно взять до ${rub(ev.free)}. Больше — и в какой-то из дней месяца может не хватить.`, actions: [{ label: 'Посчитать «что если»', widget: 'whatif' }], focus: 'status' }
  }
  if (ev.status.tone === 'short') {
    return { text: 'Пока лучше ничего не выводить: денег не хватает даже на платежи месяца.', actions: [ASK_STEPS], focus: 'status' }
  }
  return { text: 'Пока лучше ничего не выводить: все деньги уйдут на платежи месяца.', actions: [{ label: 'Посчитать «что если»', widget: 'whatif' }], focus: 'status' }
}

function stepsAnswer(ev: Evaluation): ViReply {
  if (!ev.actions.length) return { text: `Ничего делать не нужно: ${lower(ev.status.title)}. ${ev.status.sub}`, focus: 'status' }
  return {
    text: `${ev.before.day ? `Деньги нужны к ${fmtDay(ev.before.day)}. ` : ''}Вот что поможет — отметьте шаги, и я сразу пересчитаю прогноз.`,
    steps: ev.actions.map(({ id, title, detail }) => ({ id, title, detail })),
    focus: 'status',
  }
}

function statusAnswer(ev: Evaluation): ViReply {
  const { tone, title, sub } = ev.status
  if (tone === 'ok') {
    const free = ev.free > 0 ? ` Без риска можно взять себе до ${rub(ev.free)}.` : ''
    return { text: `${title}. ${sub}${free}`, actions: [{ label: 'Ближайшие платежи', ask: 'Какие ближайшие платежи?' }], focus: 'status' }
  }
  const atRisk = ev.bills.filter((b) => b.status !== 'ok').slice(0, 4)
  return { text: `${title}. ${sub}`, bills: atRisk.length ? atRisk : undefined, actions: [ASK_STEPS, OPEN_PAYMENTS], focus: 'status' }
}

function upcomingAnswer(ev: Evaluation, week: boolean): ViReply {
  const today = ev.data.asOf
  const list = week ? ev.bills.filter((b) => daysBetween(today, b.date) <= 7) : ev.bills.slice(0, 5)
  if (!list.length) return { text: week ? 'На этой неделе крупных платежей нет.' : 'В ближайший месяц крупных платежей нет.' }
  const sum = list.reduce((s, b) => s + b.amount, 0)
  const bad = list.filter((b) => b.status === 'short').length
  const tail = bad ? ` На ${bad === 1 ? 'один' : bad} из них не хватит денег.` : ' На все хватает.'
  const head = week ? `На этой неделе — ${list.length} на ${rub(sum)}.` : `Ближайшие платежи — ${rub(sum)}.`
  return { text: head + tail, bills: list, actions: bad ? [ASK_STEPS, OPEN_PAYMENTS] : [OPEN_PAYMENTS], focus: 'bills' }
}

function moneyAnswer(ev: Evaluation): ViReply {
  const c = ev.data.categories.last90
  const top = (Object.keys(c) as CatKey[])
    .filter((k) => !INCOME_CATS.includes(k) && CATS[k] && !['transfer_out', 'refund_out', 'owner_in', 'loan_in', 'refund_in'].includes(k))
    .map((k) => ({ k, v: c[k] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
  if (!top.length) return { text: 'За последние 90 дней трат почти не было.' }
  return {
    text: `Больше всего за 90 дней ушло сюда: ${top.map((t) => `${lower(CATS[t.k].label)} — ${rub(t.v)}`).join(', ')}.`,
    widget: 'money',
  }
}

function trustAnswer(ev: Evaluation): ViReply {
  const bt = ev.data.backtest
  const gaps = bt.gapWindows ? ` Из ${bt.gapWindows} прошлых разрывов заранее заметил ${bt.gapCaught}.` : ''
  return {
    text: `Я проверил себя на вашей истории: через 2 недели ошибаюсь в среднем на ±${rub(bt.mae.d14.model)}, а в серую зону прогноза попадает ${pct(bt.coverage)} реальных дней.${gaps}`,
    widget: 'trust',
    focus: 'trust',
  }
}

const HELP_TEXT = 'Я считаю деньги бизнеса на месяц вперёд. Спросите, хватит ли на зарплату, налог или аренду, сколько можно взять себе или как успеть, если денег не хватает. А платёж можно записать одной фразой — например, «клиент обещал 300 тыс. 20-го».'

/** Ответ на вопрос или фразу. Чистая функция: запись события делает тот, кто её вызвал. */
export function viAnswer(input: string, ev: Evaluation): ViReply {
  const q = norm(input.trim())
  const has = (re: RegExp) => re.test(q)

  if (!q) return { text: HELP_TEXT, actions: viSuggestions(ev).slice(0, 3).map((s) => ({ label: s, ask: s })) }
  if (has(/^(привет|здравств|добр(ый|ое|ого)|хай|hello|hi)/)) {
    return { text: `Привет! ${ev.status.title}. Спросите меня о платежах — я посчитаю.`, actions: viSuggestions(ev).slice(0, 2).map((s) => ({ label: s, ask: s })) }
  }
  if (has(/спасибо|благодар/)) return { text: 'Пожалуйста! Я рядом — пишите, если что-то изменится.' }

  // «клиент обещал 300 тыс. 20-го» — это не вопрос, а событие: записываем в прогноз
  const question = has(/\?|хватит|хватает|сколько|когда|какие|какой|что если|можно ли/)
  const p = parsePhrase(input, ev.data.asOf)
  if (!question && p.amount) {
    if (!p.date) return { text: `Записать ${rub(p.amount)} — а на какой день? Например: «${input.trim()} 20-го».`, actions: [{ label: 'Ввести по полям', sheet: 'add' }] }
    if (!ev.data.forecast.days.includes(p.date)) return { text: `${fmtDay(p.date)} — дальше, чем я считаю прогноз. Запишите это ближе к дате.` }
    const id = `vi${Date.now()}`
    const income = p.dir === 'in'
    return {
      text: `Записал: ${fmtDay(p.date)} ${income ? 'придёт' : 'уйдёт'} ${rub(p.amount)}${p.title ? ` — «${lower(p.title)}»` : ''}. Прогноз уже обновил.`,
      add: {
        id, date: p.date, amount: income ? p.amount : -p.amount, cat: 'manual', kind: 'manual',
        title: p.title || (income ? 'Обещанная оплата' : 'Плановый расход'), cp: p.title, source: 'manual',
      },
      actions: [{ label: 'Отменить', undo: id }, { label: 'Хватает ли теперь?', ask: 'Хватит ли денег на платежи?' }],
      focus: 'added',
    }
  }

  // «добавить платёж» без суммы — объясняем, как записать одной фразой, и даём поля или QR
  if (has(/(добав|запиш|запис)[а-я]* (нов[а-я]* )?платеж|нов[а-я]* платеж/)) {
    return {
      text: 'Напишите одной фразой — что, сколько и когда: «клиент обещал 300 тыс. 20-го» или «в пятницу куплю кофемашину за 150к». Я разберу и сразу поставлю в прогноз.',
      actions: [{ label: 'Заполнить по полям', sheet: 'add' }, { label: 'Сканировать QR', sheet: 'qr' }],
    }
  }
  if (has(/настройк|систем[а-я]* налог|налогов[а-я]* систем|переименова|неприкосновенн|подушк/)) return viWidget('settings')
  if (has(/нов[а-я]* сч[её]т|добав[а-я]* сч[её]т|подключ[а-я]* (сч[её]т|карт|банк)/)) return viWidget('newAccount')
  if (has(/календар|все платеж|покажи платеж|список платеж/)) return viWidget('payments')
  if (has(/как успеть|что делать|как быть|помоги|выход|спаст|выкрутит|где взять/)) return stepsAnswer(ev)
  if (has(/зарплат|аванс|сотрудник|персонал/)) return billAnswer(ev, 'Зарплата', 'зарплату', 'В ближайший месяц зарплаты не вижу.')
  if (has(/налог|енп|ндфл|взнос|усн/)) return billAnswer(ev, 'Налог', 'налог', 'В ближайший месяц налогов нет.')
  if (has(/аренд/)) return billAnswer(ev, 'Аренда', 'аренду', 'В ближайший месяц аренды не вижу.')
  if (has(/кредит|займ|ипотек/)) return billAnswer(ev, 'Кредит', 'кредит', 'Платежей по кредиту в ближайший месяц нет.')
  if (has(/себе|вывест|вывод|снять|забрать|дивиденд|потратить|свободн/)) return freeAnswer(ev)
  if (has(/что если|а если|сценари/)) {
    return viWidget('whatif')
  }
  if (has(/недел/)) return upcomingAnswer(ev, true)
  if (has(/платеж|платить|ближайш|впереди|счета/)) return upcomingAnswer(ev, false)
  // «насколько точен прогноз» — про точность, а не про статус: проверяем раньше
  if (has(/точн|точен|верить|довер|ошиба/)) return trustAnswer(ev)
  if (has(/хватит|хватает|разрыв|как дела|что с деньгами|прогноз|статус|ситуаци/)) return statusAnswer(ev)
  if (has(/куда уход|расход|трат|категор/)) return moneyAnswer(ev)
  if (has(/qr|кр-код|куар/)) return { text: 'Сфотографируйте QR-код со счёта — я сам достану сумму и получателя и поставлю платёж в прогноз.', actions: [{ label: 'Сканировать QR', sheet: 'qr' }] }
  if (has(/умеешь|можешь|помощ|кто ты|что ты/)) return { text: HELP_TEXT, actions: viSuggestions(ev).slice(0, 3).map((s) => ({ label: s, ask: s })) }

  return {
    text: 'Пока не понял вопрос. Я хорошо разбираюсь в платежах: спросите, хватит ли на зарплату, когда налог или сколько можно взять себе. А платёж можно записать фразой — «в пятницу куплю кофемашину за 150к».',
    actions: viSuggestions(ev).slice(0, 3).map((s) => ({ label: s, ask: s })),
  }
}

/** Что Vi разглядел в приложенном файле: счёт с платёжным QR-кодом, картинку без него, выписку 1С или что-то ещё. */
export type Attachment =
  | { name: string; kind: 'invoice'; qr: PayQr }
  | { name: string; kind: 'image' | 'statement' | 'other' }

/**
 * Ответ на приложенный файл. Счёт с QR — сразу ставим платёж в прогноз: получатель и сумма из кода,
 * день — из подписи к файлу («оплатить 30-го»), а без него — сегодня. Выписку — предлагаем подключить счётом.
 */
export function viFile(a: Attachment, text: string, ev: Evaluation): ViReply {
  if (a.kind !== 'invoice') {
    if (a.kind === 'image') {
      return { text: 'На картинке не нашёл платёжного QR-кода. Снимите счёт ближе, чтобы код был целиком, или отсканируйте его камерой.', actions: [{ label: 'Сканировать QR', sheet: 'qr' }] }
    }
    if (a.kind === 'statement') return { ...viWidget('newAccount'), text: 'Похоже на выписку. Подключите её счётом — загрузите файл здесь, и я пересчитаю прогноз:' }
    return { text: 'Пока я читаю только фото и скриншоты счетов с QR-кодом и выписки 1С в формате .txt.' }
  }
  const { qr } = a
  // «ООО «Ромашка»» — в названии уже есть кавычки, вторые не нужны
  const who = /[«"]/.test(qr.name) ? qr.name : `«${qr.name}»`
  if (!qr.sum) return { text: `Это счёт от ${who}, но суммы в QR-коде нет. Отсканируйте его — сумму впишете сами.`, actions: [{ label: 'Сканировать QR', sheet: 'qr' }] }
  const days = ev.data.forecast.days
  const asked = parsePhrase(text, ev.data.asOf).date
  const date = asked && days.includes(asked) ? asked : days[0]
  const id = `vi${Date.now()}`
  return {
    text: `Это счёт от ${who} на ${rub(qr.sum)}${qr.purpose ? ` — ${lower(qr.purpose)}` : ''}. Поставил оплату на ${fmtDay(date)}, прогноз уже обновил.`
      + (asked ? '' : ' Платить в другой день — приложите счёт ещё раз и напишите дату, например «оплатить 30-го».'),
    add: { id, date, amount: -qr.sum, cat: 'manual', kind: 'manual', title: qr.name, cp: qr.name, source: 'manual' },
    actions: [{ label: 'Отменить', undo: id }, { label: 'Хватает ли теперь?', ask: 'Хватит ли денег на платежи?' }],
    focus: 'added',
  }
}

const WIDGET_TEXT: Record<string, string> = {
  payments: 'Платежи на ближайшие 30 дней — списком или календарём:',
  whatif: 'Выберите сценарий — покажу, переживёт ли его бизнес:',
  money: 'Куда уходят деньги и откуда приходят — за 90 дней:',
  trust: 'Насколько можно верить прогнозу — я проверил себя на вашей истории:',
  settings: 'Настройки бизнеса — меняйте, прогноз сразу пересчитается:',
  newAccount: 'Подключим счёт: загрузите выписку в формате 1С или введите остаток вручную.',
  account: 'Вот этот счёт — можно поправить остаток или не учитывать его в прогнозе:',
}
const WIDGET_FOCUS: Record<string, ViCard> = { payments: 'bills', whatif: 'chart', trust: 'trust', newAccount: 'money', account: 'money' }

/** Показать раздел прямо в переписке: короткая фраза и сам раздел под ней. */
export function viWidget(w: ViWidget): ViReply {
  const key = w.startsWith('account:') ? 'account' : w
  return { text: WIDGET_TEXT[key], widget: w, focus: WIDGET_FOCUS[key] }
}

/** С чего начать разговор: когда денег не хватает — о главном, когда хватает — о свободных деньгах. */
export function viSuggestions(ev: Evaluation): string[] {
  return ev.status.tone === 'ok'
    ? ['Сколько я могу взять себе?', 'Когда ближайший налог?', 'Куда уходят деньги?', 'Добавить новый платёж']
    : ['Как успеть?', 'Хватит ли денег на зарплату?', 'Какие платежи на этой неделе?', 'Добавить новый платёж']
}
