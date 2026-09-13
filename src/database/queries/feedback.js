// SQL очереди отчётов «Сообщить об ошибке» (Фаза 14, задача 14.2).
//
// Отдельная таблица, а не `operations`: отчёты не участвуют в синке (`$tables`,
// `TABLE_ORDER`, «полный сброс» и бэкап их не трогают) — решение D7.
// Параметры везде позиционные, статусы — из `feedbackRepo.STATUS`.
export default {
  getAll: 'SELECT * FROM feedback_reports ORDER BY created_at ASC',
  getById: 'SELECT * FROM feedback_reports WHERE id = ?',
  getByStatus: 'SELECT * FROM feedback_reports WHERE status = ? ORDER BY created_at ASC',
  countByStatus: 'SELECT COUNT(*) AS count FROM feedback_reports WHERE status = ?',
  insert: `
    INSERT INTO feedback_reports (id, kind, message, payload, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `,
  markSending: `
    UPDATE feedback_reports
    SET status = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = ?
  `,
  markPending: `
    UPDATE feedback_reports
    SET status = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `,
  markSent: `
    UPDATE feedback_reports
    SET status = ?, server_id = ?, last_error = NULL, sent_at = ?, updated_at = ?
    WHERE id = ?
  `,
  markFailed: `
    UPDATE feedback_reports
    SET status = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `,
  deleteById: 'DELETE FROM feedback_reports WHERE id = ?',
  deleteAll: 'DELETE FROM feedback_reports',
};
