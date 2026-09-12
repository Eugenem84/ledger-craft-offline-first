// src/utils/logger.js
//
// Хелпер логирования: активен только в DEVELOPMENT.
// В production-сборке debug-вывод (log/table/warn) полностью отключается,
// чтобы не мусорить в консоли пользователя.
//
// console.error() намеренно НЕ перехватывается — ошибки нужны и в проде.
//
// Задача 12.5: в dev-режиме logger дополнительно ведёт кольцевой буфер последних
// записей — его показывает вкладка «Режим разработчика» (`DeveloperPanel.vue`).
// Буфер живёт только в памяти и только в dev-сборке, поэтому в прод не попадает.

const isDev = () => import.meta.env?.DEV === true

/** Сколько последних записей хранит буфер (задача 12.5). */
export const LOG_BUFFER_LIMIT = 200

/** Кольцевой буфер последних сообщений: `{ time, level, message }`. */
const buffer = []

/** Безопасное приведение аргумента лога к строке (объекты — JSON). */
function formatArg(arg) {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return arg.message

  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

/** Кладёт запись в буфер (только dev) — вызывается из log/table/warn/error. */
function push(level, args) {
  if (!isDev()) return

  buffer.push({
    time: new Date().toISOString(),
    level,
    message: args.map(formatArg).join(' '),
  })

  if (buffer.length > LOG_BUFFER_LIMIT) {
    buffer.splice(0, buffer.length - LOG_BUFFER_LIMIT)
  }
}

export const logger = {
  log(...args) {
    push('log', args)
    if (isDev()) {
      console.log(...args)
    }
  },

  table(...args) {
    push('table', args)
    // console.table нестандартный (есть не во всех браузерах/расширениях)
    if (isDev() && typeof console.table === 'function') {
      console.table(...args)
    }
  },

  warn(...args) {
    push('warn', args)
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
    push('error', args)
    console.error(...args)
  },
}

/**
 * Снимок буфера логов для отладочной панели (задача 12.5).
 * @returns {Array<{time: string, level: string, message: string}>}
 */
export function getLogBuffer() {
  return buffer.map(entry => ({ ...entry }))
}

/** Очищает буфер логов. */
export function clearLogBuffer() {
  buffer.length = 0
}