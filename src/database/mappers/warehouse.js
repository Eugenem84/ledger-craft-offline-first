// src/database/mappers/warehouse.js
//
// Задача 8.3: именованные мапперы позиционных SQL-аргументов для склада.
// Задача 9.2 добавила три таблицы склада — приходы (`incoming_products`),
// остаток (`product_stocks`) и закупочные цены (`buy_product_prices`).
//
// Порядок колонок сверяется с `src/database/queries/{incoming_products,product_stocks,buy_product_prices}.js`.

/**
 * `queries.incoming_products.insert` — пишется только локально-новый приход.
 * @param {{ id: string, productId: string, supplier: string, quantity: number, byPrice: number }} input
 */
export function arrivalInsertParams({ id, productId, supplier, quantity, byPrice }) {
  return [id, null, productId, supplier, quantity, byPrice]
}

/**
 * `queries.incoming_products.insertFromServer`.
 * @param {{ localId: string, serverId: number, localProductId: string, supplier: string, quantity: number, byPrice: number, createdAt: number, updatedAt: number }} input
 */
export function arrivalInsertFromServerParams({
  localId,
  serverId,
  localProductId,
  supplier,
  quantity,
  byPrice,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localProductId, supplier, quantity, byPrice, createdAt, updatedAt]
}

/**
 * `queries.incoming_products.updateFromServer` (`WHERE id = ?` — последний параметр).
 * @param {{ serverId: number, supplier: string, quantity: number, byPrice: number, updatedAt: number, localId: string }} input
 */
export function arrivalUpdateFromServerParams({
  serverId,
  supplier,
  quantity,
  byPrice,
  updatedAt,
  localId,
}) {
  return [serverId, supplier, quantity, byPrice, updatedAt, localId]
}

/**
 * `queries.product_stocks.insert`.
 * @param {{ id: string, productId: string, quantity: number, supplier: string }} input
 */
export function stockInsertParams({ id, productId, quantity, supplier = '' }) {
  return [id, null, productId, quantity, supplier]
}

/**
 * `queries.product_stocks.insertFromServer`.
 * @param {{ localId: string, serverId: number, localProductId: string, quantity: number, supplier: string, createdAt: number, updatedAt: number }} input
 */
export function stockInsertFromServerParams({
  localId,
  serverId,
  localProductId,
  quantity,
  supplier,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localProductId, quantity, supplier, createdAt, updatedAt]
}

/**
 * `queries.product_stocks.updateFromServer` (`WHERE product_id = ?` — последний параметр).
 * @param {{ serverId: number, quantity: number, supplier: string, updatedAt: number, localProductId: string }} input
 */
export function stockUpdateFromServerParams({
  serverId,
  quantity,
  supplier,
  updatedAt,
  localProductId,
}) {
  return [serverId, quantity, supplier, updatedAt, localProductId]
}

/**
 * `queries.buy_product_prices.insert`.
 * @param {{ id: string, productId: string, buyPrice: number }} input
 */
export function buyPriceInsertParams({ id, productId, buyPrice }) {
  return [id, null, productId, buyPrice]
}

/**
 * `queries.buy_product_prices.insertFromServer`.
 * @param {{ localId: string, serverId: number, localProductId: string, buyPrice: number, createdAt: number, updatedAt: number }} input
 */
export function buyPriceInsertFromServerParams({
  localId,
  serverId,
  localProductId,
  buyPrice,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localProductId, buyPrice, createdAt, updatedAt]
}

/**
 * `queries.buy_product_prices.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 * @param {{ buyPrice: number, updatedAt: number, serverId: number }} input
 */
export function buyPriceUpdateFromServerParams({ buyPrice, updatedAt, serverId }) {
  return [buyPrice, updatedAt, serverId]
}

/**
 * `queries.sales_products_prices.insert`.
 * @param {{ id: string, orderId: string, productId: string, salePrice: number }} input
 */
export function salePriceInsertParams({ id, orderId, productId, salePrice }) {
  return [id, null, productId, orderId, salePrice]
}

/**
 * `queries.sales_products_prices.insertFromServer`.
 * @param {{ localId: string, serverId: number, localProductId: string, localOrderId: string, salePrice: number, createdAt: number, updatedAt: number }} input
 */
export function salePriceInsertFromServerParams({
  localId,
  serverId,
  localProductId,
  localOrderId,
  salePrice,
  createdAt,
  updatedAt,
}) {
  return [localId, serverId, localProductId, localOrderId, salePrice, createdAt, updatedAt]
}

/**
 * `queries.sales_products_prices.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 * @param {{ salePrice: number, updatedAt: number, serverId: number }} input
 */
export function salePriceUpdateFromServerParams({ salePrice, updatedAt, serverId }) {
  return [salePrice, updatedAt, serverId]
}
