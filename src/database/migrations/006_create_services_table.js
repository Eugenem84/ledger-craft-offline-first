export default {
  id: '006_create_services_table',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        server_id BIGINT,
        category_id TEXT,
        specialization_id BIGINT,
        service VARCHAR(255) NOT NULL,
        price VARCHAR(255),
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS services;');
  },
};
