// src/database/init.js
//
// Открытие локальной БД с восстановлением (Фаза 21).
//
// Зачем отдельный модуль: раньше эта логика жила прямо в `boot/db.js` внутри
// `try/catch`, который **глотал** любую ошибку (`console.error`). На боевом
// контуре (отчёт мастера 19.10.2026, новый телефон) это дало худший сценарий:
// SQLite не открылся, приложение стартовало как обычно, синк не мог ни отправить
// очередь, ни **скачать** данные с сервера, а «Сообщить об ошибке» падало с
// `[SQLITE] База не открыта`. Причём причина падения `init()` не попадала ни в
// постоянный буфер ошибок, ни в отчёт — её просто не было.
//
// Теперь:
//   • попытки повторяются (`retries`), потому что первый `open()` на Android
//     иногда срывается на гонке с плагином/WebView;
//   • неудача записывается в состояние БД (`markDbFailed`) и в постоянный буфер
//     через `logger.error` — причина переживёт перезапуск и уедет в отчёт;
//   • если адаптер умеет `recover()` (нативный — переключение на резервное имя
//     файла), он вызывается сам: приложение продолжает работать, а данные
//     приезжают с сервера при первом же синке (курсоры пусты → `since = 0`).
//
// Модуль намеренно не зависит от Quasar/Capacitor: всё внешнее приходит
// параметрами, поэтому сценарии «сломалось с первого раза», «сломалось совсем» и
// «восстановились» проверяются обычным юнит-тестом (`test/db-init.test.js`).
import {
  getAdapter,
  isDbReady,
  markDbFailed,
  markDbReady,
} from 'src/database/db.js'
import { checkSchemaVersion, runMigrations } from 'src/database/migrate.js'
import { logger as defaultLogger } from 'src/utils/logger.js'

/** Пауза перед повтором открытия БД (мс). */
export const DB_OPEN_RETRY_DELAY_MS = 250

/** Сколько раз пробуем открыть БД, прежде чем звать аварийное восстановление. */
export const DB_OPEN_ATTEMPTS = 3

/**
 * Открывает БД и прогоняет миграции.
 *
 * @param {object} adapter активный адаптер (`init()` обязателен)
 * @param {{
 *   migrate?: (adapter: object) => Promise<number>,
 *   schemaCheck?: (adapter: object) => Promise<unknown>,
 *   retries?: number,
 *   retryDelayMs?: number,
 *   delay?: (ms: number) => Promise<void>,
 *   source?: string,
 *   log?: { log?: Function, warn?: Function, error?: Function },
 * }} [options]
 * @returns {Promise<{ok: boolean, applied: number, attempts: number, error: Error|null, recovered: boolean}>}
 *   `recovered: true` — открыли резервную БД (старая не открылась, данные приедут с сервера)
 */
export async function initDatabase(adapter, options = {}) {
  const {
    migrate = async () => 0,
    schemaCheck = async () => null,
    retries = DB_OPEN_ATTEMPTS,
    retryDelayMs = DB_OPEN_RETRY_DELAY_MS,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
    source = 'boot',
    log = defaultLogger,
  } = options

  const attempts = Math.max(1, Math.trunc(Number(retries) || 1))
  let lastError = null
  let opened = false
  let recovered = false
  let usedAttempts = 0

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    usedAttempts = attempt

    try {
      await adapter.init()
      opened = true
      break
    } catch (error) {
      lastError = error

      log.warn?.(
        `[DB] Попытка ${attempt} из ${attempts} открыть локальную БД не удалась:`,
        error?.message || error
      )

      if (attempt < attempts) {
        await delay(retryDelayMs * attempt)
      }
    }
  }

  // Все попытки сорвались: адаптер может уметь аварийное восстановление
  // (нативный переключает имя файла БД — старое соединение «застряло» в плагине
  // и не отпускает приложение, см. `sqlite-capacitor-adapter.js`).
  if (!opened && typeof adapter.recover === 'function') {
    try {
      const rotated = await adapter.recover(lastError)

      if (rotated) {
        await adapter.init()
        opened = true
        recovered = true
        log.warn?.('[DB] Локальная БД открыта заново — данные загрузятся с сервера')
      }
    } catch (recoveryError) {
      lastError = recoveryError
      log.error?.('[DB] Аварийное восстановление локальной БД не удалось:', recoveryError?.message || recoveryError)
    }
  }

  if (!opened) {
    markDbFailed(lastError, { source })

    // Именно `logger.error` (а не `console.error`): запись обязана попасть в
    // постоянный буфер `utils/errorLog.js` — иначе причина поломки теряется
    // безвозвратно, как в отчёте 19.10.2026.
    log.error?.('[DB] Локальная БД не открыта:', lastError?.message || lastError)

    return { ok: false, applied: 0, attempts: usedAttempts, error: lastError, recovered: false }
  }

  markDbReady()

  let applied = 0

  try {
    applied = await migrate(adapter)
    await schemaCheck(adapter)
  } catch (error) {
    // Соединение есть — БД рабочая, но схема недоприменена. Не помечаем БД
    // «мёртвой» (иначе приложение перестанет даже пробовать синк), но пишем
    // причину в постоянный буфер: без этого следующий разбор снова будет вслепую.
    log.error?.('[DB] Миграции/сверка схемы не удались:', error?.message || error)

    return { ok: true, applied, attempts: usedAttempts, error, recovered }
  }

  return { ok: true, applied, attempts: usedAttempts, error: null, recovered }
}

/** Идёт ли повторное открытие БД (не запускаем два параллельно). */
let ensuring = null

/**
 * Гарантирует, что БД открыта — вызывается перед работой, которой нужна база.
 *
 * Зачем: если `boot` не смог открыть БД (например, нативная часть ещё не готова
 * на первом запуске после установки), приложение оставалось «мёртвым» до
 * перезапуска: каждая операция падала «База не открыта», а синк не запускался.
 * Теперь первый же `sync()` (после входа) сам пробует открыть БД ещё раз —
 * без кнопок и действий мастера.
 *
 * @param {object} [options] как у `initDatabase` (по умолчанию — настоящие миграции)
 * @returns {Promise<{ok: boolean, skipped?: boolean}>}
 */
export async function ensureDatabase(options = {}) {
  if (isDbReady()) return { ok: true, skipped: true }

  if (ensuring) return ensuring

  ensuring = initDatabase(getAdapter(), {
    migrate: runMigrations,
    schemaCheck: checkSchemaVersion,
    source: 'sync',
    ...options,
  }).finally(() => {
    ensuring = null
  })

  return ensuring
}

export default initDatabase
