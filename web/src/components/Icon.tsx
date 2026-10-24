/**
 * Пиктограммы в духе билета РЖД: тонкая линия, без заливки, читаются в 16–24 px.
 */
const PATHS = {
  card: 'M3 6.5h18v11H3zM3 10h18M6.5 14.5h4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  mic: 'M12 3.5a3 3 0 0 1 3 3V12a3 3 0 0 1-6 0V6.5a3 3 0 0 1 3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3',
  cash: 'M2.5 7h19v10h-19zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM5.5 10v4M18.5 10v4',
  bag: 'M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8',
  doc: 'M6 3h9l3 3v15H6zM15 3v3h3M9 11h6M9 14.5h6M9 18h3.5',
  owner: 'M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6',
  bank: 'M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18',
  refund: 'M9 7 5 11l4 4M5 11h10a4 4 0 0 1 0 8h-2',
  people: 'M8.5 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM2.5 19c.6-3 3-5 6-5s5.4 2 6 5M16 5.5a2.6 2.6 0 1 1 0 5.2M17.5 14c2.2.5 3.6 2.3 4 5',
  tax: 'M3 9 12 4l9 5M4 9h16M5.5 9v8M10 9v8M14 9v8M18.5 9v8M3 20h18M3.5 17.5h17',
  house: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  cloud: 'M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8.6 4.2 4.2 0 0 1 17.5 18z',
  megaphone: 'M4 10v4h3l7 4V6l-7 4zM17.5 9.5a3.5 3.5 0 0 1 0 5M7 14l1 5h2.5l-1-4.5',
  percent: 'M18 6 6 18M7.5 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM16.5 14a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  box: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
  transfer: 'M4 8h14l-3.5-3.5M20 16H6l3.5 3.5',
  pencil: 'M15.5 4.5l4 4L9 19H5v-4zM13 7l4 4',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  check: 'M5 12.5 10 17.5 19.5 7',
  cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  warn: 'M12 4 2.8 20h18.4zM12 10v4.5M12 17.4h.01',
  phone: 'M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2C10.5 19.5 4.5 13.5 4.5 5.5a2 2 0 0 1 2-2z',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  shield: 'M12 3.5 19 6v6c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6z',
  // классическая шестерёнка (контур Lucide «settings», ISC)
  gear: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  chevron: 'M6 9l6 6 6-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, stroke = 1.6, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
