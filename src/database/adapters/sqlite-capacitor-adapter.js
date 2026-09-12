// src/database/adapters/sqlite-capacitor-adapter.js
//
// Нативный адаптер локальной БД для Android (задача 4.2): настоящий файл SQLite на
// диске через @capacitor-community/sqlite (линия 7.x, «multi-connection» API).
//
// Контракт совпадает с `sqljs-web-adapter.js`, поэтому репозитории и syncService
// работают через `src/database/db.js` и не знают, какой адаптер активен:
//   init / execute(sql, params) / query / queryOne / transaction / deleteDatabase
//   + версия схемы (getSchemaVersion/setSchemaVersion) и бэкап
//     (exportDatabaseJson/importDatabaseJson).
//
// Почему код выглядит именно так (особенности плагина):
//  • соединение создаётся через SQLiteConnection: сначала checkConnectionsConsistency()
//    (после перезапуска/горячей перезагрузки JS-соединения могут «повиснуть»),
//    затем retrieveConnection() либо createConnection(), и только потом open();
//  • DDL/PRAGMA/батч — execute(statements, transaction);
//  • параметризованные INSERT/UPDATE/DELETE — executeSet([{ statement, values }]);
//  • SELECT — query(statement, values) → `{ values: [...] }`;
//  • плагин по умолчанию сам оборачивает вызов в транзакцию (transaction: true),
//    внутри своей транзакции это дало бы вложенный BEGIN — поэтому передаём false.
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { logger } from 'src/utils/logger'

// Имя БД. Плагин добавляет суффикс «SQLite» и расширение .db, поэтому файл на
// Android называется `ledgercraftSQLite.db` и лежит в
// data/data/<package>/databases/.
const DB_NAME = 'ledgercraft'

// Шифрование файла (SQLCipher) требует хранения пароля (setEncryptionSecret) и UI
// для его ввода — это задача Фазы 7 (безопасность). Пока файл не шифруем.
const DB_ENCRYPTED = false
const DB_MODE = 'no-encryption'

// Версия «формата подключения» плагина (createConnection). Версия СХЕМЫ ведётся
// отдельно — в `PRAGMA user_version` (см. src/database/schema-version.js).
const DB_CONNECTION_VERSION = 1

const sqlite = new SQLiteConnection(CapacitorSQLite)

let connection = null
// Признак своей транзакции: нативный SQLite не терпит вложенных BEGIN.
let inTransaction = false

function requireConnection() {
  if (!connection) {
    throw new Error('[SQLITE] База не открыта: init() не вызван или соединение закрыто')
  }
  return connection
}

export default {
  name: 'sqlite-capacitor',

  /**
   * Открывает (или создаёт) файл БД, переиспользуя живое соединение, если плагин его знает.
   */
  async init() {
    const consistency = await sqlite.checkConnectionsConsistency()
    const existing = await sqlite.isConnection(DB_NAME, false)

    connection =
      consistency.result && existing.result
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(
            DB_NAME,
            DB_ENCRYPTED,
            DB_MODE,
            DB_CONNECTION_VERSION,
            false
          )

    await connection.open()
    logger.log(`[SQLITE] База «${DB_NAME}» открыта (нативный SQLite, файл на диске)`)
  },

  /**
   * DDL/PRAGMA/батч — без параметров; DML с параметрами — через executeSet.
   * @param {string} sql
   * @param {Array<*>} [params]
   */
  execute(sql, params = []) {
    const conn = requireConnection()

    if (!sql) {
      throw new Error('SQL query is undefined')
    }

    if (params.length > 0) {
      logger.log('[SQLITE] Executing SQL:', sql, 'Params:', params)
      return conn.executeSet([{ statement: sql, values: params }], !inTransaction)
    }

    return conn.execute(sql, !inTransaction)
  },

  async query(sql, params = []) {
    const conn = requireConnection()
    const result = await conn.query(sql, params)
    // На iOS первая строка выдачи — имена колонок (особенность плагина); целевая
    // платформа — Android, где выдача сразу приходит объектами.
    return result?.values ?? []
  },

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params)
    return rows.length > 0 ? rows[0] : null
  },

  async transaction(callback) {
    const conn = requireConnection()

    // Вложенный вызов — просто выполняем в рамках уже открытой транзакции.
    if (inTransaction) {
      return callback()
    }

    inTransaction = true
    try {
      await conn.beginTransaction()
      try {
        await callback()
        await conn.commitTransaction()
      } catch (err) {
        await conn.rollbackTransaction()
        console.error('[SQLITE] Transaction rolled back:', err)
        throw err
      }
    } finally {
      inTransaction = false
    }
  },

  /**
   * Версия схемы лежит в самой БД (`PRAGMA user_version`) — её же читает
   * нативный `SQLiteDatabase.getVersion()`.
   */
  async getSchemaVersion() {
    const rows = await this.query('PRAGMA user_version')
    return rows.length ? Number(rows[0].user_version) : 0
  },

  async setSchemaVersion(version) {
    const value = Math.trunc(Number(version))
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`[SQLITE] Некорректная версия схемы: ${version}`)
    }
    // bind-параметры в PRAGMA не поддерживаются — подставляем проверенное число.
    await this.execute(`PRAGMA user_version = ${value}`)
  },

  /**
   * Бэкап (задача 4.4): плагин выгружает всю БД (схема + данные) в JSON.
   * @returns {Promise<string>}
   */
  async exportDatabaseJson() {
    const conn = requireConnection()
    const json = await conn.exportToJson('full')
    return typeof json === 'string' ? json : JSON.stringify(json)
  },

  /**
   * Восстановление БД из JSON-бэкапа (задача 11.9).
   *
   * Импорт делает **менеджер соединений** (`SQLiteConnection.importFromJson` — у
   * `SQLiteDBConnection` такого метода нет). Формат JSON — тот же `JsonSQLite`,
   * что отдаёт `exportDatabaseJson()` (top-level `database`/`version`/`mode`/`tables`).
   *
   * Важно (проверено по реализации плагина): импорт срабатывает, только если в JSON
   * стоит `overwrite: true` — иначе при совпадающей версии и непустой БД плагин
   * вернёт `changes: 0` (no-op). Сервис бэкапа проставляет `overwrite` сам.
   *
   * Соединение закрываем до импорта: плагин пересоздаёт файл БД, а держать его
   * открытым нельзя. После восстановления приложение нужно перезапустить.
   *
   * @param {string} json
   */
  async importDatabaseJson(json) {
    if (typeof json !== 'string' || json.length === 0) {
      throw new Error('[SQLITE] Пустой JSON бэкапа')
    }

    if (connection) {
      await connection.close()
      connection = null
    }

    await sqlite.importFromJson(json)
    logger.log('[SQLITE] База восстановлена из JSON-бэкапа')
  },

  /**
   * Удаляет файл БД (кнопка «удалить локальную БД» на странице настроек).
   */
  async deleteDatabase() {
    if (connection) {
      await connection.delete() // закрывает соединение и удаляет файл
      connection = null
      logger.log('[SQLITE] Файл базы данных удалён')
      return
    }

    await CapacitorSQLite.deleteDatabase({ database: DB_NAME })
  },

  // Заглушки интерфейса: очередь операций живёт в таблице `operations`
  // (см. src/repositories/operationsRepo.js), а не в адаптере.
  enqueueOperation(_operation) {
    // no-op
  },

  dequeueOperations() {
    return []
  },
}

