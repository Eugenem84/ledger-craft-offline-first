// `buy_price` в позициях заказа — себестоимость на момент продажи (задачи 9.5/9.6, решение D2).
//
// Маржа в отчётах считалась «выручка = прибыль», потому что закупка в позициях заказа
// нигде не сохранялась. Теперь себестоимость лежит в **обеих** позициях:
//   • `order_product.buy_price` — товар со склада (закупка на момент продажи);
//   • `materials.buy_price` — ручная позиция («купил по пути»).
//
// `order_service` не трогаем: у работы себестоимости нет (это труд мастера), её маржа
// равна цене позиции — так же считает серверный `StatisticRepository`.
//
// Миграция идемпотентна (ALTER идемпотентным не бывает — проверяем `PRAGMA table_info`):
// на уже установленных локальных БД колонки появятся, на свежих — сразу из CREATE TABLE.

async function addColumnIfMissing(db, table, column, definition) {
  const columns = await db.query(`PRAGMA table_info(${table})`);
  const names = columns.map(item => item.name);

  if (!names.includes(column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export default {
  id: '024_order_lines_buy_price',

  up: async (db) => {
    await addColumnIfMissing(db, 'order_product', 'buy_price', 'INTEGER');
    await addColumnIfMissing(db, 'materials', 'buy_price', 'INTEGER');
  },

  down: async () => {
    // SQLite не умеет удалять колонки (до 3.35 — только через пересоздание таблицы),
    // а локальная БД миграции не откатывает (см. `src/boot/db.js`).
  },
};
