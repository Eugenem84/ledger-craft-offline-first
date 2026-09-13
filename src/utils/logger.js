// src/utils/logger.js
//
// Хелпер логирования: активен только в DEVELOPMENT.
// В production-сборке debug-вывод (log/table/warn) полностью отключается,
// чтобы не мусорить в консоли пользователя.
//
// console.error() намеренно НЕ перехватывается — ошибки нужны и в проде.
//
// Задача 12.5: logger дополнительно ведёт кольцевой буфер последних записей — его
// показывает панель «Режим разработчика» (`DeveloperPanel.vue`). Буфер живёт в памяти.
//
// «Режим разработчика» в настройках (`utils/devMode.js`): буфер копится не только в
// dev-сборке, но и на бою, если тумблер включён вручную. Так мастер/поддержка может
// посмотреть логи прямо на устройстве, где консоли нет.
//
// Фаза 14 (задача 14.1): `warn`/`error` дополнительно уходят в **постоянный** буфер
// `utils/errorLog.js` — он пишется всегда и переживает перезапуск, поэтому его хвост
// прикладывается к отчёту «Сообщить об ошибке».
import { isDevModeEnabled } from 'src/utils/devMode.js'
import { recordError } from 'src/utils/errorLog.js'

const isDev = () => import.meta.env?.DEV === true

/** Нужно ли вести буфер: dev-сборка ИЛИ включённый режим разработчика. */
const shouldCapture = () => isDev() || isDevModeEnabled()

/** Сколько последних записей хранит буфер (задача 12.5). */
export const LOG_BUFFER_LIMIT = 200

/** Уровни записей — для фильтра в отладочной панели. */
export const LOG_LEVELS = ['log', 'table', 'warn', 'error']

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

/** Кладёт запись в буфер (в dev или при включённом режиме разработчика). */
function push(level, args) {
  if (!shouldCapture()) return

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
    recordError('warn', args)
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
    recordError('error', args)
    console.error(...args)
  },
}

/**
 * Снимок буфера логов для отладочной панели (задача 12.5).
 * @param {string|null} [level] если задан — только записи этого уровня (`log`/`warn`/…)
 * @returns {Array<{time: string, level: string, message: string}>}
 */
export function getLogBuffer(level = null) {
  return buffer
    .filter(entry => !level || entry.level === level)
    .map(entry => ({ ...entry }))
}

/** Очищает буфер логов. */
export function clearLogBuffer() {
  buffer.length = 0
}