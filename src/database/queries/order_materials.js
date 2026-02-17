export default {
  getByOrderId: `
    SELECT m.*, om.amount
    FROM materials m
    JOIN order_materials om ON m.id = om.material_id
    WHERE om.order_id = ?
  `,
  insert: `
    INSERT INTO order_materials (order_id, material_id, amount, price)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE order_materials
    SET amount = ?, price = ?
    WHERE order_id = ? AND material_id = ?
  `,
  delete: `
    DELETE FROM order_materials WHERE order_id = ? AND material_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_materials WHERE order_id = ?
  `
};
