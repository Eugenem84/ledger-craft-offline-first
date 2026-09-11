export default {
  getByOrderId: `
    SELECT * FROM materials WHERE order_id = ?
  `,
  insert: `
    INSERT INTO materials (id, order_id, name, price, amount)
    VALUES (?, ?, ?, ?, ?)
  `,
  delete: `
    DELETE FROM materials WHERE id = ?
  `,
  updateServerId: `
    UPDATE materials SET server_id = ? WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO materials (id, server_id, order_id, order_server_id, name, price, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE materials
    SET name = ?, price = ?, amount = ?, updated_at = ?
    WHERE server_id = ?
  `
};
