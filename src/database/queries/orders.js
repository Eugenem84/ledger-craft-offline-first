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
    WHERE c.specialization_id = ?
  `,
  insert: `
    INSERT INTO orders (id, server_id, client_id, total_amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE orders
    SET client_id = ?, total_amount = ?, status = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM orders WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO orders (id, server_id, client_id, total_amount, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE orders
    SET client_id = ?, total_amount = ?, status = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE orders
    SET server_id = ?
    WHERE id = ?
  `
};
