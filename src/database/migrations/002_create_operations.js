export default {
  id: '002_create_operations',

  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);
  },

  down: async (db) => {
    await db.execute(`DROP TABLE IF EXISTS operations;`);
  }
};
