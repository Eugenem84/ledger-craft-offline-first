export default {
  getAll: `
    SELECT * FROM clients
  `,
  getById: `
    SELECT * FROM clients
    WHERE id = ?
  `,
  findByServerId: `
    SELECT * FROM clients
    WHERE server_id = ?
  `,
  insert: `
    INSERT INTO clients (id, server_id, specialization_id, name, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
  `,
  update: `
    UPDATE clients
    SET server_id = ?, specialization_id = ?, name = ?, phone = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM clients WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO clients (id, server_id, specialization_id, name, phone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE clients
    SET server_id = ?, specialization_id = ?, name = ?, phone = ?, created_at = ?, updated_at = ?
    WHERE server_id = ?
  `,
  updateServerId: `
    UPDATE clients
    SET server_id = ?
    WHERE id = ?
  `
};
