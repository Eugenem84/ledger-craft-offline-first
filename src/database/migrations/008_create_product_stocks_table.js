export default {
  id: '008_create_product_stocks_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_stocks (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        supplier VARCHAR(255),
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS product_stocks;');
  },
};
