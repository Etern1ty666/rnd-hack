import { useRef, useState } from 'react'
import { BANKS, bankById, type BankId } from '../lib/banks'
import type { Account } from '../lib/settings'
import { decode1c, parse1c } from '../lib/engine/parse1c'
import { fmtDay, rubK } from '../lib/format'
import { BankBadge } from './BankBadge'
import { Icon } from './Icon'

/** Страница одного счёта: название, остаток, учитывать ли в прогнозе. */
export function AccountPage({ a, asOf, onChange, onDelete }: {
  a: Account
  asOf: string
  onChange: (patch: Partial<Account>) => void
  onDelete?: () => void
}) {
  const bank = bankById(a.bank)
  const fromStatement = a.main || a.source === 'statement'
  return (
    <div className="page-narrow">
      <div className="acc-head">
        <BankBadge bank={a.bank} size={56} round />
        <div>
          <h1 className="page-title">{rubK(a.balance)}</h1>
          <span className="muted">{bank.name}{a.last4 ? ` · счёт •${a.last4}` : ''}</span>
        </div>
      </div>

      <div className="card-list">
        <label className="field">
          <span>Название</span>
          <input value={a.name} onChange={(e) => onChange({ name: e.target.value })} disabled={a.main} />
        </label>
        <label className="field">
          <span>Остаток</span>
          {fromStatement ? (
            <b className="num">{rubK(a.balance)}</b>
          ) : (
            <input type="number" step={0.01} value={a.balance} onChange={(e) => onChange({ balance: Math.round(+e.target.value * 100) / 100 })} />
          )}
        </label>
        <div className="field">
          <span>Учитывать в прогнозе</span>
          <button className={`toggle ${a.inForecast ? 'on' : ''}`} onClick={() => onChange({ inForecast: !a.inForecast })} aria-pressed={a.inForecast} aria-label="Учитывать в прогнозе" />
        </div>
        <div className="field">
          <span>Откуда данные</span>
          <span className="muted">{a.main ? `выписка с операциями по ${fmtDay(asOf)}` : fromStatement ? `остаток из выписки на ${fmtDay(a.asOf ?? asOf)}` : 'остаток вручную'}</span>
        </div>
      </div>
      {a.main && <p className="set-note">По этому счёту есть все операции — на них строится прогноз.</p>}
      {onDelete && <button className="link danger-link" style={{ marginTop: 24 }} onClick={onDelete}>Удалить счёт</button>}
    </div>
  )
}

const SAMPLES: Partial<Record<BankId, string>> = { centrinvest: '/samples/centrinvest_1c.txt', sber: '/samples/sber_1c.txt' }

/** Новый счёт: выбрать банк → загрузить выписку или ввести остаток. */
export function NewAccount({ onAdd }: { onAdd: (a: Account) => void }) {
  const [bank, setBank] = useState<BankId | null>(null)
  const [mode, setMode] = useState<'file' | 'manual'>('file')
  const [name, setName] = useState('')
  const [balance, setBalance] = useState(0)
  const [found, setFound] = useState<{ balance: number; last4: string; asOf: string; ops: number } | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const read = async (bytes: Promise<ArrayBuffer>) => {
    try {
      setError('')
      const st = parse1c(decode1c(new Uint8Array(await bytes)))
      const net = st.ops.reduce((s, o) => s + (o.dir === 'in' ? o.amount : -o.amount), 0)
      const closing = st.closing ?? (st.opening != null ? st.opening + net : null)
      if (closing == null) throw new Error('В выписке нет остатка на конец периода.')
      setFound({ balance: closing, last4: st.accounts[0]?.slice(-4) ?? '', asOf: st.to, ops: st.ops.length })
    } catch (e) {
      setFound(null)
      setError(e instanceof Error ? e.message : 'Не получилось прочитать файл.')
    }
  }

  const add = () => {
    if (!bank) return
    const base = { id: `acc${Date.now()}`, bank, inForecast: true }
    if (mode === 'file' && found) {
      onAdd({ ...base, name: name.trim() || 'Расчётный счёт', balance: Math.round(found.balance * 100) / 100, last4: found.last4, source: 'statement', asOf: found.asOf })
    } else if (mode === 'manual') {
      onAdd({ ...base, name: name.trim() || (bank === 'cash' ? 'Касса' : 'Счёт'), balance: Math.max(0, balance), source: 'manual' })
    }
  }

  return (
    <div className="page-narrow">
      <h1 className="page-title">Новый счёт</h1>
      <p className="set-note" style={{ marginTop: 0 }}>Шаг 1. Где счёт</p>
      <div className="bank-grid">
        {BANKS.map((b) => (
          <button key={b.id} className={bank === b.id ? 'on' : ''} onClick={() => { setBank(b.id); setFound(null); setError(''); setMode(b.id === 'cash' ? 'manual' : 'file') }}>
            <BankBadge bank={b.id} size={36} round />
            <span>{b.name}</span>
          </button>
        ))}
      </div>

      {bank && (
        <>
          <p className="set-note" style={{ marginTop: 24 }}>Шаг 2. Как узнать остаток</p>
          {bank !== 'cash' && (
            <div className="seg" style={{ marginBottom: 14 }}>
              <button className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>Загрузить выписку</button>
              <button className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Ввести вручную</button>
            </div>
          )}
          <div className="card-list">
            <label className="field">
              <span>Название</span>
              <input placeholder={bank === 'cash' ? 'Касса' : 'Например, «Карта»'} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {mode === 'manual' && (
              <label className="field">
                <span>Остаток</span>
                <input type="number" step={0.01} placeholder="0,00" value={balance || ''} onChange={(e) => setBalance(Math.round(+e.target.value * 100) / 100)} />
              </label>
            )}
          </div>

          {mode === 'file' && (
            <>
              <input ref={input} type="file" accept=".txt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f.arrayBuffer()); e.target.value = '' }} />
              <div className="upload-row" style={{ marginTop: 14 }}>
                <button className="btn ghost" onClick={() => input.current?.click()}><Icon name="doc" size={18} /> Файл выписки в формате 1С</button>
                {SAMPLES[bank] && <button className="link" onClick={() => read(fetch(SAMPLES[bank]!).then((r) => r.arrayBuffer()))}>или взять пример</button>}
              </div>
              {error && <p className="upload-status err">{error}</p>}
              {found && (
                <p className="upload-status">
                  Нашли счёт •{found.last4}: остаток <b>{rubK(found.balance)}</b> на {fmtDay(found.asOf)}, {found.ops} операций.
                </p>
              )}
            </>
          )}

          <button className="btn" style={{ marginTop: 20 }} disabled={mode === 'file' ? !found : false} onClick={add}>Добавить счёт</button>
          {mode === 'file' && <p className="set-note">С выписки берём остаток. Чтобы прогноз строился по операциям этого счёта, загрузите выписку как новый бизнес.</p>}
        </>
      )}
    </div>
  )
}
