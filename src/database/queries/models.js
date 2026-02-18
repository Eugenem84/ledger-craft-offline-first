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
  insert: `
    INSERT INTO equipment_models (id, server_id, name, specialization_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE equipment_models
    SET name = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM equipment_models WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO equipment_models (id, server_id, name, specialization_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE equipment_models
    SET name = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE equipment_models
    SET server_id = ?
    WHERE id = ?
  `
};
