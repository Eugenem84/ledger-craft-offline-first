export default {
  id: '004_create_specializations',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS specializations (
        id TEXT PRIMARY KEY,
        server_id bigint,
        name varchar(255) NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS specializations;');
  },
};
