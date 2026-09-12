// src/database/queries/sales_products_prices.js
//
// Цены продажи товаров по заказам (задача 9.3). Запись создаётся, когда товар со склада
// добавлен в заказ (рядом со строкой `order_product`), и уезжает очередью `operations`.
// Читается для «последней цены продажи» товара на складе.
//
// На сервере колонки: `product_id`, `order_id`, `sale_price`; удаления физические —
// tombstone'ы в `sync_tombstones` (задача 3.9).
export default {
  getByOrderId: 'SELECT * FROM sales_products_prices WHERE order_id = ?',
  getByServerId: 'SELECT * FROM sales_products_prices WHERE server_id = ?',
  // Ключ локальной пары «заказ + товар»: по нему снимаем запись, когда строку товара
  // убрали из заказа (страница правки делает «удалить и добавить заново»).
  getByOrderAndProduct: 'SELECT * FROM sales_products_prices WHERE order_id = ? AND product_id = ?',
  getByUuidOrServerId: 'SELECT * FROM sales_products_prices WHERE id = ? OR server_id = ?',
  insert: `
    INSERT INTO sales_products_prices (id, server_id, product_id, order_id, sale_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  insertFromServer: `
    INSERT INTO sales_products_prices (id, server_id, product_id, order_id, sale_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE sales_products_prices
    SET sale_price = ?, updated_at = ?
    WHERE server_id = ?
  `,
  delete: 'DELETE FROM sales_products_prices WHERE id = ?',
}
