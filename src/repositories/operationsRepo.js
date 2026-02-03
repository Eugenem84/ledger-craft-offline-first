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
    // Эта логика важна для "примирения" данных после ответа сервера.
    if (op.type === 'insert' && serverRes?.id) {
      // Для операции INSERT сервер возвращает свой ID.
      // Мы должны обновить локальную запись, чтобы связать временный UUID с постоянным ID сервера.
      await db.execute(`
        UPDATE ${op.table}
        SET server_id = ?, updated_at = ?
        WHERE id = ?
      `, [serverRes.id, serverRes.updated_at, op.payload.id]);
    } else if (op.type === 'update' && serverRes?.updated_at) {
      // Для операции UPDATE сервер может вернуть свежий `updated_at`.
      // Обновляем его, чтобы избежать будущих конфликтов синхронизации.
      await db.execute(`
        UPDATE ${op.table}
        SET updated_at = ?
        WHERE id = ?
      `, [serverRes.updated_at, op.payload.id]);
    }
  }
};
