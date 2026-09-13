// src/repositories/feedbackRepo.js
//
// Локальная очередь отчётов «Сообщить об ошибке» (Фаза 14, задача 14.2).
//
// Устроена как очередь операций синка (`operationsRepo`, 3.3), но проще: отчёт —
// самостоятельная запись, без FK и без «волн». Статусы:
//   pending  — ждёт отправки (в том числе когда нет сети или входа);
//   sending  — запрос ушёл, ответ ещё не разобран (`attempts` уже увеличен);
//   sent     — сервер принял отчёт (храним `server_id`);
//   failed   — отчёт отправлять нельзя без правок (битый payload, 401/422) —
//              он остаётся в списке, чтобы мастер мог скопировать текст в буфер.
//
// В `payload` лежит готовый JSON отчёта (`docs/FEEDBACK.md` §3), собранный в момент
// создания отчёта: диагностика должна отражать момент ошибки, а не момент отправки.
import db from 'src/database/db.js';
import queries from 'src/database/queries/feedback.js';

const STATUS = {
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
};

export default {
  STATUS,

  /**
   * Ставит отчёт в очередь (статус `pending`).
   * @param {{id: string, kind: string, message: string, payload: object|string, createdAt?: number}} report
   */
  async enqueue({ id, kind, message, payload, createdAt = Date.now() }) {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);

    await db.execute(queries.insert, [id, kind, message, json, STATUS.PENDING, createdAt, createdAt]);
  },

  /** Отчёты, ждущие отправки, в порядке создания. */
  async listPending() {
    return db.query(queries.getByStatus, [STATUS.PENDING]);
  },

  /** Вся очередь отчётов (для «Режима разработчика» и счётчика в настройках). */
  async listAll() {
    return db.query(queries.getAll);
  },

  async getById(id) {
    return db.queryOne(queries.getById, [id]);
  },

  async countPending() {
    const rows = await db.query(queries.countByStatus, [STATUS.PENDING]);
    return rows.length ? rows[0].count : 0;
  },

  /** Отметка «запрос ушёл» — ставится ДО сетевого вызова (как в синке). */
  async markSending(id) {
    await db.execute(queries.markSending, [STATUS.SENDING, Date.now(), id]);
  },

  /** Возврат в очередь: сеть отвалилась или сервер ответил «попробуй позже». */
  async markPending(id, error = null) {
    await db.execute(queries.markPending, [STATUS.PENDING, error ? String(error) : null, Date.now(), id]);
  },

  /** Сервер принял отчёт. */
  async markSent(id, serverId = null) {
    const now = Date.now();
    await db.execute(queries.markSent, [STATUS.SENT, serverId ?? null, now, now, id]);
  },

  /** Отчёт отправлять нельзя (битый payload, 401/422): остаётся для ручного пути. */
  async markFailed(id, error = null) {
    await db.execute(queries.markFailed, [STATUS.FAILED, error ? String(error) : null, Date.now(), id]);
  },

  async remove(id) {
    await db.execute(queries.deleteById, [id]);
  },

  /** Полная очистка — при смене аккаунта/«полном сбросе» (как у очереди операций). */
  async clearAll() {
    await db.execute(queries.deleteAll);
  },
};
