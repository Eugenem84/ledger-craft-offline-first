export default {
  getAll: `
    SELECT * FROM equipment_models
  `,
  getById: `
    SELECT * FROM equipment_models
    WHERE id = ?
  `,
  findByServerId: `
    SELECT * FROM equipment_models
    WHERE server_id = ?
  `,
  // Идемпотентность пресета (Фаза 10, задача 10.4).
  findBySpecializationAndTemplateKey: `
    SELECT * FROM equipment_models
    WHERE template_key = ? AND specialization_id = ?
  `,
  insert: `
    INSERT INTO equipment_models (id, server_id, name, specialization_id, specialization_server_id, template_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE equipment_models
    SET name = ?, specialization_id = ?, specialization_server_id = ?, template_key = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM equipment_models WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO equipment_models (id, server_id, name, specialization_id, specialization_server_id, template_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE equipment_models
    SET name = ?, specialization_id = ?, specialization_server_id = ?, template_key = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE equipment_models
    SET server_id = ?
    WHERE id = ?
  `
};
