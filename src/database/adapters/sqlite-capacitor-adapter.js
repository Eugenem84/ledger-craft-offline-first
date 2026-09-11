import { CapacitorSQLite } from '@capacitor-community/sqlite'
import StorageAdapter from './storage-adapter.js'

export default {
  ...StorageAdapter,

  async init() {
    await CapacitorSQLite.open({ database: 'ledgercraft', encrypted: true })
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
    try {
      await cb()
    } catch (err) {
      console.error('Transaction failed', err)
    }
  },

  enqueueOperation(_op) {
    // Сохраняем pending операции
  },

  dequeueOperations() {
    return []
  }
}
