export default {
  id: '011_create_product_categories_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        name VARCHAR(255) NOT NULL,
        specialization_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS product_categories;');
  },
};
