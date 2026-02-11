export default {
  id: '018_create_materials_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        name TEXT,
        order_id TEXT,
        order_server_id INTEGER,
        price REAL,
        amount REAL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS materials;');
  },
};
