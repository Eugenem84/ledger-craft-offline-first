// src/utils/errorLog.js
//
// Постоянный буфер ошибок (Фаза 14, задача 14.1).
//
// Зачем отдельно от `utils/logger.js`: кольцевой буфер логгера живёт в памяти и
// копится только в dev-сборке или при включённом «режиме разработчика» (12.5).
// На боевом APK мастер ошибок не видит, а после перезапуска не остаётся и следа —
// поэтому кнопка «Сообщить об ошибке» не могла бы приложить к отчёту ничего
// полезного. Здесь — маленькое (100 записей) кольцо `warn`/`error`, которое
// переживает перезапуск и пишется **всегда**, без флагов сборки.
//
// В буфер попадают только сообщения, которые формирует наш код (`logger.warn/error`
// и глобальные перехватчики), — данных мастерской тут нет по построению; длинные
// сообщения обрезаются (`ERROR_LOG_MESSAGE_LIMIT`). Именно этот хвост уезжает в
// отчёте полем `errors` (см. `docs/FEEDBACK.md` §3).
import storage from 'src/utils/storage.js'

/** Ключ хранения (обычное строковое значение, как у остальных служебных флагов). */
export const ERROR_LOG_KEY = 'error_log_buffer'

/** Сколько последних записей хранится. */
export const ERROR_LOG_LIMIT = 100

/** Предел длины сообщения: и в буфере, и в отчёте. */
export const ERROR_LOG_MESSAGE_LIMIT = 500

/** Одинаковые сообщения подряд (в пределах окна) не размножаем — цикл не забьёт буфер. */
export const ERROR_LOG_SKIP_DUPLICATE_MS = 1000

/** Уровни, которые вообще попадают в буфер. */
export const ERROR_LOG_LEVELS = ['warn', 'error']

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

/** Сообщение из аргументов лога: как в `logger`, но с обрезкой по лимиту. */
export function formatErrorMessage(args) {
  const list = Array.isArray(args) ? args : [args]
  const text = list
    .filter(arg => arg != null)
    .map(formatArg)
    .join(' ')
    .trim()

  return text.length > ERROR_LOG_MESSAGE_LIMIT
    ? `${text.slice(0, ERROR_LOG_MESSAGE_LIMIT - 1)}…`
    : text
}

/** Читает буфер из хранилища. Битые/чужие данные не должны ронять приложение. */
function load() {
  const raw = storage.getItem(ERROR_LOG_KEY)

  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(entry => entry && typeof entry.message === 'string')
      .map(entry => ({
        time: String(entry.time || ''),
        ts: Number(entry.ts) || 0,
        level: ERROR_LOG_LEVELS.includes(entry.level) ? entry.level : 'error',
        message: entry.message,
        ...(entry.screen ? { screen: String(entry.screen) } : {}),
      }))
      .slice(-ERROR_LOG_LIMIT)
  } catch {
    return []
  }
}

/** Кольцо в памяти; при старте наполняется тем, что пережило прошлый запуск. */
const buffer = load()

function persist() {
  // `trySetItem` не бросает: переполнение хранилища не должно ломать обработчик ошибки.
  storage.trySetItem(ERROR_LOG_KEY, JSON.stringify(buffer))
}

/**
 * Кладёт запись в постоянный буфер.
 *
 * @param {'warn'|'error'} level уровень (остальные приводятся к `error`)
 * @param {Array|string} args аргументы лога (как у `logger.warn/error`)
 * @param {{screen?: string|null}} [meta] контекст: экран/маршрут на момент ошибки
 * @returns {object|null} запись или `null`, если она дублирует предыдущую
 */
export function recordError(level, args, meta = {}) {
  const message = formatErrorMessage(args)

  if (!message) return null

  const normalizedLevel = ERROR_LOG_LEVELS.includes(level) ? level : 'error'
  const now = Date.now()
  const last = buffer[buffer.length - 1]

  // Цикл «одна и та же ошибка каждые несколько миллисекунд» не должен вытеснить всё остальное.
  if (
    last &&
    last.level === normalizedLevel &&
    last.message === message &&
    now - last.ts < ERROR_LOG_SKIP_DUPLICATE_MS
  ) {
    return null
  }

  const entry = {
    time: new Date(now).toISOString(),
    ts: now,
    level: normalizedLevel,
    message,
  }

  if (meta.screen) entry.screen = String(meta.screen)

  buffer.push(entry)

  if (buffer.length > ERROR_LOG_LIMIT) {
    buffer.splice(0, buffer.length - ERROR_LOG_LIMIT)
  }

  persist()

  return { ...entry }
}

/**
 * Хвост буфера (последние записи) в хронологическом порядке.
 * @param {number} [limit] сколько записей вернуть
 * @returns {Array<{time: string, level: string, message: string, screen?: string}>}
 */
export function getErrors(limit = ERROR_LOG_LIMIT) {
  const size = Number(limit) > 0 ? Math.trunc(Number(limit)) : ERROR_LOG_LIMIT

  return buffer.slice(-size).map(entry => ({ ...entry }))
}

/** Сколько записей лежит в буфере. */
export function errorLogCount() {
  return buffer.length
}

/** Очищает буфер (в памяти и в хранилище). */
export function clearErrors() {
  buffer.length = 0
  storage.removeItem(ERROR_LOG_KEY)
}

// --- Глобальные перехватчики (boot/errorLog.js) ------------------------------

/** Идемпотентность: повторная инициализация не навешивает обработчики дважды. */
let installed = false

/** Сбрасывает флаг установки — только для тестов. */
export function resetErrorHandlersForTests() {
  installed = false
}

/**
 * Навешивает перехватчики необработанных ошибок: браузерные `error`/
 * `unhandledrejection` и Vue-овский `app.config.errorHandler`.
 *
 * Своих обработчиков не подменяем: если предыдущий `errorHandler` был, зовём его
 * после записи. Ошибка внутри самого перехватчика не должна ничего ломать.
 *
 * @param {{app?: object, getScreen?: () => (string|null)}} [options]
 * @returns {boolean} `true` — обработчики установлены, `false` — уже были
 */
export function installErrorHandlers({ app = null, getScreen = () => null } = {}) {
  if (installed) return false

  installed = true

  const screen = () => {
    try {
      return getScreen() ?? null
    } catch {
      return null
    }
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('error', event => {
      recordError('error', [event?.message || 'window.onerror'], { screen: screen() })
    })

    globalThis.addEventListener('unhandledrejection', event => {
      const reason = event?.reason

      recordError('error', [reason?.message || String(reason ?? 'unhandledrejection')], {
        screen: screen(),
      })
    })
  }

  if (app?.config) {
    const previous = app.config.errorHandler

    app.config.errorHandler = (error, instance, info) => {
      recordError('error', [error?.message || String(error), info].filter(Boolean), {
        screen: screen(),
      })

      if (typeof previous === 'function') previous(error, instance, info)
    }
  }

  return true
}
