// src/boot/db.js
//
// Инициализация локальной БД: выбор адаптера по платформе (4.3), миграции (Фаза 2),
// сверка версии схемы с эталоном (4.5) и авто-бэкап на нативной платформе (4.4).
//
// Синхронизация здесь больше **не запускается** (задача 6.1): раньше `await syncService.sync()`
// блокировал рендер приложения, пока идёт сетевой обмен. Теперь старт синка —
// в `App.vue` после монтирования (`syncService.startAutoSync()`), фоном.
//
// Фаза 21 (живой отчёт 19.10.2026, новый телефон): открытие БД вынесено в
// `database/init.js`. Раньше ошибка `init()` глоталась (`console.error`), приложение
// стартовало «нормально», и дальше каждая операция падала «База не открыта»: синк не
// мог ни отправить очередь, ни скачать данные с сервера, а отчёт об ошибке не уходил.
// Теперь есть повторы, запись причины в постоянный буфер и автоматическое
// восстановление файла БД (данные приезжают с сервера при первом же синке).
import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import { runMigrations, checkSchemaVersion } from 'src/database/migrate.js'
import { setAdapter } from 'src/database/db.js'
import { initDatabase } from 'src/database/init.js'
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

  const adapter = await resolveAdapter()
  setAdapter(adapter)

  const result = await initDatabase(adapter, {
    migrate: runMigrations,
    schemaCheck: checkSchemaVersion,
    log: logger,
  })

  if (!result.ok) {
    // Причина уже записана в постоянный буфер (`initDatabase` → `logger.error`).
    // Приложение продолжаем запускать: без БД часть экранов работает, а фидбек
    // умеет отправить отчёт и без неё (`utils/feedbackOutbox.js`). Индикатор синка
    // покажет «база не открыта», а не «синхронизировано».
    logger.log('[DB] Boot end (без локальной БД)')
    return
  }

  logger.log(`[DB] Миграций применено в этом запуске: ${result.applied}`)

  // Автобэкап (4.4) — только нативно: у sql.js копия данных уже лежит в
  // localStorage, а на Android бэкап — это файл, который делает плагин.
  if (isNativePlatform()) {
    await autoBackupIfDue()
  }

  logger.log('[DB] Boot end')
})
