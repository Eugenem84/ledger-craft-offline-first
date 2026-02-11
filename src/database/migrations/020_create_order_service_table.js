export default {
  id: '020_create_order_service_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_service (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        order_id TEXT,
        order_server_id INTEGER,
        service_id TEXT,
        service_server_id INTEGER,
        sale_price REAL,
        quantity INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (service_id) REFERENCES services(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS order_service;');
  },
};
