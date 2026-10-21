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
import storage from 'src/utils/storage.js'

// Имя БД. Плагин добавляет суффикс «SQLite» и расширение .db, поэтому файл на
// Android называется `ledgercraftSQLite.db` и лежит в
// data/data/<package>/databases/.
//
// Фаза 21: имя больше не константа. Если соединение «застряло» в нативном
// плагине (см. `recover()`), приложение открывает следующий файл
// (`ledgercraft2`, `ledgercraft3`, …), а имя запоминает в `localStorage`, чтобы
// после перезапуска работать с тем же файлом.
const DEFAULT_DB_NAME = 'ledgercraft'
const DB_NAME_KEY = 'sqlite_db_name'

const storedName = String(storage.getItem(DB_NAME_KEY) || '').trim()
let dbName = /^ledgercraft\d*$/.test(storedName) ? storedName : DEFAULT_DB_NAME

/** Следующее имя файла БД: `ledgercraft` → `ledgercraft2` → `ledgercraft3`. */
function nextDatabaseName(name) {
  const match = /^(.*?)(\d+)?$/.exec(name)
  const base = match?.[1] || DEFAULT_DB_NAME
  const index = Number(match?.[2] || 1)

  return `${base}${index + 1}`
}

/**
 * Ошибка «соединения нет».
 *
 * `code: 'DB_NOT_READY'` нужен вызывающему коду (`syncService`, `feedbackService`),
 * чтобы отличить поломку локальной БД от сетевой/серверной ошибки: такую ошибку
 * бессмысленно повторять запросом, её видно в индикаторе синка, а отчёт об ошибке
 * уходит через резервную очередь.
 */
function notReadyError() {
  const error = new Error(
    `[SQLITE] База не открыта: init() не вызван или соединение закрыто (${dbName})`
  )

  error.code = 'DB_NOT_READY'

  return error
}

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

/** Открыто ли соединение в этом JS-контексте (для UI/диагностики). */
function isOpen() {
  return connection !== null
}

/**
 * Переключает приложение на следующий файл БД (см. подробности в `recover()`).
 * Вынесено в модульную функцию: `init()` может вызывать её без привязки к `this`.
 * @param {*} [cause]
 * @returns {boolean}
 */
function rotateDatabaseName(cause = null) {
  const previous = dbName

  dbName = nextDatabaseName(dbName)
  connection = null
  storage.trySetItem(DB_NAME_KEY, dbName)

  logger.error(
    `[SQLITE] Локальная БД «${previous}» недоступна (${cause?.message || cause || 'без причины'}) — ` +
      `создаю новую «${dbName}». Данные будут загружены с сервера.`
  )

  return true
}

function requireConnection() {
  if (!connection) {
    throw notReadyError()
  }
  return connection
}

/**
 * Открывает (или создаёт) файл БД по имени.
 *
 * Почему так осторожно (живой дефект 19.10.2026, новый телефон):
 * `checkConnectionsConsistency()` в плагине 7.0.3 при пустой JS-карте вызывает
 * нативное `closeAllConnections()`, а тот бросает `database <name> not opened`,
 * если в словаре плагина осталось соединение, которое ещё не открывали. Ошибка
 * не чистит словарь, поэтому **каждый** следующий `init()` падал так же — до
 * перезапуска процесса. Здесь сбой сверки не считается приговором: идём своим
 * путём (`isConnection` → `retrieveConnection`/`createConnection`), а если и это
 * не выйдет, `init()` переключится на резервный файл БД (см. `recover()`).
 *
 * @param {string} name имя БД (без суффикса `SQLite.db`)
 * @returns {Promise<object>} открытое соединение
 */
async function openConnection(name) {
  try {
    await sqlite.checkConnectionsConsistency()
  } catch (error) {
    logger.warn('[SQLITE] Сверка соединений плагина не удалась (продолжаем):', error?.message || error)
  }

  let connection = null

  try {
    const existing = await sqlite.isConnection(name, false)

    if (existing?.result) {
      connection = await sqlite.retrieveConnection(name, false)
    }
  } catch (error) {
    logger.warn('[SQLITE] Не удалось переиспользовать соединение:', error?.message || error)
    connection = null
  }

  if (!connection) {
    try {
      connection = await sqlite.createConnection(
        name,
        DB_ENCRYPTED,
        DB_MODE,
        DB_CONNECTION_VERSION,
        false
      )
    } catch (error) {
      const message = String(error?.message || error || '')

      // Нативная запись жива, а JS-карта пуста (перезагрузка WebView): забираем
      // существующее соединение вместо создания нового.
      if (/already exists/i.test(message)) {
        connection = await sqlite.retrieveConnection(name, false)
      } else {
        throw error
      }
    }
  }

  try {
    await connection.open()
  } catch (error) {
    // Повторный `open()` уже открытого соединения плагин отвергает — это не поломка.
    if (!/already open/i.test(String(error?.message || error))) {
      throw error
    }
  }

  return connection
}

/** Сообщение нативного плагина, после которого соединение считается «застрявшим». */
function isStuckConnectionError(error) {
  return /already exists|not opened|close all connections/i.test(String(error?.message || error))
}

export default {
  name: 'sqlite-capacitor',

  /** Имя файла БД, с которым работает приложение (диагностика/бэкап). */
  get databaseName() {
    return dbName
  },

  /** Открыто ли соединение в этом JS-контексте. */
  isOpen,

  /**
   * Открывает (или создаёт) файл БД, переиспользуя живое соединение, если плагин его знает.
   */
  async init() {
    try {
      connection = await openConnection(dbName)
    } catch (error) {
      if (!isStuckConnectionError(error)) {
        throw error
      }

      logger.warn(
        '[SQLITE] Соединение застряло в нативном плагине — открываю резервный файл БД:',
        error?.message || error
      )

      const rotated = rotateDatabaseName(error)

      if (!rotated) {
        throw error
      }

      connection = await openConnection(dbName)
    }

    logger.log(`[SQLITE] База «${dbName}» открыта (нативный SQLite, файл на диске)`)
  },

  /**
   * Аварийное восстановление: следующее имя файла БД.
   *
   * Когда нужно: нативное соединение «застряло» (плагин не отдаёт и не закрывает
   * его), либо файл повреждён. В обоих случаях прочитать старую БД нельзя, поэтому
   * приложение открывает новый файл, прогоняет миграции и при первом же синке
   * получает все данные с сервера (курсоры пусты → `since = 0`).
   *
   * @param {*} [cause] причина — попадает в постоянный буфер ошибок
   * @returns {Promise<boolean>} true — имя переключено, можно пробовать `init()` снова
   */
  async recover(cause = null) {
    return rotateDatabaseName(cause)
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

    // После аварийного восстановления приложение работает с другим файлом
    // (`ledgercraft2`), а в бэкапе записано старое имя. Импорт в старое имя
    // оставил бы приложение без данных, поэтому имя в JSON приводим к текущему.
    let payload = json

    try {
      const parsed = JSON.parse(json)

      if (parsed && typeof parsed === 'object' && typeof parsed.database === 'string') {
        parsed.database = dbName
        payload = JSON.stringify(parsed)
      }
    } catch {
      // Не наш формат — отдаём плагину как есть, он сам ответит ошибкой.
    }

    await sqlite.importFromJson(payload)
    logger.log('[SQLITE] База восстановлена из JSON-бэкапа')
  },

  /**
   * Удаляет файл БД (кнопка «удалить локальную БД» на странице настроек).
   *
   * После удаления соединения нет — `requireConnection()` сообщит `DB_NOT_READY`,
   * а приложение предложит перезапуск (см. `DeveloperPanel.vue`).
   */
  async deleteDatabase() {
    if (connection) {
      await connection.delete() // закрывает соединение и удаляет файл
      connection = null
      logger.log('[SQLITE] Файл базы данных удалён')
      return
    }

    await CapacitorSQLite.deleteDatabase({ database: dbName })
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

