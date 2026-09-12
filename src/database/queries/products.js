export default {
  getAll: 'SELECT * FROM products',
  getById: 'SELECT * FROM products WHERE id = ?',
  // Остаток и цены (задача 9.3): склад показывает «сколько лежит», закупку и последнюю
  // цену продажи. Скалярные подзапросы — переносимый SQL (работает и в SQLite на старых
  // Android, и в PostgreSQL), оконные функции/`DISTINCT ON` в локальной схеме не годятся.
  getByCategoryId: `
    SELECT
      products.*,
      COALESCE(stock.quantity, 0) AS quantity,
      (
        SELECT prices.buy_price FROM buy_product_prices prices
        WHERE prices.product_id = products.id
        ORDER BY prices.created_at DESC, prices.id DESC
        LIMIT 1
      ) AS buy_price,
      (
        SELECT prices.sale_price FROM sales_products_prices prices
        WHERE prices.product_id = products.id
        ORDER BY prices.created_at DESC, prices.id DESC
        LIMIT 1
      ) AS last_sale_price
    FROM products
    LEFT JOIN product_stocks stock ON stock.product_id = products.id
    WHERE products.product_category_id = ?
  `,
  insert: `
    INSERT INTO products (id, server_id, name, description, manufacturer, product_number, weight, base_sale_price, product_category_id, product_category_server_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  update: `
    UPDATE products
    SET name = ?, description = ?, manufacturer = ?, product_number = ?, weight = ?, base_sale_price = ?, product_category_id = ?, product_category_server_id = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM products WHERE id = ?',
  updateServerId: 'UPDATE products SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO products (id, server_id, name, description, manufacturer, product_number, weight, base_sale_price, product_category_id, product_category_server_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE products
    SET name = ?, description = ?, manufacturer = ?, product_number = ?, weight = ?, base_sale_price = ?, product_category_id = ?, product_category_server_id = ?, updated_at = ?
    WHERE server_id = ?
  `,
};
