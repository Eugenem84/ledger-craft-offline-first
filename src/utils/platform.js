// src/utils/platform.js
//
// Определение среды выполнения (задача 4.3).
// В браузере (веб-сборка) `Capacitor.isNativePlatform()` → false, поэтому работает
// sql.js; в нативном приложении (Android) → true и выбирается нативный SQLite.
//
// Платформу спрашиваем у @capacitor/core (официальный способ), а не у глобала:
// глобал `window.Capacitor` остаётся фолбэком на случай сборки, где ядро Capacitor
// подключено скриптом, а npm-пакет недоступен.
import { Capacitor } from '@capacitor/core'

export function isNativePlatform() {
  if (Capacitor && typeof Capacitor.isNativePlatform === 'function') {
    return Capacitor.isNativePlatform()
  }

  if (typeof window !== 'undefined' && typeof window.Capacitor !== 'undefined') {
    return typeof window.Capacitor.isNativePlatform === 'function'
      ? window.Capacitor.isNativePlatform()
      : true
  }

  return false
}

// Имя платформы для логов и диагностики: 'android' | 'ios' | 'web'.
export function platformName() {
  if (Capacitor && typeof Capacitor.getPlatform === 'function') {
    return Capacitor.getPlatform()
  }

  return isNativePlatform() ? 'native-capacitor' : 'web-browser'
}
