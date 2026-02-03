export default {
  getAll: `
    SELECT * FROM specializations
  `,
  getById: `
    SELECT * FROM specializations
    WHERE id = ?
  `,
  insert: `
    INSERT INTO specializations (id, server_id, name, created_at, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE specializations
    SET server_id = ?, name = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM specializations WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO specializations (id, server_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE specializations
    SET server_id = ?, name = ?, created_at = ?, updated_at = ?
    WHERE id = ?
  `
};
