import { CapacitorSQLite } from '@capacitor-community/sqlite'
import StorageAdapter from './storage-adapter.js'

// Имя нативной БД (см. init()). Вынесено, чтобы использовать в транзакциях.
const DB_NAME = 'ledgercraft'

// Признак открытой транзакции: плагин/нативный SQLite не любят вложенные begin.
let inTransaction = false

export default {
  ...StorageAdapter,

  async init() {
    await CapacitorSQLite.open({ database: DB_NAME, encrypted: true })
  },

  execute(sql, _params = []) {
    return CapacitorSQLite.execute({ statements: sql })
  },

  async query(sql, _params = []) {
    const res = await CapacitorSQLite.query({ statement: sql })
    return res.values || []
  },

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params)
    return rows.length > 0 ? rows[0] : null
  },

  async transaction(cb) {
    // Вложенный вызов — просто выполняем cb в рамках уже открытой транзакции.
    if (inTransaction) {
      return cb()
    }

    inTransaction = true
    try {
      await CapacitorSQLite.beginTransaction({ database: DB_NAME })
      try {
        await cb()
        await CapacitorSQLite.commitTransaction({ database: DB_NAME })
      } catch (err) {
        await CapacitorSQLite.rollbackTransaction({ database: DB_NAME })
        console.error('[SQLITE] Transaction rolled back:', err)
        throw err
      }
    } finally {
      inTransaction = false
    }
  },

  enqueueOperation(_op) {
    // Сохраняем pending операции
  },

  dequeueOperations() {
    return []
  }
}
