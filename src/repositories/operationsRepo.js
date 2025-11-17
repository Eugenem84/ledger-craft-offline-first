// repositories/operationsRepo.js
import db from 'src/database/adapters/sqljs-web-adapter';

export default {
  async dequeue() {
    return db.query(`SELECT * FROM operations ORDER BY created_at ASC`);
  },

  async markSynced(op, serverRes) {
    await db.execute(`
      DELETE FROM operations WHERE id = ?
    `, [op.id]);

    // если сервер вернул server_id/updated_at — обновим локальную запись
    if (serverRes?.server_id) {
      await db.execute(`
        UPDATE ${op.table}
        SET server_id = ?, updated_at = ?
        WHERE id = ?
      `, [serverRes.server_id, serverRes.updated_at, op.payload.id]);
    }
  }
};
