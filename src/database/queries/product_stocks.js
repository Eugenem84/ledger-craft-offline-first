// src/database/queries/product_stocks.js
//
// Остаток товара (задача 9.2): одна строка на товар (`Product::stock()` — hasOne).
//
// Остаток **ведёт сервер** — приход увеличивает склад ровно один раз
// (`IncomingProductRepository::recordArrival()`), поэтому исходящих операций
// по этой таблице нет: локальная строка обновляется оптимистично (чтобы офлайн
// сразу показывал новый остаток), а серверное значение приезжает выгрузкой
// `product_stocks` и применяется `applyServerRecord` (ключ — товар).
export default {
  getByProductId: 'SELECT * FROM product_stocks WHERE product_id = ?',
  getByServerId: 'SELECT * FROM product_stocks WHERE server_id = ?',
  insert: `
    INSERT INTO product_stocks (id, server_id, product_id, quantity, supplier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  increaseQuantity: `
    UPDATE product_stocks
    SET quantity = quantity + ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO product_stocks (id, server_id, product_id, quantity, supplier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  // Ключ — товар (строка одна на товар): так «наша» оптимистичная строка
  // превращается в «серверную» и не плодит дубль.
  updateFromServer: `
    UPDATE product_stocks
    SET server_id = ?, quantity = ?, supplier = ?, updated_at = ?
    WHERE product_id = ?
  `,
  delete: 'DELETE FROM product_stocks WHERE id = ?',
}
