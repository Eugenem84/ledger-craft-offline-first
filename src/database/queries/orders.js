export default {
  getAll: `
    SELECT
      o.*,
      c.name AS client_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
  `,
  getById: `
    SELECT
      o.*,
      c.name AS client_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    WHERE o.id = ?
  `,
  getBySpecializationId: `
    SELECT
      o.*,
      c.name AS client_name
    FROM orders o
    LEFT JOIN clients c ON o.client_id = c.id
    WHERE o.specialization_id = ?
  `,
  insert: `
    INSERT INTO orders (id, server_id, specialization_id, specialization_server_id, client_id, client_server_id, hours, minutes, total_amount, comments, user_id, user_order_number, status, paid, model_id, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE orders
    SET specialization_id = ?, specialization_server_id = ?, client_id = ?, client_server_id = ?, hours = ?, minutes = ?, total_amount = ?, comments = ?, user_id = ?, user_order_number = ?, status = ?, paid = ?, model_id = ?, share_token = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM orders WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO orders (id, server_id, specialization_id, specialization_server_id, client_id, client_server_id, hours, minutes, total_amount, comments, user_id, user_order_number, status, paid, model_id, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE orders
    SET specialization_id = ?, specialization_server_id = ?, client_id = ?, client_server_id = ?, hours = ?, minutes = ?, total_amount = ?, comments = ?, user_id = ?, user_order_number = ?, status = ?, paid = ?, model_id = ?, share_token = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE orders
    SET server_id = ?
    WHERE id = ?
  `
};
