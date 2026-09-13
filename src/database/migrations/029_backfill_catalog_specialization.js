// Разовая привязка «ничьих» справочников к рабочему профилю (Фаза 10/12).
//
// До Фазы 10 специализация в мастерской была одна, и клиенты/категории работ/модели
// техники создавались без `specialization_id` (профиль в диалогах стали писать
// позже). Пока каталог читался через `getAll`, такие записи были видны всегда; после
// перехода на строгий фильтр (`categoriesRepo.getBySpecializationId` и соседи) они
// исчезли бы у каждого профиля.
//
// Поэтому один раз проставляем NULL-записям «активную» специализацию. На старте
// приложения выбранного профиля ещё нет (стор UI живёт отдельно от миграций),
// поэтому берём единственный детерминированный ориентир — самую раннюю
// неархивированную специализацию: у одно-профильного аккаунта (типичный случай
// легаси-данных) она и есть активная. Если профилей нет вовсе, миграция ничего не
// делает, а сторы работают по прежнему `getAll`.
//
// Схему не меняет — только данные, и идемпотентна: после прогона NULL-строк не
// остаётся, повторный UPDATE не находит записей.

export default {
  id: '029_backfill_catalog_specialization',

  up: async (db) => {
    const rows = await db.query(`
      SELECT id, server_id FROM specializations
      WHERE archived IS NULL OR archived = 0
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `)

    const specialization = rows[0]
    if (!specialization) return

    const localId = specialization.id
    const serverId = specialization.server_id ?? null

    // `categories` держит только одну колонку FK (локальный UUID либо серверный id).
    await db.execute(
      'UPDATE categories SET specialization_id = ? WHERE specialization_id IS NULL',
      [localId]
    )

    // У клиентов и моделей FK в двух формах: локальный UUID и серверный id.
    for (const table of ['clients', 'equipment_models']) {
      await db.execute(
        `UPDATE ${table}
         SET specialization_id = COALESCE(specialization_id, ?),
             specialization_server_id = COALESCE(specialization_server_id, ?)
         WHERE specialization_id IS NULL`,
        [localId, serverId]
      )
    }
  },

  down: async () => {
    // Данные не откатываем: «ничья» привязка была неразличима между профилями,
    // а обнуление вернуло бы записанное к невидимому состоянию (см. 025).
  },
}
