// Пометка «пришло из пресета» в каталоге (Фаза 10, задача 10.4, решение D5).
//
// Применение пресета **материализует обычные записи мастерской** (клонируем, а не
// ссылаемся): дальше пользователь правит их свободно. Чтобы повторное применение
// не плодило дубли, каждая созданная из шаблона запись получает ключ
// `template_key`, а перед вставкой проверяется пара `(specialization_id, template_key)`.
//
// Колонки — только у родителей пресета (`categories`, `product_categories`,
// `equipment_models`): услуги/товары создаются как дети уже найденной категории,
// поэтому отдельная пометка им не нужна.
//
// Миграция идемпотентна (`PRAGMA table_info`), индекс — для поиска «уже перенесено».

import { addColumnIfMissing } from './add-column.js'

async function addIndexIfMissing(db, name, table, columns) {
  const indexes = await db.query(`PRAGMA index_list(${table})`);
  const names = indexes.map(item => item.name);

  if (!names.includes(name)) {
    await db.execute(`CREATE INDEX ${name} ON ${table} (${columns})`);
  }
}

export default {
  id: '026_template_key_columns',

  up: async (db) => {
    for (const table of ['categories', 'product_categories', 'equipment_models']) {
      await addColumnIfMissing(db, table, 'template_key', 'TEXT');
      await addIndexIfMissing(db, `idx_${table}_template_key`, table, 'template_key');
    }
  },

  down: async () => {
    // См. 025: SQLite-колонки не удаляются, локальные миграции не откатываются.
  },
};
