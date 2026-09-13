export default {
  getAll: 'SELECT * FROM categories',
  getById: 'SELECT * FROM categories WHERE id = ?',
  // Строгий фильтр каталога по рабочему профилю (Фаза 10). Параметров два,
  // потому что `categories.specialization_id` хранит либо локальный UUID (запись
  // ещё не уехала), либо серверный id (после синка) — см. `categoriesRepo`.
  getBySpecializationId:
    'SELECT * FROM categories WHERE specialization_id = ? OR specialization_id = ?',
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
