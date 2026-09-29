// Остаток товара на устройстве (правка владельца 29.09.2026).
//
// Раньше «сколько лежит» читалось из `product_stocks` — таблицы, которую ведёт **сервер**
// и увеличивает **только приход**. Продажа (`order_product`) её не трогала, поэтому расход
// не уменьшал остаток: «приход 5 → расход 3 → остаток 5». Офлайн-первому приложению нужен
// остаток, который сходится **на устройстве**, поэтому теперь это производная величина:
//
//   остаток = Σ приходов (`incoming_products`) − Σ расходов (`order_product` в не удалённых заказах)
//
// Она не хранится, а считается на чтение, поэтому не может «застрять»/разъехаться:
// правка прихода, удаление товара из заказа и удаление заказа пересчитываются сами.
// `product_stocks` остаётся legacy-таблицей (совместимость с сервером), но остаток больше
// не определяет. Фильтры `deleted_at IS NULL` учитывают мягкие удаления, приехавшие синком.
const stockQuantitySql = `
      COALESCE((
        SELECT SUM(incoming.quantity) FROM incoming_products incoming
        WHERE incoming.product_id = products.id
          AND incoming.deleted_at IS NULL
      ), 0)
      -
      COALESCE((
        SELECT SUM(sold.quantity) FROM order_product sold
        JOIN orders ON orders.id = sold.order_id
        WHERE sold.product_id = products.id
          AND sold.deleted_at IS NULL
          AND orders.deleted_at IS NULL
      ), 0)`

export default {
  getAll: 'SELECT * FROM products',
  getById: 'SELECT * FROM products WHERE id = ?',
  // Остаток и цены (задача 9.3): склад показывает «сколько лежит», закупку и последнюю
  // цену продажи. Скалярные подзапросы — переносимый SQL (работает и в SQLite на старых
  // Android, и в PostgreSQL), оконные функции/`DISTINCT ON` в локальной схеме не годятся.
  getByCategoryId: `
    SELECT
      products.*,
      (${stockQuantitySql}) AS quantity,
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
    WHERE products.product_category_id = ?
  `,
  // Остаток одного товара — та же формула. Нужен уведомлению прихода и правке прихода
  // (`incomingProductsRepo`), чтобы показать новый остаток сразу и не зависеть от сервера.
  stockQuantity: `
    SELECT (${stockQuantitySql}) AS quantity
    FROM products
    WHERE products.id = ?
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
