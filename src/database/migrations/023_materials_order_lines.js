// Решение **D2**: «материалы» — это ручные позиции заказа (то, что мастер купил на стороне),
// а не справочник. Серверная таблица `materials` хранит именно строки заказа
// (`order_id, name, price, amount`), поэтому здесь сводим клиентскую схему к одной таблице.
//
// Что было:
//   • `materials` (миграция 018) — клиентский справочник (`name`, `specialization_id`);
//   • `order_material` (миграция 021) — строки заказа, но со ссылкой `material_id` на справочник.
//
// Что делаем: переносим ручные позиции (имя берём из справочника), убираем устаревшие таблицы
// и создаём `materials` в серверной семантике. Миграция защищена проверками существования
// таблиц, поэтому одинаково работает и на уже установленной БД (старые таблицы есть),
// и на свежей (их уже нет — 018/021 удалены из `index.js`).

async function tableExists(db, name) {
  const rows = await db.query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name]
  );
  return rows.length > 0;
}

export default {
  id: '023_materials_order_lines',

  up: async (db) => {
    // Важно отличать старый справочник `materials` (у него есть `specialization_id`) от новой
    // таблицы строк заказа: без этой проверки повторный прогон миграции переименовал бы уже
    // созданную таблицу и потерял бы данные.
    const guideColumns = (await tableExists(db, 'materials'))
      ? (await db.query('PRAGMA table_info(materials)')).map(column => column.name)
      : [];
    const hasLegacyGuide = guideColumns.includes('specialization_id');
    const hasLegacyLines = await tableExists(db, 'order_material');

    if (hasLegacyGuide) {
      await db.execute('ALTER TABLE materials RENAME TO materials_legacy');
    }

    if (hasLegacyLines) {
      await db.execute('ALTER TABLE order_material RENAME TO order_material_legacy');
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        order_id TEXT,
        order_server_id INTEGER,
        name TEXT,
        price REAL,
        amount INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
    `);

    // Переносим уже заведённые ручные позиции: имя берём из старого справочника,
    // id строки/order_server_id сохраняем, чтобы ничего не потерять.
    if (hasLegacyLines) {
      await db.execute(`
        INSERT INTO materials (id, order_id, order_server_id, name, price, amount, created_at, updated_at)
        SELECT om.id, om.order_id, om.order_server_id, m.name, om.price, om.amount, om.created_at, om.updated_at
        FROM order_material_legacy om
        LEFT JOIN materials_legacy m ON m.id = om.material_id
      `);

      await db.execute('DROP TABLE order_material_legacy');
    }

    if (hasLegacyGuide) {
      await db.execute('DROP TABLE materials_legacy');
    }
  },

  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS materials;');
  },
};
