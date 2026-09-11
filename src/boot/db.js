import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import migrations from 'src/database/migrations/index.js'
import syncService from 'src/services/syncService.js'
import { isNativePlatform } from 'src/utils/platform'

// Выбор адаптера по платформе:
//  • нативный Capacitor (Android) → sqlite-capacitor-adapter.js (после Фазы 4)
//  • браузер/веб (по умолчанию)   → sqljs-web-adapter.js (sql.js в памяти + localStorage)
//
// Плагин @capacitor-community/sqlite в Фазе 4 ЕЩЁ НЕ установлен, поэтому
// адаптер грузим динамически по переменной-пути (чтобы Vite не резолвил
// несуществующий импорт на этапе web-сборки). Пока Фаза 4 не сделана,
// везде работает sql.js — это и есть «переключатель, прикрученный заранее».
async function resolveAdapter() {
  if (isNativePlatform()) {
    const adapterPath = '../database/adapters/sqlite-capacitor-adapter.js'
    try {
      const mod = await import(adapterPath)
      if (mod?.default) {
        logger.log('[DB] ВЫБРАН адаптер: sqlite (Capacitor, нативный)')
        return mod.default
      }
    } catch (err) {
      logger.warn('[DB] Capacitor-адаптер недоступен (плагин не установлен, Фаза 4):', err?.message)
      logger.warn('[DB] Фолбэк на sql.js')
    }
  }
  const { default: adapter } = await import('../database/adapters/sqljs-web-adapter.js')
  logger.log('[DB] ВЫБРАН адаптер: sql.js (веб, localStorage)')
  return adapter
}

export default boot(async () => {
  logger.log('[DB] Boot start') // 1️⃣ запуск boot-файла

  try {
    const dbAdapter = await resolveAdapter()
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
