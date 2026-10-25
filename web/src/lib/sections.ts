import type { IconName } from '../components/Icon'

/** Разделы бизнеса в меню слева — только главное: прогноз, платежи, операции. Остальное Vi показывает в чате. */
export type Section = 'forecast' | 'payments' | 'ops'

export const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'forecast', label: 'Прогноз', icon: 'chart' },
  { id: 'payments', label: 'Платежи', icon: 'calendar' },
  { id: 'ops', label: 'Операции', icon: 'pie' },
]
