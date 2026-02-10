export default {
  getAll: 'SELECT * FROM products',
  getById: 'SELECT * FROM products WHERE id = ?',
  getByCategoryId: 'SELECT * FROM products WHERE product_category_id = ?',
  insert: `
    INSERT INTO products (id, server_id, name, description, manufacturer, product_number, weight, base_sale_price, product_category_id, product_category_server_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  update: `
    UPDATE products
    SET name = ?, description = ?, manufacturer = ?, product_number = ?, weight = ?, base_sale_price = ?, product_category_id = ?, product_category_server_id = ?
    WHERE id = ?
  `,
  delete: 'DELETE FROM products WHERE id = ?',
  updateServerId: 'UPDATE products SET server_id = ? WHERE id = ?',
  insertFromServer: `
    INSERT INTO products (id, server_id, name, description, manufacturer, product_number, weight, base_sale_price, product_category_id, product_category_server_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', ?), strftime('%s', ?))
  `,
  updateFromServer: `
    UPDATE products
    SET name = ?, description = ?, manufacturer = ?, product_number = ?, weight = ?, base_sale_price = ?, product_category_id = ?, product_category_server_id = ?, updated_at = strftime('%s', ?)
    WHERE server_id = ?
  `,
};
