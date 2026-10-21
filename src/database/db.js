// src/database/db.js
//
// Единая точка доступа к локальной БД (задача 4.3).
//
// Репозитории и syncService работают ТОЛЬКО через этот модуль. Раньше каждый из них
// импортировал `sqljs-web-adapter.js` напрямую — тогда выбор адаптера в boot ничего
// не менял бы: на Android приложение продолжало бы писать в sql.js (в памяти), а
// нативный файл SQLite оставался пустым.
//
// Выбранный адаптер ставит `boot/db.js` через `setAdapter()`; по умолчанию активен
// веб-адаптер (sql.js + localStorage) — это безопасный фолбэк для браузера.
import { logger } from 'src/utils/logger'
import webAdapter from './adapters/sqljs-web-adapter.js'

let active = webAdapter

/**
 * Состояние инициализации локальной БД.
 *
 * Зачем это отдельно от адаптера: на устройстве SQLite может не открыться (сбой
 * плагина, «отравленное» соединение, повреждённый файл), и раньше приложение
 * продолжало работать «как обычно»: каждая операция падала текстом
 * «База не открыта», синк молчал, а индикатор показывал «синхронизировано».
 * Теперь факт неудачи виден всему приложению: `boot/db.js` помечает состояние,
 * `syncService` показывает его в индикаторе, а фидбек всё равно может отправить
 * отчёт (см. `utils/feedbackOutbox.js`).
 *
 * @type {{ready: boolean, error: string|null, attempts: number, source: string|null, adapter: string|null, lastAttemptAt: number}}
 */
let state = {
  ready: false,
  error: null,
  attempts: 0,
  source: null,
  adapter: null,
  lastAttemptAt: 0,
}

/** Текст, которым нативный адаптер сообщает «соединения нет» (см. `requireConnection`). */
export const DB_NOT_READY_MESSAGE =
  'Локальная база данных не открылась. Перезапустите приложение — данные загрузятся с сервера.'

/**
 * Делает адаптер активным (вызывается из boot после выбора по платформе).
 * @param {object} adapter
 */
export function setAdapter(adapter) {
  active = adapter || webAdapter
  logger.log(`[DB] Активный адаптер: ${active.name || 'unknown'}`)
  return active
}

/** БД открыта и готова к работе (миграции уже прошли). */
export function markDbReady(meta = {}) {
  state = {
    ...state,
    ready: true,
    error: null,
    adapter: meta.adapter || state.adapter || null,
    lastAttemptAt: Date.now(),
  }
}

/**
 * БД открыть не удалось: причина сохраняется, чтобы её увидели индикатор синка,
 * отчёт «Сообщить об ошибке» и журнал (после перезапуска — `utils/errorLog.js`).
 * @param {Error|string} error
 * @param {{source?: string}} [meta] откуда пришла неудача (`boot`/`recovery`)
 */
export function markDbFailed(error, meta = {}) {
  const message = typeof error === 'string' ? error : error?.message || String(error ?? 'неизвестная ошибка')

  state = {
    ready: false,
    error: message,
    attempts: state.attempts + 1,
    source: meta.source || state.source || null,
    adapter: meta.adapter || state.adapter || null,
    lastAttemptAt: Date.now(),
  }

  return getDbState()
}

/** @returns {{ready: boolean, error: string|null, attempts: number, source: string|null, adapter: string|null, lastAttemptAt: number}} */
export function getDbState() {
  return { ...state }
}

/** Быстрая проверка «можно ли сейчас ходить в БД» без исключений. */
export function isDbReady() {
  return state.ready === true
}

/** Сброс состояния инициализации — только для тестов. */
export function resetDbStateForTests() {
  state = {
    ready: false,
    error: null,
    attempts: 0,
    source: null,
    adapter: null,
    lastAttemptAt: 0,
  }
}

/**
 * Это ошибка «БД не открыта»? Нужна, чтобы отличить поломку локальной БД от
 * сетевой/серверной ошибки и не пытаться лечить её повтором запроса.
 * @param {*} error
 */
export function isDbNotReadyError(error) {
  if (error?.code === 'DB_NOT_READY') return true

  const message = String(error?.message || error || '')

  return /База не открыта|database .*not opened|Database not initialized/i.test(message)
}

/** @returns {object} активный адаптер */
export function getAdapter() {
  return active
}

/**
 * Делегат: каждый вызов уходит в активный адаптер. Нужен, чтобы у репозиториев был
 * один стабильный объект с интерфейсом адаптера независимо от платформы.
 */
const db = {
  init: (...args) => active.init(...args),
  execute: (...args) => active.execute(...args),
  query: (...args) => active.query(...args),
  queryOne: (...args) => active.queryOne(...args),
  transaction: callback => active.transaction(callback),
  enqueueOperation: operation => active.enqueueOperation(operation),
  dequeueOperations: (...args) => active.dequeueOperations(...args),
  deleteDatabase: (...args) => active.deleteDatabase(...args),

  // Необязательные методы: есть у адаптера своей платформы (версия схемы — у обоих,
  // экспорт бэкапа — у каждого свой формат). Отсутствие метода не должно ломать вызов.
  getSchemaVersion: (...args) => active.getSchemaVersion?.(...args) ?? Promise.resolve(null),
  setSchemaVersion: (...args) => active.setSchemaVersion?.(...args) ?? Promise.resolve(),
  exportDatabaseJson: (...args) => active.exportDatabaseJson?.(...args),
  exportDatabaseBytes: (...args) => active.exportDatabaseBytes?.(...args),
  importDatabaseJson: (...args) => active.importDatabaseJson?.(...args),
}

export default db
