export default {
  getByOrderId: `
    SELECT p.*, op.amount
    FROM products p
    JOIN order_products op ON p.id = op.product_id
    WHERE op.order_id = ?
  `,
  insert: `
    INSERT INTO order_products (order_id, product_id, amount, price)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE order_products
    SET amount = ?, price = ?
    WHERE order_id = ? AND product_id = ?
  `,
  delete: `
    DELETE FROM order_products WHERE order_id = ? AND product_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_products WHERE order_id = ?
  `
};
