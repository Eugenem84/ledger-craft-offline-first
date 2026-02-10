export default {
  getAll: 'SELECT * FROM product_categories',
  getById: 'SELECT * FROM product_categories WHERE id = ?',
  getBySpecializationId: 'SELECT * FROM product_categories WHERE specialization_id = ?',
  insert: `
    INSERT INTO product_categories (id, server_id, specialization_id, name)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE product_categories
    SET name = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM product_categories WHERE id = ?',
  updateServerId: 'UPDATE product_categories SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO product_categories (id, server_id, specialization_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s', ?), strftime('%s', ?))
  `,
  updateFromServer: `
    UPDATE product_categories
    SET name = ?, updated_at = strftime('%s', ?)
    WHERE server_id = ?
  `,
};
