export default {
  id: '014_create_orders_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        specialization_id TEXT,
        specialization_server_id INTEGER,
        client_id TEXT,
        client_server_id INTEGER,
        hours INTEGER,
        minutes INTEGER,
        total_amount INTEGER, -- Changed from REAL to INTEGER
        comments TEXT,
        user_id INTEGER,
        user_order_number INTEGER,
        status TEXT,
        paid INTEGER DEFAULT 0,
        model_id TEXT,
        model_server_id INTEGER,
        share_token TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (specialization_id) REFERENCES specializations(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS orders;');
  },
};
