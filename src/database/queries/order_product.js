export default {
  getByOrderId: `
    SELECT p.*, op.amount, op.price
    FROM products p
    JOIN order_product op ON p.id = op.product_id
    WHERE op.order_id = ?
  `,
  insert: `
    INSERT INTO order_product (order_id, product_id, amount, price)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE order_product
    SET amount = ?, price = ?
    WHERE order_id = ? AND product_id = ?
  `,
  delete: `
    DELETE FROM order_product WHERE order_id = ? AND product_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_product WHERE order_id = ?
  `
};
