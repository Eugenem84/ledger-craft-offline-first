import { logger } from 'src/utils/logger'
import initSqlJs from 'sql.js'
import StorageAdapter from './storage-adapter.js'

let db = null

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
  init: async function() {
    try {
      const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` })
      const saved = StorageAdapter.load()
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
      persist()
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
    try {
      await cb()
    } catch (err) {
      console.error('[SQLJS] Transaction failed:', err)
      throw err
    }
  },

  enqueueOperation: function(_op) {
    // пока пусть молчит
  },

  dequeueOperations: function() {
    return []
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
