// Идемпотентное добавление колонки (общий помощник миграций, Фаза 10).
//
// `ALTER TABLE ... ADD COLUMN` не идемпотентен: повторный прогон падает на
// «duplicate column name». Чтобы миграции можно было безопасно вызывать на
// «старой» БД (и в тестах звать их напрямую), сначала смотрим `PRAGMA table_info`.

export async function addColumnIfMissing(db, table, column, definition) {
  const columns = await db.query(`PRAGMA table_info(${table})`);
  const names = columns.map(item => item.name);

  if (!names.includes(column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export default { addColumnIfMissing };
