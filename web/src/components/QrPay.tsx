import { useEffect, useRef, useState } from 'react'
import type { PlannedEvent } from '../lib/types'
import { findQr, findQrInFile, parsePayQr, type PayQr } from '../lib/payqr'
import { fmtDay, rub } from '../lib/format'
import { Icon } from './Icon'

interface Props {
  days: string[]
  onAdd: (e: PlannedEvent) => void
  onClose: () => void
}

const SAMPLE = import.meta.env.BASE_URL + 'samples/invoice_qr.png'
const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Счёт от поставщика → QR-код → платёж в прогнозе. Получателя и сумму берём из кода, дату выбирает человек. */
export function QrPay({ days, onAdd, onClose }: Props) {
  const [camera, setCamera] = useState(false)
  const [found, setFound] = useState<PayQr | null>(null)
  const [error, setError] = useState('')
  const [sum, setSum] = useState(0)
  const [day, setDay] = useState(0)
  const [added, setAdded] = useState<PlannedEvent | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)

  const take = (bytes: Uint8Array | null) => {
    if (!bytes) return setError('QR-код не нашёлся. Снимите ближе, чтобы код был целиком и в фокусе.')
    const q = parsePayQr(bytes)
    if (!q) return setError('Это не платёжный QR-код. Нужен код со счёта или квитанции.')
    setError('')
    setFound(q)
    setSum(q.sum ?? 0)
  }

  const fromFile = async (f: Blob) => {
    setCamera(false)
    try {
      take(await findQrInFile(f))
    } catch {
      setError('Не получилось открыть картинку.')
    }
  }

  // камера: ищем код в кадрах, пока не найдём; при закрытии панели обязательно гасим её
  useEffect(() => {
    if (!camera) return
    let stopped = false
    let raf = 0
    let stream: MediaStream | null = null
    const canvas = document.createElement('canvas')
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s
      const v = video.current
      if (stopped || !v) return s.getTracks().forEach((t) => t.stop())
      v.srcObject = s
      void v.play()
      const tick = () => {
        if (stopped) return
        const bytes = v.readyState >= 2 ? findQr(v, v.videoWidth, v.videoHeight, 800, canvas) : null
        // чужие QR (ссылки, меню) пропускаем и ищем дальше
        const q = bytes && parsePayQr(bytes)
        if (q) {
          setCamera(false)
          setFound(q)
          setSum(q.sum ?? 0)
        } else raf = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => {
      setCamera(false)
      setError('Нет доступа к камере. Можно загрузить фото или скриншот счёта.')
    })
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [camera])

  const reset = () => {
    setFound(null)
    setAdded(null)
    setError('')
  }

  if (added) {
    return (
      <div className="qr-done">
        <span className="qr-done-ico"><Icon name="check" size={22} stroke={2.4} /></span>
        <b>Платёж добавлен в прогноз</b>
        <span>{added.title} · {rub(-added.amount)} · {fmtDay(added.date)}</span>
        <div className="qr-actions">
          <button className="btn" onClick={onClose}>Готово</button>
          <button className="btn ghost" onClick={reset}>Сканировать ещё</button>
        </div>
      </div>
    )
  }

  if (found) {
    const add = () => {
      const e: PlannedEvent = {
        id: `qr${Date.now()}`, date: days[day], amount: -sum, cat: 'manual', kind: 'manual',
        title: found.name, cp: found.name, source: 'manual',
      }
      onAdd(e)
      setAdded(e)
    }
    return (
      <div>
        <div className="card-list">
          <div className="field"><span>Получатель</span><b>{found.name}</b></div>
          <label className="field">
            <span>Сумма, ₽</span>
            <input
              type="text" inputMode="decimal" value={sum ? sum.toLocaleString('ru-RU') : ''} placeholder="нет в коде — введите"
              onChange={(e) => setSum(+e.target.value.replace(/[^\d,]/g, '').replace(',', '.') || 0)}
            />
          </label>
          <label className="field">
            <span>Когда платить</span>
            <select value={day} onChange={(e) => setDay(+e.target.value)}>
              {days.slice(0, 60).map((d, i) => <option key={d} value={i}>{fmtDay(d)}</option>)}
            </select>
          </label>
          {found.purpose && <div className="field"><span>Назначение</span><span>{found.purpose}</span></div>}
          {found.inn && <div className="field"><span>ИНН</span><span>{found.inn}</span></div>}
          {found.bank && <div className="field"><span>Банк</span><span>{found.bank}</span></div>}
        </div>
        <div className="qr-actions">
          <button className="btn" disabled={!(sum > 0)} onClick={add}>Добавить в платежи</button>
          <button className="btn ghost" onClick={reset}>Другой код</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {camera ? (
        <div className="qr-video">
          <video ref={video} muted playsInline />
          <span className="qr-frame" />
        </div>
      ) : (
        <p className="qr-lead">Наведите камеру на QR-код в счёте или квитанции. Получателя и сумму заполним сами, платёж попадёт в прогноз.</p>
      )}
      {error && <p className="upload-status err">{error}</p>}
      <div className="qr-actions">
        {hasCamera && (camera
          ? <button className="btn ghost" onClick={() => setCamera(false)}>Выключить камеру</button>
          : <button className="btn" onClick={() => { setError(''); setCamera(true) }}><Icon name="qr" size={18} /> Сканировать камерой</button>)}
        <button className={`btn ${hasCamera ? 'ghost' : ''}`} onClick={() => file.current?.click()}><Icon name="doc" size={18} /> Фото или скриншот</button>
        <input
          ref={file} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromFile(f); e.target.value = '' }}
        />
      </div>
      <button className="link muted-link" style={{ marginTop: 20 }} onClick={() => fetch(SAMPLE).then((r) => r.blob()).then(fromFile)}>
        Попробовать на примере счёта
      </button>
    </div>
  )
}
