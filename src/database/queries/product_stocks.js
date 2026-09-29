// src/database/queries/product_stocks.js
//
// Остаток товара (задача 9.2): одна строка на товар (`Product::stock()` — hasOne).
//
// Остаток **считается из движений** (правка владельца 29.09.2026): UI и уведомления
// берут его из `productsRepo.getStockQuantity` (Σ приходов − Σ расходов), а не из этой
// таблицы. `product_stocks` — legacy: серверный счётчик, который рос только от приходов
// и поэтому не сходился после продаж. Здесь остались чтение и приём серверной выгрузки
// (`applyServerRecord`) — для совместимости с сервером.
export default {
  getByProductId: 'SELECT * FROM product_stocks WHERE product_id = ?',
  getByServerId: 'SELECT * FROM product_stocks WHERE server_id = ?',
  insertFromServer: `
    INSERT INTO product_stocks (id, server_id, product_id, quantity, supplier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  // Ключ — товар (строка одна на товар): так «наша» строка превращается в «серверную»
  // и не плодит дубль.
  updateFromServer: `
    UPDATE product_stocks
    SET server_id = ?, quantity = ?, supplier = ?, updated_at = ?
    WHERE product_id = ?
  `,
}
