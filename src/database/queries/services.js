export default {
  getAll: 'SELECT * FROM services',
  getByCategoryId: 'SELECT * FROM services WHERE category_id = ?',
  getById: 'SELECT * FROM services WHERE id = ?',
  insert: `
    INSERT INTO services (id, server_id, category_id, specialization_id, service, price)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  update: `
    UPDATE services
    SET service = ?, price = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM services WHERE id = ?',
  updateServerId: 'UPDATE services SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO services (id, server_id, category_id, specialization_id, service, price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE services
    SET service = ?, price = ?, updated_at = ?
    WHERE server_id = ?
  `,
};
