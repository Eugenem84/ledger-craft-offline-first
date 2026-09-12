// test/helpers/testDb.js
//
// Тестовая БД для репозиториев, миграций и синка (задача 5.2).
//
// Это **настоящий** sql.js в памяти с тем же интерфейсом, что у веб-адаптера
// (`execute`/`query`/`queryOne`/`transaction`/`getSchemaVersion`/…), но без
// localStorage и без сети. Такой адаптер даёт реальную семантику SQLite
// (NOT NULL, транзакции, PRAGMA user_version) — заглушка этого не даёт,
// а именно на ней ловятся ошибки биндинга и «фейковых» транзакций.
//
// Репозитории и syncService работают через единую точку доступа
// `src/database/db.js`, поэтому достаточно `setAdapter(adapter)`.
import initSqlJs from 'sql.js'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setAdapter } from 'src/database/db.js'
import { runMigrations } from 'src/database/migrate.js'
import { SCHEMA_VERSION } from 'src/database/schema-version.js'

const require = createRequire(import.meta.url)

// Каталог с `sql-wasm.wasm`: WAW-движок sql.js в Node читается с диска,
// а не по URL (в браузере это делает locateFile в веб-адаптере).
const sqlJsDist = path.dirname(require.resolve('sql.js'))

let SQL = null

/** Загружает WASM один раз на процесс и переиспользует между тестами. */
async function loadSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: file => path.join(sqlJsDist, file) })
  }
  return SQL
}

/**
 * @returns {Promise<object>} адаптер БД с интерфейсом `sqljs-web-adapter.js`
 */
export async function createSqlJsAdapter() {
  const SQLEngine = await loadSqlJs()
  let db = new SQLEngine.Database()
  let inTransaction = false

  return {
    name: 'test-sqljs',

    init: async () => {},

    execute(sql, params = []) {
      if (!db) throw new Error('Database not initialized')
      db.run(sql, params)
    },

    query(sql, params = []) {
      if (!db) throw new Error('Database not initialized')

      const result = db.exec(sql, params)
      if (!result.length) return []

      const { columns, values } = result[0]
      return values.map(row => Object.fromEntries(row.map((value, index) => [columns[index], value])))
    },

    queryOne(sql, params = []) {
      const rows = this.query(sql, params)
      return rows.length ? rows[0] : null
    },

    // Та же схема, что у веб-адаптера: вложенный вызов выполняется в уже
    // открытой транзакции (SQLite не поддерживает вложенный BEGIN), ошибка
    // откатывает все statement'ы.
    async transaction(callback) {
      if (!db) throw new Error('Database not initialized')
      if (inTransaction) return callback()

      inTransaction = true
      db.run('BEGIN')

      try {
        await callback()
        db.run('COMMIT')
      } catch (error) {
        db.run('ROLLBACK')
        throw error
      } finally {
        inTransaction = false
      }
    },

    // Репозитории кладут операции напрямую в `operationsRepo`; эти методы
    // оставлены только для совпадения интерфейса адаптера.
    enqueueOperation(_operation) {},
    dequeueOperations() {
      return []
    },

    async getSchemaVersion() {
      const rows = this.query('PRAGMA user_version')
      return rows.length ? Number(rows[0].user_version) : 0
    },

    async setSchemaVersion(version) {
      this.execute(`PRAGMA user_version = ${Math.trunc(Number(version))}`)
    },

    async exportDatabaseBytes() {
      if (!db) throw new Error('Database not initialized')
      return db.export()
    },

    async exportDatabaseJson() {
      const bytes = await this.exportDatabaseBytes()
      return JSON.stringify(Array.from(bytes))
    },

    async deleteDatabase() {
      db = null
    },
  }
}

/**
 * Делает тестовую БД активной, прогоняет миграции и фиксирует версию схемы
 * (как это делает `boot/db.js` на старте приложения).
 *
 * @param {{ migrate?: boolean }} [options] `migrate: false` — только чистый
 *   адаптер (нужно тестам самих миграций)
 * @returns {Promise<object>} активный адаптер
 */
export async function setupTestDb({ migrate = true } = {}) {
  const adapter = await createSqlJsAdapter()
  setAdapter(adapter)
  await adapter.init()

  if (migrate) {
    await runMigrations(adapter)
    await adapter.setSchemaVersion(SCHEMA_VERSION)
  }

  return adapter
}

export { SCHEMA_VERSION }
