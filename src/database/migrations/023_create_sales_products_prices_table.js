export default {
  id: '021_create_sales_products_prices_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sales_products_prices (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        product_id TEXT,
        product_server_id INTEGER,
        order_id TEXT,
        order_server_id INTEGER,
        sale_price REAL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS sales_products_prices;');
  },
};
