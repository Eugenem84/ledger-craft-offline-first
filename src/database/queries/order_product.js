export default {
  getByOrderId: `
    SELECT p.*, op.quantity as amount, op.sale_price as price
    FROM products p
    JOIN order_product op ON p.id = op.product_id
    WHERE op.order_id = ?
  `,
  insert: `
    INSERT INTO order_product (order_id, product_id, quantity, sale_price)
    VALUES (?, ?, ?, ?)
  `,
  update: `
    UPDATE order_product
    SET quantity = ?, sale_price = ?
    WHERE order_id = ? AND product_id = ?
  `,
  delete: `
    DELETE FROM order_product WHERE order_id = ? AND product_id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_product WHERE order_id = ?
  `
};
