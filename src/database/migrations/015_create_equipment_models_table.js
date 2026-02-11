export default {
  id: '015_create_equipment_models_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS equipment_models (
        id TEXT PRIMARY KEY,
        name TEXT,
        specialization_id TEXT,
        specialization_server_id INTEGER,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER,
        FOREIGN KEY (specialization_id) REFERENCES specializations(id)
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS equipment_models;');
  },
};
