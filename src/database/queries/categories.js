export default {
  getAll: 'SELECT * FROM categories',
  getById: 'SELECT * FROM categories WHERE id = ?',
  insert: `
    INSERT INTO categories (id, server_id, specialization_id, category_name)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE categories
    SET category_name = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM categories WHERE id = ?',
  updateServerId: 'UPDATE categories SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO categories (id, server_id, specialization_id, category_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE categories
    SET category_name = ?, updated_at = ?
    WHERE server_id = ?
  `,
};
