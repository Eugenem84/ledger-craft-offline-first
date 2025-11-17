import { CapacitorSQLite } from '@capacitor-community/sqlite'
import StorageAdapter from './storage-adapter'

export default {
  ...StorageAdapter,

  async init() {
    await CapacitorSQLite.open({ database: 'ledgercraft', encrypted: true })
  },

  execute(sql, params = []) {
    return CapacitorSQLite.execute({ statements: sql })
  },

  async query(sql, params = []) {
    const res = await CapacitorSQLite.query({ statement: sql })
    return res.values || []
  },

  async transaction(cb) {
    try {
      await cb()
    } catch (err) {
      console.error('Transaction failed', err)
    }
  },

  enqueueOperation(op) {
    // Сохраняем pending операции
  },

  dequeueOperations() {
    return []
  }
}
