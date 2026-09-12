export default {
  getAll: `
    SELECT * FROM specializations
  `,
  getById: `
    SELECT * FROM specializations
    WHERE id = ?
  `,
  findByServerId: `
    SELECT * FROM specializations
    WHERE server_id = ?
  `,
  insert: `
    INSERT INTO specializations (id, server_id, name, preset_key, accent, features, archived, template_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE specializations
    SET name = ?, preset_key = ?, accent = ?, features = ?, archived = ?, template_version = ?,
        updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM specializations WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO specializations (id, server_id, name, preset_key, accent, features, archived, template_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE specializations
    SET name = ?, preset_key = ?, accent = ?, features = ?, archived = ?, template_version = ?, updated_at = ?
    WHERE server_id = ?
  `
}