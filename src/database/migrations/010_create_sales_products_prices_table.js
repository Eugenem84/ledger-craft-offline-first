export default {
  id: '010_create_sales_products_prices_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sales_products_prices (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        product_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        sale_price INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS sales_products_prices;');
  },
};
