import { bankById, type BankId } from '../lib/banks'

export function BankBadge({ bank, size = 32, round }: { bank: BankId; size?: number; round?: boolean }) {
  const b = bankById(bank)
  if (b.logo) {
    return (
      <span className="bank-badge logo" style={{ width: size, height: size, borderRadius: round ? '50%' : undefined }} aria-hidden="true">
        <img src={b.logo} alt="" style={{ width: size * 0.62, height: size * 0.62 }} />
      </span>
    )
  }
  return (
    <span
      className="bank-badge"
      style={{ width: size, height: size, borderRadius: round ? '50%' : undefined, background: b.bg, color: b.fg, fontSize: size * (b.short.length > 2 ? 0.3 : b.short.length > 1 ? 0.36 : 0.46) }}
      aria-hidden="true"
    >
      {b.short}
    </span>
  )
}
