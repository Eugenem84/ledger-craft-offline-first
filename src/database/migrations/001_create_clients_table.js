export default {
  id: '001_create_clients',
  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        server_id bigint,
        specialization_id TEXT,
        specialization_server_id bigint,
        name varchar(255) NOT NULL,
        phone varchar(255),
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now')),
        deleted_at INTEGER
      );
    `);
  },
  down: async (db) => {
    await db.execute('DROP TABLE IF EXISTS clients;');
  },
};
