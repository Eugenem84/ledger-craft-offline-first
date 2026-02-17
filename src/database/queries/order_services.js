export default {
  getByOrderId: `
    SELECT s.*
    FROM services s
    JOIN order_services os ON s.id = os.service_id
    WHERE os.order_id = ?
  `,
  insert: `
    INSERT INTO order_services (order_id, service_id)
    VALUES (?, ?)
  `,
  delete: `
    DELETE FROM order_services WHERE order_id = ? AND service_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_services WHERE order_id = ?
  `
};
