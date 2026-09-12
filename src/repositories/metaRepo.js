// repositories/metaRepo.js
//
// Метаданные синка. Курсор выдачи ведётся НА ТАБЛИЦУ (задача 3.6): сбой в одной таблице
// не двигает её курсор и не мешает остальным таблицам забирать своё.
//
// Работаем через единую точку доступа к БД (задача 4.3), а не через конкретный
// адаптер: на Android это нативный SQLite, в браузере — sql.js.
import db from 'src/database/db.js';

// Старый общий ключ (до 3.6). Читаем его как начальное значение, чтобы после обновления
// приложения не перетягивать все таблицы заново.
const LEGACY_KEY = 'last_synced_at';
const TABLE_KEY_PREFIX = 'last_synced_at:';

const tableKey = (table) => `${TABLE_KEY_PREFIX}${table}`;

/**
 * Читает значение метаданных по ключу.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getValue(key) {
  const rows = await db.query('SELECT value FROM meta WHERE key = ?', [key]);
  return rows.length ? rows[0].value : null;
}

/**
 * Пишет значение метаданных (создаёт или заменяет).
 *
 * `INSERT OR REPLACE`, а не UPSERT (`ON CONFLICT ... DO UPDATE`): синтаксис UPSERT
 * требует SQLite ≥ 3.24, то есть Android 10+. Нативный SQLite берётся из системы
 * (у плагина minSdk 23 → Android 6), поэтому UPSERT там падал бы. `key` — PRIMARY KEY,
 * так что REPLACE корректен.
 * @param {string} key
 * @param {string|number} value
 */
export async function setValue(key, value) {
  await db.execute('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

async function readTimestamp(key) {
  const value = await getValue(key);
  return value ? parseInt(value) : 0;
}

async function writeTimestamp(key, ts) {
  await setValue(key, ts);
}

/**
 * Курсор выдачи таблицы (epoch-мс). Если своего курсора ещё нет — отдаём старый общий
 * (плавный апгрейд с версии до 3.6).
 * @param {string} table
 */
export async function getLastSyncedAt(table) {
  const own = await readTimestamp(tableKey(table));

  if (own) return own;

  return readTimestamp(LEGACY_KEY);
}

/**
 * Сдвигает курсор только этой таблицы — вызывается после её успешной выдачи.
 * @param {string} table
 * @param {number} ts epoch-мс
 */
export async function setLastSyncedAt(table, ts) {
  await writeTimestamp(tableKey(table), ts);
}

/**
 * Сбрасывает курсоры: конкретной таблицы или всего синка.
 * @param {string} [table]
 */
export async function resetLastSyncedAt(table) {
  if (table) {
    await db.execute('DELETE FROM meta WHERE key = ?', [tableKey(table)]);
    return;
  }

  await db.execute('DELETE FROM meta WHERE key = ? OR key LIKE ?', [LEGACY_KEY, `${TABLE_KEY_PREFIX}%`]);
}
