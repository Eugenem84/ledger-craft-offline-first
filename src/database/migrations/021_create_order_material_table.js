export default {
  id: '021_create_order_material_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS order_material (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        order_id TEXT,
        order_server_id INTEGER,
        material_id TEXT,
        material_server_id INTEGER,
        price REAL,
        amount INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (material_id) REFERENCES materials(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS order_material;');
  },
};
