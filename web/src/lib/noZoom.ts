/**
 * Сайт не приближается. Мета viewport запрещает зум на Android, а Safari на iPhone её не слушает —
 * там гасим щипок жестами gesture*. На компьютере — щипок на тачпаде (это колесо с Ctrl) и Ctrl/Cmd + «+», «−», «0».
 * Двойной тап и щипок в браузерах, что понимают touch-action, запрещены в index.css.
 */
export function noZoom() {
  const stop = (e: Event) => e.preventDefault()
  document.addEventListener('gesturestart', stop)
  document.addEventListener('gesturechange', stop)
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault() }, { passive: false })
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_', '0'].includes(e.key)) e.preventDefault()
  })
}
