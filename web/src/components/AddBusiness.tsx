import { useRef, useState } from 'react'
import type { CompanyData } from '../lib/types'
import { bankById, type BankId } from '../lib/banks'
import { decode1c, parse1c } from '../lib/engine/parse1c'
import { buildCompanyData } from '../lib/engine/forecast'
import { fmtDay, plural, rub } from '../lib/format'
import { BankBadge } from './BankBadge'
import { Icon } from './Icon'

interface Props {
  demos: { id: string; name: string; hint: string }[]
  onAddDemo: (id: string) => void
  onUploaded: (data: CompanyData) => void
}

const UPLOAD_BANKS: BankId[] = ['centrinvest', 'sber', 'tbank', 'alfa', 'vtb', 'tochka', 'other']
/** Где взять файл: название интернет-банка для бизнеса. */
const DBO: Partial<Record<BankId, string>> = { centrinvest: '«Бизнес-онлайн»', sber: '«СберБизнесе»' }
/** Примеры выписок (сгенерированы из датасета кейса скриптом tools/to_1c_format.py). */
const SAMPLES: Partial<Record<BankId, string>> = { centrinvest: import.meta.env.BASE_URL + 'samples/centrinvest_1c.txt', sber: import.meta.env.BASE_URL + 'samples/sber_1c.txt' }

type State =
  | { step: 'idle' }
  | { step: 'busy'; text: string }
  | { step: 'error'; text: string }
  | { step: 'done'; data: CompanyData; ops: number; account: string; from: string; to: string }

/** Новый бизнес: загрузка выписки в формате 1С или демо-выписка из датасета. */
export function AddBusiness({ demos, onAddDemo, onUploaded }: Props) {
  const [bank, setBank] = useState<BankId>('centrinvest')
  const [state, setState] = useState<State>({ step: 'idle' })
  const input = useRef<HTMLInputElement>(null)

  const run = async (bytes: Promise<ArrayBuffer>) => {
    try {
      setState({ step: 'busy', text: 'Читаем выписку…' })
      const st = parse1c(decode1c(new Uint8Array(await bytes)))
      if (!st.ops.length) throw new Error('В файле нет операций по счёту.')
      setState({ step: 'busy', text: `Нашли ${st.ops.length} операций. Считаем прогноз…` })
      await new Promise((r) => setTimeout(r, 30)) // дать браузеру показать статус
      const data = buildCompanyData({ id: `U${Date.now()}`, name: st.ownerName, inn: st.ownerInn, ops: st.ops, opening: st.opening, closing: st.closing })
      data.company.bank = bank
      setState({ step: 'done', data, ops: st.ops.length, account: st.accounts[0] ?? '', from: st.from, to: st.to })
    } catch (e) {
      setState({ step: 'error', text: e instanceof Error ? e.message : 'Не получилось прочитать файл.' })
    }
  }

  const where = DBO[bank] ?? 'интернет-банке'
  const sample = SAMPLES[bank]

  return (
    <div className="add-biz">
      <p className="lead-note">Загрузите выписку по счёту — прогноз посчитаем прямо в браузере, файл никуда не отправляется.</p>

      <div className="bank-pick">
        {UPLOAD_BANKS.map((id) => (
          <button key={id} className={bank === id ? 'on' : ''} onClick={() => { setBank(id); setState({ step: 'idle' }) }}>
            <BankBadge bank={id} size={28} />
            <span>{bankById(id).name}</span>
          </button>
        ))}
      </div>

      <ol className="howto">
        <li>Откройте выписку в {where} за год-два.</li>
        <li>Выгрузите её в формате <b>1С</b> — получится файл .txt.</li>
        <li>Загрузите файл сюда.</li>
      </ol>

      <input
        ref={input} type="file" accept=".txt,text/plain" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f.arrayBuffer()); e.target.value = '' }}
      />
      <div className="upload-row">
        <button className="btn" onClick={() => input.current?.click()} disabled={state.step === 'busy'}>
          <Icon name="doc" size={18} /> Выбрать файл выписки
        </button>
        {sample && (
          <button className="link" onClick={() => run(fetch(sample).then((r) => r.arrayBuffer()))} disabled={state.step === 'busy'}>
            или взять пример
          </button>
        )}
      </div>

      {state.step === 'busy' && <p className="upload-status">{state.text}</p>}
      {state.step === 'error' && <p className="upload-status err">{state.text}</p>}
      {state.step === 'done' && (
        <div className="upload-done">
          <BankBadge bank={bank} size={36} />
          <div>
            <b>{state.data.company.name}</b>
            <span>
              {state.ops} {plural(state.ops, 'операция', 'операции', 'операций')} с {fmtDay(state.from)} по {fmtDay(state.to)}
              {state.account ? ` · счёт ••${state.account.slice(-4)}` : ''} · остаток {rub(state.data.balanceNow)}
            </span>
          </div>
          <button className="btn" onClick={() => onUploaded(state.data)}>Открыть прогноз</button>
        </div>
      )}

      {demos.length > 0 && (
        <>
          <p className="set-note" style={{ marginTop: 32 }}>Или демо-бизнес из датасета кейса</p>
          <div className="card-list">
            {demos.map((d) => (
              <button key={d.id} className="biz-row" onClick={() => onAddDemo(d.id)}>
                <span className="sw-ico"><Icon name="plus" size={16} /></span>
                <span className="sw-text"><b>{d.name}</b><span>{d.hint}</span></span>
                <span className="link">Подключить</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
