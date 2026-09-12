import { logger } from 'src/utils/logger'
import initSqlJs from 'sql.js'
import StorageAdapter from './storage-adapter.js'

let db = null

// Признак открытой транзакции: SQLite не поддерживает вложенные BEGIN,
// а persist() не должен сохранять незакоммиченные изменения.
let inTransaction = false

/**
 * Экспортирует текущую БД и сохраняет дамп в постоянное хранилище.
 * Вызывается после каждой мутации и при beforeunload.
 */
function persist() {
  if (!db) return
  try {
    const dump = db.export()
    StorageAdapter.save(dump)
  } catch (err) {
    console.error('[SQLJS] Failed to persist database:', err)
  }
}

// Страховка: если какая-то мутация прошла мимо execute() (или приложение закрыли),
// сбрасываем дамп на диск перед выгрузкой страницы.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', persist)
}

const dbAdapter = {
  name: 'sqljs-web',

  init: async function() {
    try {
      const SQL = await initSqlJs({
        // Локальный WASM (в public/ попадает в корень сайта) — без CDN,
        // чтобы приложение могло работать офлайн.
        locateFile: () => '/sql-wasm.wasm'
      })
      const saved = await StorageAdapter.load()
      db = saved ? new SQL.Database(saved) : new SQL.Database()
      logger.log(`[SQLJS] Database initialized${saved ? ' (restored from storage)' : ''}`)
    } catch (err) {
      console.error('[SQLJS] Failed to init database:', err)
      throw err
    }
  },

  execute: function(sql, params = []) {
    if (!db) {
      console.error('[SQLJS] Execute called but DB not initialized!')
      throw new Error('Database not initialized')
    }

    if (!sql) {
      console.error('[SQLJS] Execute called with undefined SQL!', params)
      throw new Error('SQL query is undefined')
    }

    try {
      logger.log('[SQLJS] Executing SQL:', sql, 'Params:', params)
      db.run(sql, params)
      logger.log('[SQLJS] Executed successfully')
      // Внутри транзакции не пишем дамп: сохраним один раз после COMMIT/ROLLBACK.
      if (!inTransaction) persist()
    } catch (err) {
      console.error('[SQLJS] Execute error:', err, 'SQL:', sql, 'Params:', params)
      throw err
    }
  },

  query: function(sql, params = []) {
    try {
      const result = db.exec(sql, params)
      if (!result.length) return []
      const { columns, values } = result[0]
      return values.map(row => {
        const obj = {}
        row.forEach((val, idx) => obj[columns[idx]] = val)
        return obj
      })
    } catch (err) {
      console.error('[SQLJS] Query error:', err.message)
      console.error('  SQL:', sql)
      throw err
    }
  },

  queryOne: function(sql, params = []) {
    const rows = this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  },

  transaction: async function(cb) {
    if (!db) {
      throw new Error('Database not initialized')
    }

    // Если транзакция уже открыта (вложенный вызов) — выполняем cb в её рамках,
    // т.к. SQLite не поддерживает вложенные BEGIN.
    if (inTransaction) {
      return cb()
    }

    inTransaction = true
    try {
      db.run('BEGIN')
      try {
        await cb()
        db.run('COMMIT')
        persist()
      } catch (err) {
        db.run('ROLLBACK')
        persist() // возвращаем сохранённый дамп к откаченному состоянию
        console.error('[SQLJS] Transaction rolled back:', err)
        throw err
      }
    } finally {
      inTransaction = false
    }
  },

  enqueueOperation: function(_op) {
    // пока пусть молчит
  },

  dequeueOperations: function() {
    return []
  },

  /**
   * Версия схемы (задача 4.5). В браузере это тот же `PRAGMA user_version`, что и на
   * нативном SQLite: так проверка «схема совпадает с эталоном» работает на обеих
   * платформах, а номер лежит внутри самой БД.
   */
  getSchemaVersion: async function() {
    const rows = this.query('PRAGMA user_version')
    return rows.length ? Number(rows[0].user_version) : 0
  },

  setSchemaVersion: async function(version) {
    const value = Math.trunc(Number(version))
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`[SQLJS] Некорректная версия схемы: ${version}`)
    }
    // bind-параметры в PRAGMA не поддерживаются — подставляем проверенное число.
    this.execute(`PRAGMA user_version = ${value}`)
  },

  /**
   * Дамп БД целиком — для бэкапа в браузере (задача 4.4).
   * @returns {Uint8Array}
   */
  exportDatabaseBytes: async function() {
    if (!db) {
      throw new Error('Database not initialized')
    }
    return db.export()
  },

  /**
   * Полностью удаляет базу данных из хранилища браузера.
   */
  deleteDatabase: async function() {
    logger.log('[SQLJS] Deleting local database from storage.')
    db = null // Сбрасываем текущий инстанс БД в памяти до очистки хранилища,
    // чтобы beforeunload-persist не записал её обратно.
    StorageAdapter.clear()
  }
}

export default dbAdapter;
