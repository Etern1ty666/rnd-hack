import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { CompanyData, PlannedEvent } from './lib/types'
import { evaluate, HORIZON, incomeLine } from './lib/evaluate'
import { registerNames } from './lib/format'
import { defaultSettings, type BizSettings } from './lib/settings'
import { ForecastChart } from './components/ForecastChart'
import { StatusCard } from './components/StatusCard'
import { Bills } from './components/Bills'
import { Drawer } from './components/Drawer'
import { MoneyCalendar } from './components/MoneyCalendar'
import { WhatIf } from './components/WhatIf'
import { Hundred } from './components/Hundred'
import { Clients } from './components/Clients'
import { Trust } from './components/Trust'
import { AddEvent } from './components/AddEvent'
import { VoiceAssistant } from './components/VoiceAssistant'
import { Icon } from './components/Icon'
import { AccountList, TotalBlock } from './components/Summary'
import { AccountPage, NewAccount } from './components/AccountPages'
import { OpsDonut } from './components/OpsDonut'
import type { Account } from './lib/settings'
import { Settings } from './components/Settings'
import { ALL, BizSwitcher } from './components/BizSwitcher'
import { Overview } from './components/Overview'
import { AddBusiness } from './components/AddBusiness'
import type { Answers } from './lib/confirm'
import C047 from './data/C047.json'
import C065 from './data/C065.json'
import C140 from './data/C140.json'

/** Демо-выписки из датасета, которые можно «подключить» как бизнес. */
const DEMO: Record<string, CompanyData> = {
  C140: C140 as unknown as CompanyData,
  C047: C047 as unknown as CompanyData,
  C065: C065 as unknown as CompanyData,
}

/** Разделы приложения: «Главное» — коротко, всё остальное — на своих страницах. */
type Tab = 'main' | 'voice' | 'payments' | 'whatif' | 'money' | 'trust'
const TABS: { id: Tab; title: string }[] = [
  { id: 'main', title: 'Главное' },
  { id: 'voice', title: 'Vi' },
  { id: 'payments', title: 'Платежи' },
  { id: 'whatif', title: 'Что если' },
  { id: 'money', title: 'Расходы' },
  { id: 'trust', title: 'Точность' },
]
type Page = Tab | 'settings' | 'newAccount' | 'newBusiness' | `account:${string}`

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* приватный режим — не страшно */ }
}

// распознавание QR тяжёлое и нужно редко — грузим, когда открыли панель
const QrPay = lazy(() => import('./components/QrPay').then((m) => ({ default: m.QrPay })))

const NO_STEPS = new Set<string>()
const DESKTOP = '(min-width: 1024px)'

/** Десктоп и телефон — разные раскладки: на широком экране две колонки. */
function useDesktop() {
  const [on, setOn] = useState(() => window.matchMedia(DESKTOP).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP)
    const fn = () => setOn(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return on
}

export default function App() {
  const desktop = useDesktop()
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
  const settingsOf = (id: string) => settingsMap[id] ?? load(`settings:${id}`, defaultSettings(companies[id]))
  const manualOf = (id: string) => manualMap[id] ?? load<PlannedEvent[]>(`manual:${id}`, [])
  // ответы на прежние «догадки» продолжают уточнять прогноз
  const answersOf = (id: string) => load<Answers>(`answers:${id}`, {})
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [page, setPage] = useState<Page>('main')
  // панели добавления: фразой или по QR-коду со счёта
  const [sheet, setSheet] = useState<null | 'add' | 'qr'>(null)
  const [payView, setPayView] = useState<'list' | 'cal'>('list')

  // выбранный бизнес мог быть удалён; «все» имеет смысл только для двух и больше
  const cur = view === ALL && bizIds.length > 1 ? ALL : bizIds.includes(view) ? view : bizIds[0]

  useEffect(() => {
    save('company', cur)
    save('businesses', bizIds)
  }, [cur, bizIds])

  const select = (id: string) => {
    setView(id)
    setApplied(new Set())
    setPage('main')
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

  const switcherItems = bizIds.map((id) => ({
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

  const accountsSave = (accounts: Account[]) => settings && saveSettings(cur, { ...settings, accounts })
  const account = page.startsWith('account:') && settings ? settings.accounts.find((a) => a.id === page.slice(8)) : undefined
  const go = (p: Page) => { setPage(p); window.scrollTo({ top: 0 }) }

  let content: React.ReactNode = null
  if (page === 'newBusiness') {
    content = (
      <div className="page-narrow">
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
  } else if (ev && settings) {
    if (page === 'settings') {
      content = (
        <Settings
          s={settings} onChange={(s) => saveSettings(cur, s)} taxes={ev.sim.events.filter((e) => e.cat === 'tax')}
          onReset={() => saveSettings(cur, defaultSettings(companies[cur]))}
          onRemove={bizIds.length > 1 ? () => removeBiz(cur) : undefined}
        />
      )
    } else if (page === 'newAccount') {
      content = <NewAccount onAdd={(a) => { accountsSave([...settings.accounts, a]); go(`account:${a.id}`) }} />
    } else if (account) {
      content = (
        <AccountPage
          a={account} asOf={companies[cur].asOf}
          onChange={(patch) => accountsSave(settings.accounts.map((x) => (x.id === account.id ? { ...x, ...patch } : x)))}
          onDelete={account.main ? undefined : () => { accountsSave(settings.accounts.filter((x) => x.id !== account.id)); go('main') }}
        />
      )
    } else if (page === 'payments') {
      content = (
        <>
          <div className="page-head">
            <h1 className="page-title">Платежи</h1>
            <div className="seg">
              <button className={payView === 'list' ? 'on' : ''} onClick={() => setPayView('list')}>Список</button>
              <button className={payView === 'cal' ? 'on' : ''} onClick={() => setPayView('cal')}>Календарь</button>
            </div>
          </div>
          {payView === 'list'
            ? <Bills bills={ev.bills} title="На ближайшие 30 дней" income={incomeLine(ev.data, ev.sim)} onAdd={() => setSheet('add')} />
            : <section className="card-block"><MoneyCalendar data={ev.data} sim={ev.sim} minEvent={ev.minEvent} /></section>}
        </>
      )
    } else if (page === 'whatif') {
      content = (
        <>
          <h1 className="page-title">А что если</h1>
          <section className="card-block"><WhatIf data={ev.data} baseMods={ev.mods} baseSim={ev.sim} baseVerdict={ev.now} horizon={HORIZON} /></section>
        </>
      )
    } else if (page === 'money') {
      content = (
        <>
          <h1 className="page-title">Расходы и поступления</h1>
          <OpsDonut data={ev.data} />
          <div className="two-cards">
            <section className="card-block"><Hundred data={ev.data} /></section>
            {ev.data.clients.some((c) => c.delays.length >= 3) && <section className="card-block"><Clients data={ev.data} /></section>}
          </div>
        </>
      )
    } else if (page === 'voice') {
      content = (
        <VoiceAssistant
          ev={ev} onGo={go}
          onAdd={(e) => saveManual(cur, [...manualOf(cur), e])}
          onRemove={(id) => saveManual(cur, manualOf(cur).filter((m) => m.id !== id))}
        />
      )
    } else if (page === 'trust') {
      content = (
        <>
          <h1 className="page-title">Точность прогноза</h1>
          <section className="card-block"><Trust data={ev.data} sim={ev.sim} /></section>
        </>
      )
    } else {
      content = (
        <>
          <div className="tiles">
            <button onClick={() => setSheet('add')}><Icon name="plus" size={26} /><span>Добавить<br />платёж</span></button>
            <button onClick={() => setSheet('qr')}><Icon name="qr" size={26} /><span>Сканировать<br />QR</span></button>
            <button onClick={() => go('voice')}><Icon name="mic" size={26} /><span>Сказать<br />голосом</span></button>
            <button onClick={() => go('newAccount')}><Icon name="doc" size={26} /><span>Загрузить<br />выписку</span></button>
          </div>

          <StatusCard ev={ev} applied={applied} onToggle={toggle} />

          <OpsDonut data={ev.data} />

          <section className="card-block">
            <div className="card-head">
              <h2>Деньги на месяц вперёд</h2>
              <button className="link" onClick={() => go('payments')}>Все платежи <Icon name="arrow" size={16} /></button>
            </div>
            <ForecastChart
              asOf={ev.data.asOf} balanceNow={ev.data.balanceNow} history={ev.data.history} sim={ev.sim} horizon={HORIZON}
              histDays={desktop ? 14 : 7} height={desktop ? 300 : 220}
            />
          </section>
        </>
      )
    }
  }

  const sideTotal = cur === ALL ? bizIds.reduce((s, id) => s + evals[id].total, 0) : ev?.total ?? 0
  const sideFree = cur === ALL ? bizIds.reduce((s, id) => s + evals[id].free, 0) : ev?.free ?? 0
  const isTab = TABS.some((t) => t.id === page)

  return (
    <>
      <header className="col top-row">
        <BizSwitcher items={switcherItems} current={cur} onSelect={select} onAdd={() => go('newBusiness')} />
        {cur !== ALL && page !== 'newBusiness' && (
          <nav className="tabs">
            {TABS.map((t) => <button key={t.id} className={page === t.id ? 'on' : ''} onClick={() => go(t.id)}>{t.title}</button>)}
          </nav>
        )}
        {cur !== ALL && (
          <button className={`icon-btn gear ${page === 'settings' ? 'on' : ''}`} onClick={() => go(page === 'settings' ? 'main' : 'settings')} aria-label="Настройки бизнеса">
            <Icon name="gear" size={22} stroke={1.8} />
          </button>
        )}
      </header>

      <main className={`col layout ${page === 'main' || cur === ALL ? '' : 'inner'} ${page === 'voice' && cur !== ALL ? 'fill' : ''}`} key={cur}>
        <aside className="side">
          <TotalBlock total={sideTotal} free={sideFree} label={cur === ALL ? 'Всего во всех бизнесах' : 'Всего на счетах'} />
          {cur === ALL ? (
            <div className="acc-list">
              {bizIds.map((id) => (
                <button key={id} className="acc-item" onClick={() => select(id)}>
                  <span className={`tone-dot ${evals[id].status.tone}`} />
                  <span className="acc-item-text">
                    <b className="num">{compactRub(evals[id].total)}</b>
                    <span>{settingsOf(id).name}</span>
                    <small>{evals[id].status.title}</small>
                  </span>
                </button>
              ))}
              <button className="acc-new" onClick={() => go('newBusiness')}><Icon name="plus" size={18} stroke={2} /> Новый бизнес</button>
            </div>
          ) : settings && (
            <AccountList
              accounts={settings.accounts} asOf={companies[cur].asOf} selected={account?.id}
              onOpen={(id) => go(`account:${id}`)} onNew={() => go('newAccount')}
            />
          )}
        </aside>
        <section className={`content ${isTab ? '' : 'page'}`}>
          {!isTab && cur !== ALL && page !== 'newBusiness' && (
            <button className="back" onClick={() => go('main')}><Icon name="arrow" size={18} className="flip" /> Главное</button>
          )}
          {page === 'newBusiness' && (
            <button className="back" onClick={() => go('main')}><Icon name="arrow" size={18} className="flip" /> Назад</button>
          )}
          {content}
        </section>
      </main>

      {ev && sheet === 'add' && (
        <Drawer title="Что ожидается?" onClose={() => setSheet(null)}>
          <AddEvent
            today={ev.data.asOf} days={ev.data.forecast.days} horizon={HORIZON} items={manualOf(cur)}
            onAdd={(e) => saveManual(cur, [...manualOf(cur), e])}
            onRemove={(id) => saveManual(cur, manualOf(cur).filter((m) => m.id !== id))}
          />
        </Drawer>
      )}
      {ev && sheet === 'qr' && (
        <Drawer title="Сканировать QR" onClose={() => setSheet(null)}>
          <Suspense fallback={null}>
            <QrPay days={ev.data.forecast.days} onAdd={(e) => saveManual(cur, [...manualOf(cur), e])} onClose={() => setSheet(null)} />
          </Suspense>
        </Drawer>
      )}
    </>
  )
}

function compactRub(v: number) {
  return `${Math.round(v).toLocaleString('ru-RU')}\u00a0₽`
}
