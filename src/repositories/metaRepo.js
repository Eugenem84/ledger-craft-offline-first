// repositories/metaRepo.js
import db from 'src/database/adapters/sqljs-web-adapter';

export default {
  async getLastSyncedAt() {
    const res = await db.query(`
      SELECT value FROM meta WHERE key = 'last_synced_at'
    `);
    return res.length ? parseInt(res[0].value) : 0;
  },

  async setLastSyncedAt(ts) {
    await db.execute(`
      INSERT INTO meta (key, value)
      VALUES ('last_synced_at', ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `, [ts, ts]);
  }
};
