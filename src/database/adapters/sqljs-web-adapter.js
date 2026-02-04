import initSqlJs from 'sql.js'
import StorageAdapter from './storage-adapter.js'

let db = null

const dbAdapter = {
  init: async function() {
    try {
      const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` })
      db = new SQL.Database()
      console.log('[SQLJS] Database initialized')
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
    console.log('[SQLJS] Executing SQL:', sql, 'Params:', params)
    db.run(sql, params)
    console.log('[SQLJS] Executed successfully')
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

  transaction: async function(cb) {
    try {
      await cb()
    } catch (err) {
      console.error('[SQLJS] Transaction failed:', err)
      throw err
    }
  },

  enqueueOperation: function(op) {
    // пока пусть молчит
  },

  dequeueOperations: function() {
    return []
  },

  /**
   * Полностью удаляет базу данных из хранилища браузера.
   */
  deleteDatabase: async function() {
    console.log('[SQLJS] Deleting local database from storage.');
    StorageAdapter.clear(); // Явно вызываем метод из импортированного адаптера
    db = null; // Сбрасываем текущий инстанс БД в памяти
  }
}

export default dbAdapter;
