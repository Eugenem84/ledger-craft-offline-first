export default {
  id: '012_create_incoming_products_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS incoming_products (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        product_id TEXT NOT NULL,
        supplier VARCHAR(255),
        quantity INTEGER NOT NULL,
        buy_price INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS incoming_products;');
  },
};
