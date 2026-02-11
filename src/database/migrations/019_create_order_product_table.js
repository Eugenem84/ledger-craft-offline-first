export default {
  id: '019_create_order_product_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_product (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        order_id TEXT,
        order_server_id INTEGER,
        product_id TEXT,
        product_server_id INTEGER,
        sale_price REAL,
        quantity INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS order_product;');
  },
};
