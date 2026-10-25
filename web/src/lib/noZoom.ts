/**
 * На телефоне сайт не приближается, на компьютере — как обычно. Мета viewport запрещает зум на Android,
 * а Safari на iPhone её не слушает — там гасим щипок жестами gesture*. Только на телефоне: Safari на Mac
 * шлёт те же жесты на щипок тачпадом. Двойной тап и щипок там, где понимают touch-action, запрещены в index.css.
 */
export function noZoom() {
  if (!matchMedia('(hover: none) and (pointer: coarse)').matches) return
  const stop = (e: Event) => e.preventDefault()
  document.addEventListener('gesturestart', stop)
  document.addEventListener('gesturechange', stop)
}
