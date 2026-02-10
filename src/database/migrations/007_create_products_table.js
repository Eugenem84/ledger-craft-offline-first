export default {
  id: '007_create_products_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        manufacturer VARCHAR(255),
        product_number VARCHAR(255),
        weight REAL,
        base_sale_price INTEGER,
        product_category_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS products;');
  },
};
