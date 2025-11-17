export default {
  id: '003_create_meta',

  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },

  down: async (db) => {
    await db.execute(`
      DROP TABLE IF EXISTS meta;
    `);
  }
};
