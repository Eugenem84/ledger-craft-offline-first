// src/boot/db.js
//
// Инициализация локальной БД: выбор адаптера по платформе (4.3), миграции (Фаза 2),
// сверка версии схемы с эталоном (4.5), авто-бэкап на нативной платформе (4.4) и
// запуск синка.
import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import { runMigrations, checkSchemaVersion } from 'src/database/migrate.js'
import { setAdapter } from 'src/database/db.js'
import syncService from 'src/services/syncService.js'
import { autoBackupIfDue } from 'src/services/backupService.js'
import { isNativePlatform } from 'src/utils/platform'

// Выбор адаптера по платформе:
//  • нативный Capacitor (Android) → sqlite-capacitor-adapter.js — файл SQLite на диске
//  • браузер/веб (по умолчанию)   → sqljs-web-adapter.js — sql.js + localStorage
//
// Путь импорта — литерал, поэтому Rollup выносит нативный адаптер в отдельный чанк:
// в вебе он не скачивается, а в приложении подгружается по требованию. Важно: прежний
// вариант «путь в переменной» Vite не мог проанализировать, и в нативном приложении
// модуль просто не находился (фолбэк на sql.js).
async function resolveAdapter() {
  if (isNativePlatform()) {
    try {
      const { default: adapter } = await import(
        '../database/adapters/sqlite-capacitor-adapter.js'
      )
      logger.log('[DB] ВЫБРАН адаптер: sqlite (Capacitor, настоящий файл SQLite)')
      return adapter
    } catch (err) {
      logger.warn('[DB] Нативный адаптер недоступен — фолбэк на sql.js:', err?.message)
    }
  }

  const { default: adapter } = await import('../database/adapters/sqljs-web-adapter.js')
  logger.log('[DB] ВЫБРАН адаптер: sql.js (веб, localStorage)')
  return adapter
}

export default boot(async () => {
  logger.log('[DB] Boot start') // 1️⃣ запуск boot-файла

  try {
    const adapter = await resolveAdapter()
    setAdapter(adapter)
    await adapter.init()

    const applied = await runMigrations(adapter)
    logger.log(`[DB] Миграций применено в этом запуске: ${applied}`)

    await checkSchemaVersion(adapter)

    logger.log('sync activated')
    await syncService.sync()

    // Автобэкап (4.4) — только нативно: у sql.js копия данных уже лежит в
    // localStorage, а на Android бэкап — это файл, который делает плагин.
    if (isNativePlatform()) {
      await autoBackupIfDue()
    }
  } catch (err) {
    console.error('[DB] Ошибка при инициализации:', err)
  }

  logger.log('[DB] Boot end')
})
