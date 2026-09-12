// src/database/migrate.js
//
// Прогон миграций локальной БД и сверка её версии с «эталоном» Фазы 2 (задача 4.5).
//
// Вынесено из boot/db.js: тот же код нужен и на старте приложения, и в проверках
// (в Фазе 5 — vitest, сейчас — рантайм-проверками), а нативный SQLite должен
// получать ровно тот же набор миграций, что и sql.js в браузере.
import { logger } from 'src/utils/logger'
import migrations from './migrations/index.js'
import { SCHEMA_VERSION } from './schema-version.js'

/**
 * Прогоняет неприменённые миграции и отмечает их в таблице `migrations`.
 * @param {object} adapter активный адаптер БД
 * @returns {Promise<number>} сколько миграций применено в этом запуске
 */
export async function runMigrations(adapter) {
  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT
    )
  `)

  let applied = 0
  for (const migration of migrations) {
    const result = await adapter.query('SELECT id FROM migrations WHERE id = ?', [migration.id])
    if (!result.length) {
      await migration.up(adapter)
      await adapter.execute('INSERT INTO migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        new Date().toISOString(),
      ])
      applied += 1
    }
  }
  return applied
}

/**
 * Сверяет схему устройства с эталоном: число применённых миграций и `PRAGMA
 * user_version` (её же читает нативный `getVersion()`) должны совпадать с
 * SCHEMA_VERSION. Расхождение не роняет приложение, но громко логируется; версию
 * в БД при расхождении записываем заново — «файл БД объявляет» ту же версию схемы,
 * что и код.
 * @param {object} adapter
 * @returns {Promise<{ applied: number, stored: number, expected: number }>}
 */
export async function checkSchemaVersion(adapter) {
  const [{ total } = {}] = await adapter.query('SELECT COUNT(*) AS total FROM migrations')
  const applied = Number(total)

  if (applied !== SCHEMA_VERSION) {
    console.error(
      `[DB] Схема не совпадает с эталоном: применено миграций ${applied}, ожидается ${SCHEMA_VERSION}`
    )
  }

  if (typeof adapter.getSchemaVersion !== 'function') {
    return { applied, stored: null, expected: SCHEMA_VERSION }
  }

  const stored = await adapter.getSchemaVersion()
  if (stored === SCHEMA_VERSION) {
    logger.log(`[DB] Версия схемы совпадает с эталоном: ${SCHEMA_VERSION}`)
    return { applied, stored, expected: SCHEMA_VERSION }
  }

  logger.warn(`[DB] Версия схемы ${stored} ≠ эталон ${SCHEMA_VERSION} — записываю эталон`)
  await adapter.setSchemaVersion(SCHEMA_VERSION)

  return { applied, stored, expected: SCHEMA_VERSION }
}
