// Номера уже заведённым заказам (правка владельца 26.09.2026).
//
// До этой версии клиент не заполнял `user_order_number`, а список заказов показывал
// `server_id` — «айдишник» вместо человеческого номера. Новые заказы получают номер
// при создании (`ordersRepo.save` → `getNextUserOrderNumber`), а здесь разово нумеруем
// то, что уже лежит в локальной БД: с 1 в каждом рабочем профиле, по возрастанию
// `created_at` (порядок заведения заказа).
//
// Схему не меняет и идемпотентна: повторный прогон не находит строк с NULL-номером.
// ⚠️ Номера проставляются локально; на сервер они уедут штатной операцией `update`,
// когда заказ в следующий раз изменится (поле уже входит в payload синка).
export default {
  id: '032_backfill_order_numbers',

  up: async (db) => {
    // Профили (включая «без профиля» — NULL), где есть хоть один ненумерованный заказ.
    const scopes = await db.query(`
      SELECT DISTINCT specialization_id AS specialization_id
      FROM orders
      WHERE user_order_number IS NULL
    `)

    for (const scope of scopes) {
      const specializationId = scope.specialization_id ?? null

      // Продолжаем нумерацию после максимума, который уже есть в профиле (если часть
      // заказов успела получить номер до этой миграции).
      const [{ max_number: maxNumber } = {}] = await db.query(
        `SELECT MAX(user_order_number) AS max_number
         FROM orders
         WHERE specialization_id IS ? AND user_order_number IS NOT NULL`,
        [specializationId]
      )
      let next = (Number(maxNumber) || 0) + 1

      const rows = await db.query(
        `SELECT id FROM orders
         WHERE specialization_id IS ? AND user_order_number IS NULL
         ORDER BY created_at ASC, id ASC`,
        [specializationId]
      )

      for (const row of rows) {
        await db.execute('UPDATE orders SET user_order_number = ? WHERE id = ?', [next, row.id])
        next += 1
      }
    }
  },

  down: async () => {
    // Данные не откатываем: без номера заказ снова показывал бы `server_id`
    // (см. 029 — «обнуление вернуло бы записанное к невидимому состоянию»).
  },
}
