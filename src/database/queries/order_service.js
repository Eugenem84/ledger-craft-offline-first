export default {
  getByOrderId: `
    SELECT s.*
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
