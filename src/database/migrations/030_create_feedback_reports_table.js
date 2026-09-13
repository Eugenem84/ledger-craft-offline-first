// Таблица локальной очереди отчётов «Сообщить об ошибке» (Фаза 14, задача 14.2).
//
// Отчёты — **не** таблица синка (решение D7): свой транспорт (`POST /api/feedback`),
// свои статусы и свой жизненный цикл. «Полный сброс»/бэкап их не тащат, второму
// устройству владельца они не приезжают. Устроено по образцу `operations` (3.3):
// статусы `pending` → `sending` → `sent`/`failed`, счётчик попыток и текст
// последней ошибки — чтобы не потерять отчёт, пока нет сети.
//
// `payload` — уже собранный JSON отчёта (контракт `docs/FEEDBACK.md` §3), payload
// фиксируется в момент создания: диагностика должна отражать момент ошибки, а не
// момент отправки.
export default {
  id: '030_create_feedback_reports_table',

  up: async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback_reports (
        id TEXT PRIMARY KEY,
        server_id INTEGER,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        sent_at INTEGER
      );
    `);
  },

  down: async (db) => {
    await db.execute(`DROP TABLE IF EXISTS feedback_reports;`);
  }
};
