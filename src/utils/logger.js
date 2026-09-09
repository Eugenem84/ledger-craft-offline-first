// src/utils/logger.js
//
// Хелпер логирования: активен только в DEVELOPMENT.
// В production-сборке debug-вывод (log/table/warn) полностью отключается,
// чтобы не мусорить в консоли пользователя.
//
// console.error() намеренно НЕ перехватывается — ошибки нужны и в проде.

const isDev = () => import.meta.env?.DEV === true

export const logger = {
  log(...args) {
    if (isDev()) {
      console.log(...args)
    }
  },

  table(...args) {
    // console.table нестандартный (есть не во всех браузерах/расширениях)
    if (isDev() && typeof console.table === 'function') {
      console.table(...args)
    }
  },

  warn(...args) {
    // console.warn нестандартный: в некот. браузерах отсутствует — страхуемся
    if (isDev()) {
      if (typeof console.warn === 'function') {
        console.warn(...args)
      } else {
        console.log('[WARN]', ...args)
      }
    }
  },

  error(...args) {
    console.error(...args)
  },
}