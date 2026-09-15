// src/database/queries/incoming_products.js
//
// Приходы товара (задача 9.2). Локальная таблица повторяет серверную семантику:
// `product_id` (локальный UUID) + `quantity` + `by_price` + `supplier`.
// Уезжает на сервер очередью `operations` (таблица есть в `SyncController::$tables`),
// `product_id` перед отправкой переводится в серверный id (`fkTransformationMap`).
export default {
  getById: 'SELECT * FROM incoming_products WHERE id = ?',
  getByProductId: 'SELECT * FROM incoming_products WHERE product_id = ? ORDER BY created_at DESC',
  getByServerId: 'SELECT * FROM incoming_products WHERE server_id = ?',
  getByUuidOrServerId: 'SELECT * FROM incoming_products WHERE id = ? OR server_id = ?',
  insert: `
    INSERT INTO incoming_products (id, server_id, product_id, supplier, quantity, by_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  insertFromServer: `
    INSERT INTO incoming_products (id, server_id, product_id, supplier, quantity, by_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  // Ключ — локальный id строки: приход находится либо по своему `uuid_id`
  // (устройство-автор), либо по `server_id` (другое устройство), и в обоих случаях
  // строка обновляется локально, а `server_id` проставляется.
  updateFromServer: `
    UPDATE incoming_products
    SET server_id = ?, supplier = ?, quantity = ?, by_price = ?, updated_at = ?
    WHERE id = ?
  `,
  // Правка прихода пользователем (правка владельца 15.09.2026): количество, закупка,
  // поставщик. Строк прихода одна на движение, поэтому «удалить и вставить» не нужно.
  updateLocal: `
    UPDATE incoming_products
    SET quantity = ?, by_price = ?, supplier = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: 'DELETE FROM incoming_products WHERE id = ?',
}
