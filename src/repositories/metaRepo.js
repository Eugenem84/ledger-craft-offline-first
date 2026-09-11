// repositories/metaRepo.js
//
// Метаданные синка. Курсор выдачи ведётся НА ТАБЛИЦУ (задача 3.6): сбой в одной таблице
// не двигает её курсор и не мешает остальным таблицам забирать своё.
import db from 'src/database/adapters/sqljs-web-adapter';

// Старый общий ключ (до 3.6). Читаем его как начальное значение, чтобы после обновления
// приложения не перетягивать все таблицы заново.
const LEGACY_KEY = 'last_synced_at';
const TABLE_KEY_PREFIX = 'last_synced_at:';

const tableKey = (table) => `${TABLE_KEY_PREFIX}${table}`;

async function readTimestamp(key) {
  const rows = await db.query(`SELECT value FROM meta WHERE key = ?`, [key]);
  return rows.length ? parseInt(rows[0].value) : 0;
}

async function writeTimestamp(key, ts) {
  await db.execute(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `, [key, ts, ts]);
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
