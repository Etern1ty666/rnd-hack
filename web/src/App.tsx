import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { CompanyData, PlannedEvent } from './lib/types'
import { evaluate, HORIZON } from './lib/evaluate'
import { registerNames } from './lib/format'
import { defaultSettings, type Account, type BizSettings } from './lib/settings'
import { load, save } from './lib/store'
import type { Answers } from './lib/confirm'
import type { ViCard, ViMsg, ViWidget } from './lib/vi'
import { Drawer } from './components/Drawer'
import { PaymentsWidget } from './components/PaymentsWidget'
import { WhatIf } from './components/WhatIf'
import { Hundred } from './components/Hundred'
import { Clients } from './components/Clients'
import { Trust } from './components/Trust'
import { AddEvent } from './components/AddEvent'
import { Icon } from './components/Icon'
import { AccountPage, NewAccount } from './components/AccountPages'
import { OpsDonut } from './components/OpsDonut'
import { Settings } from './components/Settings'
import { Overview } from './components/Overview'
import { AddBusiness } from './components/AddBusiness'
import { ALL, FREE, Sidebar, type ChatMeta, type ChatRef } from './components/Sidebar'
import { BizCard } from './components/BizCard'
import { ViChat, type ViCommand } from './components/ViChat'
import { InfoPanel, type Focus } from './components/InfoPanel'
import { CardStack, Row } from './components/CardStack'
import C047 from './data/C047.json'
import C065 from './data/C065.json'
import C140 from './data/C140.json'

/** Демо-выписки из датасета, которые можно «подключить» как бизнес. */
const DEMO: Record<string, CompanyData> = {
  C140: C140 as unknown as CompanyData,
  C047: C047 as unknown as CompanyData,
  C065: C065 as unknown as CompanyData,
}

/** Всё о бизнесе — в разговоре с Vi: разделы он показывает прямо в переписке. Отдельная страница — только новый бизнес. */
type Page = 'chat' | 'newBusiness'

// распознавание QR тяжёлое и нужно редко — грузим, когда открыли панель
const QrPay = lazy(() => import('./components/QrPay').then((m) => ({ default: m.QrPay })))

const NO_STEPS = new Set<string>()
const newChat = (): ChatMeta => ({ id: `c${Date.now().toString(36)}`, title: '', at: Date.now() })
const chatTitle = (text: string) => (text.length > 48 ? `${text.slice(0, 46).trimEnd()}…` : text)

/**
 * Чаты группы: бизнеса или «без группы» (FREE). Группа может быть и пустой.
 * Переписку из прошлой версии (одна на бизнес) превращаем в первый чат его группы.
 */
const chatCache = new Map<string, ChatMeta[]>()
function loadChats(g: string): ChatMeta[] {
  const known = chatCache.get(g) ?? load<ChatMeta[] | null>(`chats:${g}`, null)
  if (known) {
    chatCache.set(g, known)
    return known
  }
  const old = g === FREE ? [] : load<ViMsg[]>(`chat:${g}`, [])
  if (old.length) save(`chat:${g}:c0`, old)
  const list = old.length ? [{ id: 'c0', title: chatTitle(old.find((m) => m.role === 'user')?.text ?? ''), at: Date.now() }] : []
  chatCache.set(g, list)
  save(`chats:${g}`, list)
  return list
}

function useMedia(query: string) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setOn(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return on
}

export default function App() {
  // три колонки, как у Claude: меню видно от 900 px, сводка справа — от 1200 px; уже — выезжают по кнопкам
  const roomy = useMedia('(min-width: 900px)')
  const wide = useMedia('(min-width: 1200px)')
  // бизнесы из загруженных выписок живут в браузере пользователя
  const [uploads, setUploads] = useState<Record<string, CompanyData>>(() => load('uploads', {}))
  const companies = useMemo(() => ({ ...DEMO, ...uploads }), [uploads])
  const [bizIds, setBizIds] = useState<string[]>(() => {
    const known = { ...DEMO, ...load<Record<string, CompanyData>>('uploads', {}) }
    const ids = load<string[]>('businesses', ['C140']).filter((id) => id in known)
    return ids.length ? ids : ['C140']
  })
  const [view, setView] = useState<string>(() => load('company', 'C140'))
  const [settingsMap, setSettingsMap] = useState<Record<string, BizSettings>>({})
  const [manualMap, setManualMap] = useState<Record<string, PlannedEvent[]>>({})
  const settingsOf = (id: string): BizSettings => {
    const s = settingsMap[id] ?? load(`settings:${id}`, defaultSettings(companies[id]))
    // раньше систему налогов можно было не выбирать — такие настройки читаем как УСН «Доходы»
    return (s.regime as string) === 'auto' ? { ...s, regime: 'usn6' } : s
  }
  const manualOf = (id: string) => manualMap[id] ?? load<PlannedEvent[]>(`manual:${id}`, [])
  // ответы на прежние «догадки» продолжают уточнять прогноз
  const answersOf = (id: string) => load<Answers>(`answers:${id}`, {})
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [page, setPage] = useState<Page>('chat')
  // панели добавления: фразой или по QR-коду со счёта
  const [sheet, setSheet] = useState<null | 'add' | 'qr'>(null)
  // карточка справа, о которой только что сказал Vi
  const [focus, setFocus] = useState<Focus | null>(null)
  const [infoSheet, setInfoSheet] = useState(false)
  const [infoNew, setInfoNew] = useState(false)
  const [navSheet, setNavSheet] = useState(false)
  // левое меню можно свернуть; помним между заходами
  const [navHidden, setNavHidden] = useState<boolean>(() => load('nav:hidden', false))
  useEffect(() => save('nav:hidden', navHidden), [navHidden])
  const [navPeek, setNavPeek] = useState(false)
  const peekTimer = useRef(0)
  useEffect(() => () => clearTimeout(peekTimer.current), [])
  // курсор над свёрнутым меню (или его кнопкой); в меню открыто меню чата — не прячем, даже если курсор ушёл
  const peekHover = useRef(false)
  const peekHeld = useRef(false)
  // свернули меню, а курсор так и остался на кнопке — не выдвигаем, пока курсор не уведут с кнопки и не вернут
  const peekArmed = useRef(true)
  // ссылки справа («Все платежи», счёт, «Новый счёт»…) — команда чату показать раздел
  const [viCmd, setViCmd] = useState<ViCommand | null>(null)

  // выбранный бизнес мог быть удалён; «все» имеет смысл только для двух и больше
  const cur = view === ALL && bizIds.length > 1 ? ALL : bizIds.includes(view) ? view : bizIds[0]

  // чаты с Vi группами: у каждого бизнеса свои и общие «без группы» (FREE); свежие сверху
  const [chatsMap, setChatsMap] = useState<Record<string, ChatMeta[]>>({})
  // последний открытый чат в каждом бизнесе и открытый сейчас (помним между заходами)
  const [chatCur, setChatCur] = useState<Record<string, string>>({})
  const [opened, setOpened] = useState<ChatRef | null>(() => load('nav:open', null))
  useEffect(() => save('nav:open', opened), [opened])
  const chatsOf = (g: string) => chatsMap[g] ?? loadChats(g)
  const saveChats = (g: string, list: ChatMeta[]) => {
    const sorted = [...list].sort((a, b) => b.at - a.at)
    chatCache.set(g, sorted)
    setChatsMap((m) => ({ ...m, [g]: sorted }))
    save(`chats:${g}`, sorted)
  }
  const has = (r: ChatRef | null): r is ChatRef => !!r && chatsOf(r.g).some((c) => c.id === r.id)
  // чатов нет совсем — открыт черновик без группы: в списке он появится с первым сообщением
  const draft = useRef(newChat().id)
  // какой чат в центре: открытый, если он этого бизнеса или без группы; иначе последний в бизнесе; иначе первый без группы
  const lastIn: ChatRef = { g: cur, id: chatCur[cur] }
  const at: ChatRef | null = cur === ALL ? null
    : has(opened) && (opened.g === FREE || opened.g === cur) ? opened
      : has(lastIn) ? lastIn
        : chatsOf(cur)[0] ? { g: cur, id: chatsOf(cur)[0].id }
          : chatsOf(FREE)[0] ? { g: FREE, id: chatsOf(FREE)[0].id }
            : { g: FREE, id: draft.current }

  useEffect(() => {
    save('company', cur)
    save('businesses', bizIds)
  }, [cur, bizIds])

  const go = (p: Page) => {
    setPage(p)
    setNavSheet(false)
    setInfoSheet(false)
  }
  const select = (id: string) => {
    setView(id)
    setApplied(new Set())
    setFocus(null)
    go('chat')
  }
  // чат бизнеса открывает и сам бизнес; чат без группы — про бизнес, выбранный сейчас (в сводке по всем — первый)
  const openChat = (g: string, id: string) => {
    setOpened({ g, id })
    if (g !== FREE) setChatCur((m) => ({ ...m, [g]: id }))
    const biz = g !== FREE ? g : cur === ALL ? bizIds[0] : cur
    if (biz !== cur) select(biz)
    else go('chat')
  }
  // новый чат не плодим: если в этой группе уже есть пустой — просто возвращаемся в него
  const startChat = (g: string) => {
    const list = chatsOf(g)
    const empty = list.find((c) => !c.title)
    if (empty) return openChat(g, empty.id)
    const c = newChat()
    saveChats(g, [c, ...list])
    openChat(g, c.id)
  }
  const renameChat = (g: string, id: string, title: string) => {
    saveChats(g, chatsOf(g).map((c) => (c.id === id ? { ...c, title } : c)))
  }
  const deleteChat = (g: string, id: string) => {
    try { localStorage.removeItem(`chat:${g}:${id}`) } catch { /* приватный режим */ }
    saveChats(g, chatsOf(g).filter((c) => c.id !== id))
  }
  // в другую группу чат переезжает вместе с перепиской; открытый — открываем и там
  const moveChat = (g: string, id: string, to: string) => {
    const c = chatsOf(g).find((x) => x.id === id)
    if (!c || g === to) return
    // старые чаты из прошлой версии у всех бизнесов называются c0 — в новой группе id не должен совпасть
    const moved = chatsOf(to).some((x) => x.id === id) ? { ...c, id: newChat().id } : c
    const msgs = load<ViMsg[] | null>(`chat:${g}:${id}`, null)
    if (msgs) save(`chat:${to}:${moved.id}`, msgs)
    try { localStorage.removeItem(`chat:${g}:${id}`) } catch { /* приватный режим */ }
    saveChats(g, chatsOf(g).filter((x) => x.id !== id))
    saveChats(to, [moved, ...chatsOf(to)])
    if (at && at.g === g && at.id === id && page === 'chat') openChat(to, moved.id)
  }
  const chatSent = (text: string) => {
    if (!at) return
    const list = chatsOf(at.g)
    if (list.some((c) => c.id === at.id)) {
      saveChats(at.g, list.map((c) => (c.id === at.id ? { ...c, title: c.title || chatTitle(text), at: Date.now() } : c)))
      return
    }
    // черновик стал чатом: появляется в списке без группы
    saveChats(at.g, [{ id: at.id, title: chatTitle(text), at: Date.now() }, ...list])
    setOpened(at)
    draft.current = newChat().id
  }
  const addBiz = (id: string) => {
    setBizIds([...bizIds, id])
    select(id)
  }
  const addUploaded = (data: CompanyData) => {
    const next = { ...uploads, [data.company.id]: data }
    setUploads(next)
    save('uploads', next)
    addBiz(data.company.id)
  }
  const removeBiz = (id: string) => {
    setBizIds(bizIds.filter((b) => b !== id))
    select(bizIds.find((b) => b !== id)!)
    if (id in uploads) {
      const { [id]: _gone, ...rest } = uploads
      void _gone
      setUploads(rest)
      save('uploads', rest)
    }
  }
  const saveSettings = (id: string, next: BizSettings) => {
    setSettingsMap({ ...settingsMap, [id]: next })
    save(`settings:${id}`, next)
  }
  const saveManual = (id: string, list: PlannedEvent[]) => {
    setManualMap({ ...manualMap, [id]: list })
    save(`manual:${id}`, list)
  }

  const evals = useMemo(
    () => Object.fromEntries(bizIds.map((id) => [id, evaluate(companies[id], settingsOf(id), manualOf(id), id === cur ? applied : NO_STEPS, answersOf(id))])),
    [bizIds, settingsMap, manualMap, applied, cur, companies], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shown = cur === ALL ? bizIds : [cur]
  registerNames(shown.flatMap((id) => [...companies[id].clients.map((c) => c.name), ...companies[id].events.map((e) => e.cp)]))

  const bizItems = bizIds.map((id) => ({
    id, name: settingsOf(id).name, industry: settingsOf(id).industry, tone: evals[id].status.tone,
  }))

  const toggle = (id: string) => {
    const next = new Set(applied)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setApplied(next)
  }

  const ev = cur === ALL ? null : evals[cur]
  const settings = cur === ALL ? null : settingsOf(cur)
  const available = Object.keys(DEMO).filter((id) => !bizIds.includes(id))
  const addManual = (e: PlannedEvent) => saveManual(cur, [...manualOf(cur), e])
  const removeManual = (id: string) => saveManual(cur, manualOf(cur).filter((m) => m.id !== id))

  const accountsSave = (accounts: Account[]) => settings && saveSettings(cur, { ...settings, accounts })

  const infoVisible = wide
  const onFocus = (card: ViCard) => {
    setFocus({ card, n: Date.now() })
    if (!infoVisible) setInfoNew(true)
  }
  const show = (widget: ViWidget, label: string) => {
    setViCmd({ n: Date.now(), widget, label })
    go('chat')
  }

  /** Раздел под ответом Vi — живой: считается из текущего прогноза и настроек, а не сохраняется картинкой. */
  const renderWidget = (w: ViWidget): React.ReactNode => {
    if (!ev || !settings) return null
    if (w === 'payments') return <PaymentsWidget ev={ev} onAdd={() => setSheet('add')} />
    if (w === 'whatif') return <WhatIf data={ev.data} baseMods={ev.mods} baseSim={ev.sim} baseVerdict={ev.now} horizon={HORIZON} />
    if (w === 'trust') return <Trust data={ev.data} sim={ev.sim} />
    if (w === 'money') {
      return (
        <>
          <OpsDonut data={ev.data} />
          <Hundred data={ev.data} />
          {ev.data.clients.some((c) => c.delays.length >= 3) && <Clients data={ev.data} />}
        </>
      )
    }
    if (w === 'settings') {
      return (
        <Settings
          s={settings} onChange={(s) => saveSettings(cur, s)} taxes={ev.sim.events.filter((e) => e.cat === 'tax')}
          onReset={() => saveSettings(cur, defaultSettings(companies[cur]))}
          onRemove={bizIds.length > 1 ? () => removeBiz(cur) : undefined}
        />
      )
    }
    if (w === 'newAccount') return <NewAccount onAdd={(a) => { accountsSave([...settings.accounts, a]); show(`account:${a.id}`, `Счёт «${a.name}»`) }} />
    const a = settings.accounts.find((x) => w === `account:${x.id}`)
    if (!a) return <p className="muted">Этого счёта больше нет.</p>
    return (
      <AccountPage
        a={a} asOf={companies[cur].asOf}
        onChange={(patch) => accountsSave(settings.accounts.map((x) => (x.id === a.id ? { ...x, ...patch } : x)))}
        onDelete={a.main ? undefined : () => accountsSave(settings.accounts.filter((x) => x.id !== a.id))}
      />
    )
  }

  const back = <button className="back" onClick={() => go('chat')}><Icon name="arrow" size={18} className="flip" /> К чату</button>

  // новый бизнес — единственная отдельная страница; в сводке по всем — обзор
  let content: React.ReactNode = null
  if (page === 'newBusiness') {
    content = (
      <div className="page-narrow">
        {cur !== ALL && back}
        <h1 className="page-title">Новый бизнес</h1>
        <AddBusiness
          demos={available.map((id) => {
            const d = defaultSettings(DEMO[id])
            return { id, name: d.name, hint: `${d.industry} · ${d.form}` }
          })}
          onAddDemo={addBiz}
          onUploaded={addUploaded}
        />
      </div>
    )
  } else if (cur === ALL) {
    content = <Overview items={bizIds.map((id) => ({ id, name: settingsOf(id).name, ev: evals[id] }))} />
  }

  // меню видно, если экран позволяет и его не свернули; иначе в левом верхнем углу — кнопка развернуть
  const navShown = roomy && !navHidden
  // свёрнутое меню: навели на кнопку — показываем поверх страницы, пока курсор над кнопкой или меню; нажали — закрепляем
  const peekOn = roomy && navHidden && navPeek
  const peek = (on: boolean) => {
    clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setNavPeek(on), on ? 120 : 280)
  }
  const hover = roomy && navHidden ? {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || !peekArmed.current) return
      peekHover.current = true
      peek(true)
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      peekArmed.current = true
      peekHover.current = false
      if (!peekHeld.current) peek(false)
    },
  } : {}
  // меню чата закрыли, а курсора над меню уже нет — теперь можно и спрятать
  const holdPeek = (held: boolean) => {
    peekHeld.current = held
    if (!held && !peekHover.current) peek(false)
  }
  const pin = () => {
    clearTimeout(peekTimer.current)
    setNavPeek(false)
    setNavHidden(false)
  }
  const menuBtn = !navShown && (
    <button
      className="icon-btn nav-toggle" onClick={() => (roomy ? pin() : setNavSheet(true))} {...hover}
      aria-label={roomy ? 'Закрепить меню' : 'Открыть меню'} title={roomy ? 'Закрепить меню' : 'Открыть меню'}
    >
      <Icon name="sidebar" size={20} />
    </button>
  )
  const infoBtn = !wide && (
    <button className={`icon-btn info-btn ${infoNew ? 'dot' : ''}`} aria-label="Сводка" title="Сводка" onClick={() => { setInfoNew(false); setInfoSheet(true) }}>
      <Icon name="panel" size={20} />
    </button>
  )
  // сверху ничего нет; только кнопка развернуть меню (когда оно свёрнуто или экран узкий) и сводки (на узком).
  // На широком экране кнопки висят поверх страницы и не сдвигают переписку; кнопка меню — выше выехавшего меню,
  // поэтому под курсором всё время одна и та же кнопка
  const bar = (menuBtn || infoBtn) ? <div className={`center-bar ${roomy ? 'float' : ''}`}>{menuBtn}<span className="grow" />{infoBtn}</div> : null

  // одно и то же меню: колонкой, выезжающее на телефоне или поверх страницы по наведению
  const sidebar = (pinned: boolean) => (
    <Sidebar
      items={bizItems} current={cur} chats={Object.fromEntries([FREE, ...bizIds].map((g) => [g, chatsOf(g)]))}
      open={page === 'chat' && at ? at : undefined}
      pinned={pinned}
      onCollapse={() => {
        if (!roomy) return setNavSheet(false)
        peekArmed.current = false
        setNavHidden(true)
      }}
      onNew={(g) => { startChat(g); if (!pinned) setNavPeek(false) }}
      onOpen={(g, id) => { openChat(g, id); if (!pinned) setNavPeek(false) }}
      onRename={renameChat} onDelete={deleteChat} onMove={moveChat}
      onBusy={pinned ? undefined : holdPeek}
    />
  )

  const bizCard = (
    <BizCard
      items={bizItems} current={cur} onSelect={select} onAdd={() => go('newBusiness')}
      edit={settings ? {
        form: settings.form, regime: settings.regime,
        onRename: (name) => saveSettings(cur, { ...settings, name }),
        onRegime: (regime) => saveSettings(cur, { ...settings, regime }),
      } : undefined}
    />
  )

  const info = ev && settings ? (
    <InfoPanel
      key={cur} bizId={cur} biz={bizCard} bizName={settings.name} ev={ev} accounts={settings.accounts} manual={manualOf(cur)} focus={focus}
      onShow={show} onRemoveManual={removeManual}
    />
  ) : (
    <CardStack cards={[
      { id: 'biz', title: 'Бизнес', body: bizCard },
      {
        id: 'all',
        title: 'Все бизнесы',
        body: (
          <>
            <Row icon="bank" end={<b className="num">{compactRub(bizIds.reduce((s, id) => s + evals[id].total, 0))}</b>}>Всего</Row>
            <Row icon="cash" end={<b className="num pos">{compactRub(bizIds.reduce((s, id) => s + evals[id].free, 0))}</b>}>Свободно</Row>
            {bizIds.map((id) => (
              <Row key={id} lead={<span className={`tone-dot ${evals[id].status.tone}`} />} onClick={() => select(id)} end={<span className="num">{compactRub(evals[id].total)}</span>}>
                {settingsOf(id).name}
                <small>{evals[id].status.title}</small>
              </Row>
            ))}
          </>
        ),
      },
    ]} />
  )

  return (
    <>
      <div className={`shell ${navShown ? 'with-nav' : ''} ${infoVisible ? 'with-info' : ''}`}>
        {navShown && <aside className="nav-col">{sidebar(true)}</aside>}

        {ev && settings && at ? (
          <ViChat
            key={`vi:${at.g}:${at.id}`} ev={ev} group={at.g} page={page} chatId={at.id}
            view={page === 'chat' ? null : content} applied={applied} roomy={roomy} bar={bar} onSent={chatSent}
            onToggle={toggle} onAdd={addManual} onRemove={removeManual}
            renderWidget={renderWidget} command={viCmd} onSheet={setSheet} onShowChat={() => go('chat')} onFocus={onFocus}
          />
        ) : (
          <section className="center">
            {bar}
            <div className="center-scroll"><div className="center-page content">{content}</div></div>
          </section>
        )}

        {infoVisible && <aside className="info-col">{info}</aside>}
      </div>

      {!roomy && navSheet && (
        <div className="nav-sheet" role="dialog" aria-modal="true" aria-label="Меню">
          <div className="drawer-backdrop" onClick={() => setNavSheet(false)} />
          <aside>{sidebar(true)}</aside>
        </div>
      )}
      {peekOn && <aside className="nav-peek" {...hover}>{sidebar(false)}</aside>}
      {!infoVisible && infoSheet && <Drawer title="Сводка" onClose={() => setInfoSheet(false)}>{info}</Drawer>}

      {ev && sheet === 'add' && (
        <Drawer title="Что ожидается?" onClose={() => setSheet(null)}>
          <AddEvent today={ev.data.asOf} days={ev.data.forecast.days} horizon={HORIZON} items={manualOf(cur)} onAdd={addManual} onRemove={removeManual} />
        </Drawer>
      )}
      {ev && sheet === 'qr' && (
        <Drawer title="Сканировать QR" onClose={() => setSheet(null)}>
          <Suspense fallback={null}>
            <QrPay days={ev.data.forecast.days} onAdd={addManual} onClose={() => setSheet(null)} />
          </Suspense>
        </Drawer>
      )}
    </>
  )
}

function compactRub(v: number) {
  return `${Math.round(v).toLocaleString('ru-RU')}\u00a0₽`
}
