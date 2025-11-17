import initSqlJs from 'sql.js'
import StorageAdapter from './storage-adapter'

let db = null

export default {
  ...StorageAdapter,

  async init() {
    const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` })
    db = new SQL.Database()
  },

  execute(sql, params = []) {
    db.run(sql, params)
  },

  query(sql, params = []) {
    const result = db.exec(sql, params)
    if (!result.length) return []

    const { columns, values } = result[0]
    return values.map(row => {
      const obj = {}
      row.forEach((val, idx) => obj[columns[idx]] = val)
      return obj
    })
  },

  // query(sql, params = []) {
  //   const result = db.exec(sql, params)
  //   return result.length ? result[0].values : []
  // },

  async transaction(cb) {
    try {
      await cb()
    } catch (err) {
      console.error('Transaction failed', err)
    }
  },

  enqueueOperation(op) {
    // Здесь можно сохранять операции в IndexedDB или массив
  },

  dequeueOperations() {
    // Получаем pending операции
    return []
  }
}
