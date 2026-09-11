// Эволюция таблицы `operations` (задача 3.3): статус операции и `updated_at`.
//
// Зачем отдельная миграция, если эталон — 002: на уже установленных локальных БД
// миграция 002 отмечена применённой, поэтому её правка новые колонки не добавит.
// Здесь — идемпотентный ALTER (проверяем наличие колонки), чтобы старые установки
// обновились без пересоздания БД; свежие получают колонки сразу из 002.

export default {
  id: '022_add_operations_status',

  up: async (db) => {
    const columns = await db.query('PRAGMA table_info(operations)');
    const names = columns.map(column => column.name);

    if (!names.includes('status')) {
      await db.execute(`
        ALTER TABLE operations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
      `);
    }

    if (!names.includes('updated_at')) {
      await db.execute(`
        ALTER TABLE operations ADD COLUMN updated_at INTEGER
      `);
    }
  },

  down: async () => {
    // SQLite не умеет удалять колонки (до 3.35 — только через пересоздание таблицы),
    // а локальная БД миграции не откатывает (см. src/boot/db.js).
  },
};
