import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import SqlJsAdapter from 'src/database/adapters/sqljs-web-adapter.js'
import migrations from 'src/database/migrations/index.js'
import syncService from 'src/services/syncService.js'

// import SqliteAdapter from 'src/adapters/sqlite-capacitor-adapter'
//import { useClientsStore } from "stores/useClientsStore.js";

export default boot(async () => {
  logger.log('[DB] Boot start') // 1️⃣ запуск boot-файла

  try {
    const dbAdapter = SqlJsAdapter
    //logger.log('[DB] Adapter loaded:', dbAdapter)

    await dbAdapter.init()
    //logger.log('[DB] Adapter initialized')

    await dbAdapter.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT
    )
  `)

    for (const migration of migrations) {
      // Проверяем, применялась ли миграция
      const result = await dbAdapter.query(
        'SELECT id FROM migrations WHERE id = ?',
        [migration.id]
      )
      if (!result.length) {
        await migration.up(dbAdapter) // выполняем миграцию
        await dbAdapter.execute(
          'INSERT INTO migrations (id, applied_at) VALUES (?, ?)',
          [migration.id, new Date().toISOString()]
        )
      }
    }

    logger.log('sync activated')
    await syncService.sync()

    // dbAdapter.execute(`
    //   INSERT OR IGNORE INTO clients (id, name) VALUES
    //     ('1', 'Alice'),
    //     ('2', 'Bob'),
    //     ('3', 'Charlie');
    // `)

    const rows = await dbAdapter.query('SELECT * FROM clients')
    logger.log('[DB] Проверка: клиенты из базы →', rows)

  } catch (err) {
    console.error('[DB] Ошибка при инициализации:', err)
  }

  logger.log('[DB] Boot end')

})
