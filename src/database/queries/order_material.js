export default {
  getByOrderId: `
    SELECT m.*, om.amount, om.price
    FROM materials m
    JOIN order_material om ON m.id = om.material_id
    WHERE om.order_id = ?
  `,
  insert: `
    INSERT INTO order_material (order_id, material_id, amount, price)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE order_material
    SET amount = ?, price = ?
    WHERE order_id = ? AND material_id = ?
  `,
  delete: `
    DELETE FROM order_material WHERE order_id = ? AND material_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_material WHERE order_id = ?
  `
};
