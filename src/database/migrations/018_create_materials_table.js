export default {
  id: '018_create_materials_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE materials (
        id TEXT PRIMARY KEY,
        server_id INTEGER UNIQUE,
        name TEXT NOT NULL,
        specialization_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (specialization_id) REFERENCES specializations(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS materials;');
  },
};
