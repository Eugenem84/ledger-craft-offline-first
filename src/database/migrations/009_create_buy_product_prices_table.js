export default {
  id: '009_create_buy_product_prices_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS buy_product_prices (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        product_id TEXT NOT NULL,
        buy_price INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS buy_product_prices;');
  },
};
