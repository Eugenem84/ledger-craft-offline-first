export default {
  getAll: 'SELECT * FROM categories',
  getById: 'SELECT * FROM categories WHERE id = ?',
  getBySpecializationId: 'SELECT * FROM categories WHERE specialization_id = ?',
  // Идемпотентность пресета (Фаза 10, задача 10.4): «уже перенесено?».
  findBySpecializationAndTemplateKey:
    'SELECT * FROM categories WHERE template_key = ? AND specialization_id = ?',
  insert: `
    INSERT INTO categories (id, server_id, specialization_id, category_name, template_key)
    VALUES (?, ?, ?, ?, ?)
  `,
  update: `
    UPDATE categories
    SET category_name = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM categories WHERE id = ?',
  updateServerId: 'UPDATE categories SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO categories (id, server_id, specialization_id, category_name, template_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE categories
    SET category_name = ?, template_key = ?, updated_at = ?
    WHERE server_id = ?
  `,
};
