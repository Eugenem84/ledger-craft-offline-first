export default {
  id: '002_create_operations',

  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        "table" TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        deferred_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER
      );
    `);
  },

  down: async (db) => {
    await db.execute(`DROP TABLE IF EXISTS operations;`);
  }
};
