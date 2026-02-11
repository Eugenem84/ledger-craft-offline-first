export default {
  id: '016_create_incoming_products_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS incoming_products (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        product_id TEXT,
        product_server_id INTEGER,
        supplier TEXT,
        quantity INTEGER,
        by_price REAL,
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
