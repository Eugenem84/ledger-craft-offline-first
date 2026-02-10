export default {
  id: '014_create_orders_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        client_id TEXT,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS orders;');
  },
};
