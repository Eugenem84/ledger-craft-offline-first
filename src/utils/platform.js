// src/utils/platform.js
//
// Определение среды выполнения.
// В браузере (веб-сборка) — `Capacitor` недоступен → используем sql.js.
// В нативном Capacitor-приложении (Android) — есть глобал `Capacitor`/`window.Capacitor`
// с методом `isNativePlatform()`. Если плагин sqlite ещё не подключён, всё равно
// считаем, что это нативная среда: адаптер будет выбран верно, а init() упадёт
// с понятной ошибкой «plugin not installed» (это лучше, чем тихо работать в памяти).

export function isNativePlatform() {
  // В нативном приложении Capacitor выставляет window.Capacitor.isNativePlatform()
  if (typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined') {
    return typeof window.Capacitor.isNativePlatform === 'function'
      ? window.Capacitor.isNativePlatform()
      : true
  }
  return false
}

// Удобный лог выбора адаптера по платформе.
export function platformName() {
  return isNativePlatform() ? 'native-capacitor' : 'web-browser'
}