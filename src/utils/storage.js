// src/utils/storage.js
//
// Универсальное хранилище «ключ → значение» (задача 7.3): браузер и Capacitor WebView.
//
// Зачем обёртка: прямые обращения к `localStorage` были разбросаны по модулям
// (`api.js`, `storage-adapter.js`), а вне браузера (Node/SSR, часть закрытых WebView,
// приватный режим) глобал может отсутствовать — тогда молча терялись бы `sync_id` и
// токен входа. Здесь одна точка доступа + фолбэк в память, а позже сюда же
// подключается `@capacitor/preferences` без правок вызывающего кода.

const memory = new Map()

// Основной путь — localStorage: он есть и в браузере, и в WebView Capacitor.
const hasLocalStorage = (() => {
  try {
    return typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null
  } catch {
    return false
  }
})()

const toKey = key => String(key)

/**
 * Есть ли настоящая персистентность (localStorage), или значение живёт только
 * до перезапуска процесса (фолбэк в память).
 */
export function isPersistentStorage() {
  return hasLocalStorage
}

/** Читает значение (или null). Никогда не бросает. */
export function getItem(key) {
  const k = toKey(key)

  if (hasLocalStorage) {
    try {
      return globalThis.localStorage.getItem(k)
    } catch {
      // доступ к storage запрещён (приватный режим) — работаем как с памятью
    }
  }

  return memory.has(k) ? memory.get(k) : null
}

/**
 * Пишет значение. Ошибки НЕ проглатываются: `storage-adapter` ловит переполнение
 * localStorage, чтобы переключиться на IndexedDB.
 */
export function setItem(key, value) {
  const k = toKey(key)
  const v = String(value)

  if (hasLocalStorage) {
    globalThis.localStorage.setItem(k, v)
    return
  }

  memory.set(k, v)
}

/** «Мягкая» запись для небольших служебных ключей: переполнение не роняет вызывающего. */
export function trySetItem(key, value) {
  try {
    setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** Удаляет ключ (в обоих хранилищах). */
export function removeItem(key) {
  const k = toKey(key)

  if (hasLocalStorage) {
    try {
      globalThis.localStorage.removeItem(k)
    } catch {
      // см. getItem
    }
  }

  memory.delete(k)
}

/** Полная очистка. Осторожно: сотрёт и дамп локальной БД, и настройки входа. */
export function clear() {
  if (hasLocalStorage) {
    try {
      globalThis.localStorage.clear()
    } catch {
      // см. getItem
    }
  }

  memory.clear()
}

export default {
  isPersistentStorage,
  getItem,
  setItem,
  trySetItem,
  removeItem,
  clear,
}
