export default {
  id: '013_create_order_product_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_product (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        sale_price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS order_product;');
  },
};
