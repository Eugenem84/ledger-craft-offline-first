export default {
  // Работы заказа: к полям справочника работы (`s.*`) добавляем поля **строки** связки —
  // количество, цену на момент добавления и локальный id строки (у `order_service` нет
  // собственного PK, идентичность строки держит `id` = `uuid_id` на сервере).
  //
  // ⚠️ `price` — это цена строки: сначала `sale_price` (по ней считает аналитика
  // `SUM(quantity * sale_price)`), и только если её нет — цена каталога. Алиас идёт после
  // `s.*`, поэтому затирает каталожную цену (адаптеры собирают строку по имени колонки,
  // «поздняя» колонка побеждает).
  getByOrderId: `
    SELECT
      s.*,
      COALESCE(os.sale_price, s.price) AS price,
      os.sale_price                    AS sale_price,
      os.quantity                      AS quantity,
      os.id                            AS line_id,
      os.server_id                     AS line_server_id
    FROM services s
    JOIN order_service os ON s.id = os.service_id
    WHERE os.order_id = ?
  `,
  // Строки связки как есть (нужны, чтобы поставить delete-операцию перед удалением).
  getLinesByOrderId: `
    SELECT * FROM order_service WHERE order_id = ?
  `,
  insert: `
    INSERT INTO order_service (
      id,
      server_id,
      order_id,
      order_server_id,
      service_id,
      service_server_id,
      sale_price,
      quantity
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  delete: `
    DELETE FROM order_service WHERE order_id = ? AND service_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_service WHERE order_id = ?
  `,
  insertFromServer: `
    INSERT INTO order_service (
      id,
      server_id,
      order_id,
      order_server_id,
      service_id,
      service_server_id,
      sale_price,
      quantity,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE order_service
    SET
      order_id = ?,
      order_server_id = ?,
      service_id = ?,
      service_server_id = ?,
      sale_price = ?,
      quantity = ?,
      updated_at = ?
    WHERE id = ?
  `,
  updateServerId: `
    UPDATE order_service
    SET server_id = ?
    WHERE id = ?
  `
};
