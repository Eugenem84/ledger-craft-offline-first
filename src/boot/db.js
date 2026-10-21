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
//
// Живой отчёт 21.10.2026 (TECNO, Android 16): нативный плагин вообще не
// инициализировался (`CapacitorSQLitePlugin: null` на каждом вызове), поэтому теперь
// `boot` пробует адаптеры **по порядку** и при провале нативного включает sql.js —
// приложение работает, первый же синк забирает все данные с сервера.
import { logger } from 'src/utils/logger'
import { boot } from 'quasar/wrappers'
import { runMigrations, checkSchemaVersion } from 'src/database/migrate.js'
import { setAdapter } from 'src/database/db.js'
import { openDatabase } from 'src/database/init.js'
import { autoBackupIfDue } from 'src/services/backupService.js'
import { isNativePlatform } from 'src/utils/platform'
import storage from 'src/utils/storage.js'

/**
 * Запоминаем, что на этом устройстве нативный SQLite не поднялся.
 *
 * Зачем: провал плагина системный (например, Android 16 + `@capacitor-community/sqlite`
 * 7.0.3 → `CapacitorSQLitePlugin: null`), поэтому на следующем запуске нет смысла снова
 * биться в него 3 раза и рисковать тем, что данные, уже накопленные в резервном режиме,
 * «спрячутся» за пустым нативным файлом. Пока флаг стоит — работаем на sql.js.
 */
const FALLBACK_KEY = 'db_adapter_fallback'

// Выбор адаптера по платформе:
//  • нативный Capacitor (Android) → sqlite-capacitor-adapter.js — файл SQLite на диске
//  • браузер/веб (по умолчанию)   → sqljs-web-adapter.js — sql.js + localStorage
//
// Путь импорта — литерал, поэтому Rollup выносит нативный адаптер в отдельный чанк:
// в вебе он не скачивается, а в приложении подгружается по требованию. Важно: прежний
// вариант «путь в переменной» Vite не мог проанализировать, и в нативном приложении
// модуль просто не находился (фолбэк на sql.js).
async function resolveAdapters() {
  const adapters = []
  const fallbackRemembered = storage.getItem(FALLBACK_KEY) === '1'

  if (isNativePlatform() && !fallbackRemembered) {
    try {
      const { default: adapter } = await import(
        '../database/adapters/sqlite-capacitor-adapter.js'
      )
      adapters.push(adapter)
      logger.log('[DB] Адаптер №1: sqlite (Capacitor, настоящий файл SQLite)')
    } catch (err) {
      logger.warn('[DB] Нативный адаптер недоступен:', err?.message)
    }
  } else if (fallbackRemembered) {
    logger.log('[DB] Включён запомненный резервный режим (sql.js): нативный SQLite на этом устройстве не работал')
  }

  const { default: webAdapter } = await import('../database/adapters/sqljs-web-adapter.js')
  adapters.push(webAdapter)
  logger.log('[DB] Адаптер-резерв: sql.js (localStorage/IndexedDB)')

  return adapters
}

export default boot(async () => {
  logger.log('[DB] Boot start') // 1️⃣ запуск boot-файла

  const adapters = await resolveAdapters()

  const { adapter, result, fallback } = await openDatabase(adapters, {
    migrate: runMigrations,
    schemaCheck: checkSchemaVersion,
    log: logger,
  })

  if (!adapter || !result.ok) {
    // Причина уже записана в постоянный буфер (`initDatabase` → `logger.error`).
    // Приложение продолжаем запускать: без БД часть экранов работает, а фидбек
    // умеет отправить отчёт и без неё (`utils/feedbackOutbox.js`). Индикатор синка
    // покажет «база не открыта», а не «синхронизировано».
    logger.log('[DB] Boot end (без локальной БД)')
    return
  }

  setAdapter(adapter)

  if (fallback) {
    // Запоминаем на будущие запуски: нативный SQLite на этом устройстве не работает,
    // а данные уже живут в резервном хранилище (sql.js → localStorage/IndexedDB).
    storage.trySetItem(FALLBACK_KEY, '1')
  }

  logger.log(
    `[DB] Рабочий адаптер: ${adapter.name}` +
      `${fallback ? ' (резервный режим: нативный SQLite недоступен)' : ''}` +
      ` · миграций применено: ${result.applied}`
  )

  // Автобэкап (4.4) — только нативным адаптером: у sql.js копия данных уже лежит в
  // localStorage, а на Android бэкап — файл, который делает плагин.
  if (isNativePlatform() && adapter.name === 'sqlite-capacitor') {
    await autoBackupIfDue()
  }

  logger.log('[DB] Boot end')
})
