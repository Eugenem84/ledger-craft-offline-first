export default {
  getByOrderId: `
    SELECT p.*, op.quantity as amount, op.sale_price as price, op.buy_price as buy_price
    FROM products p
    JOIN order_product op ON p.id = op.product_id
    WHERE op.order_id = ?
  `,
  getLinesByOrderId: `
    SELECT * FROM order_product WHERE order_id = ?
  `,
  insert: `
    INSERT INTO order_product (id, order_id, product_id, sale_price, quantity, buy_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  update: `
    UPDATE order_product
    SET quantity = ?, sale_price = ?, buy_price = ?, updated_at = strftime('%s','now')
    WHERE id = ?
  `,
  delete: `
    DELETE FROM order_product WHERE id = ?
  `,
  deleteByOrderId: `
    DELETE FROM order_product WHERE order_id = ?
  `,
  updateServerId: `
    UPDATE order_product SET server_id = ? WHERE id = ?
  `,
  insertFromServer: `
    INSERT INTO order_product (id, server_id, order_id, product_id, sale_price, quantity, buy_price, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  updateFromServer: `
    UPDATE order_product
    SET sale_price = ?, quantity = ?, buy_price = ?, updated_at = ?
    WHERE server_id = ?
  `
};
