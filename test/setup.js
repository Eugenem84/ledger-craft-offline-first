// test/setup.js
//
// Браузерные API, которые читают модули приложения при импорте (задача 5.1/5.2).
// DOM для этих тестов не нужен, поэтому вместо jsdom ставим минимальные заглушки:
//   • localStorage — к нему через `src/utils/storage.js` ходят `src/services/api.js`
//     (sync_id, auth_token) и `src/database/adapters/storage-adapter.js` (дамп БД);
//   • navigator.onLine — `syncService._isOnline()` считает среду онлайновой,
//     если это не boolean, но лучше задать явно, чтобы тесты не зависели от Node.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()

  const localStorageShim = {
    getItem: key => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
    removeItem: key => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
    key: index => Array.from(store.keys())[index] ?? null,
  }

  Object.defineProperty(localStorageShim, 'length', {
    get: () => store.size,
  })

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageShim,
    configurable: true,
    writable: true,
  })
}

// В Node `navigator` есть, но без `onLine`. Подменяем на минимальный объект;
// если глобал защищён от перезаписи — не страшно: `_isOnline()` вернёт true.
if (typeof globalThis.navigator === 'undefined' || typeof globalThis.navigator.onLine !== 'boolean') {
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    })
  } catch {
    // navigator объявлен Node как non-configurable — оставляем как есть.
  }
}
