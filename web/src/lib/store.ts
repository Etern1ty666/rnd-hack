/** Всё, что пользователь настроил, живёт в браузере. В приватном режиме хранилища может не быть — тогда просто не запоминаем. */
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* приватный режим — не страшно */ }
}
