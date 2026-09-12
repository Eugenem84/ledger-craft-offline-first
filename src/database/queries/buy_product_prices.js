// src/database/queries/buy_product_prices.js
//
// Закупочные цены товара (задача 9.2, задел под маржу — 9.5). На сервере это
// история: строк может быть много (каждая хранит цену на момент закупки),
// поэтому применяем каждую запись по её серверному id, а «текущей» считаем
// последнюю по `created_at`.
export default {
  getLatestByProductId: `
    SELECT * FROM buy_product_prices WHERE product_id = ? ORDER BY created_at DESC LIMIT 1
  `,
  getByServerId: 'SELECT * FROM buy_product_prices WHERE server_id = ?',
  insert: `
    INSERT INTO buy_product_prices (id, server_id, product_id, buy_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  updateValue: `
    UPDATE buy_product_prices
    SET buy_price = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO buy_product_prices (id, server_id, product_id, buy_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE buy_product_prices
    SET buy_price = ?, updated_at = ?
    WHERE server_id = ?
  `,
  delete: 'DELETE FROM buy_product_prices WHERE id = ?',
}
