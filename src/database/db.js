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
 * Делает адаптер активным (вызывается из boot после выбора по платформе).
 * @param {object} adapter
 */
export function setAdapter(adapter) {
  active = adapter || webAdapter
  logger.log(`[DB] Активный адаптер: ${active.name || 'unknown'}`)
  return active
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
