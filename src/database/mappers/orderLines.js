// src/database/mappers/orderLines.js
//
// Задача 8.3: именованные мапперы позиционных аргументов SQL для строк заказа —
// работ (`order_service`), товаров со склада (`order_product`) и ручных позиций
// (`materials`, решение D2).
//
// Как и в `mappers/orders.js`, порядок колонок описан **один раз** здесь и сверяется с
// `src/database/queries/{order_service,order_product,materials}.js`.

/**
 * `queries.order_service.insert` — строка «работа в заказе».
 * У связки нет собственного PK на сервере, поэтому `server_id`/`*_server_id` пустые
 * (заполняются после синка).
 *
 * ⚠️ `salePrice` пишем **сразу на клиенте** (цена работы из каталога на момент
 * добавления), а не оставляем `null` «на сервер». Иначе до первого синка аналитика
 * (она офлайн-первая: `SUM(quantity * sale_price)`) считала бы работы нулём — именно
 * так «аналитика не считала работы». Сервер, если `sale_price` пришёл, доверяет ему
 * и не подменяет цену каталога (см. `docs/API-INTEGRATION.md` §2.1 — спец-обработка
 * `order_service`).
 *
 * @param {{ id: string, orderId: string, serviceId: string, salePrice?: number|null }} input
 * @returns {Array<string|number|null>}
 */
export function orderServiceLineInsertParams({ id, orderId, serviceId, salePrice }) {
  return [
    id, // id (локальный UUID)
    null, // server_id (у связки его нет)
    orderId, // order_id (локальный ID заказа)
    null, // order_server_id
    serviceId, // service_id (локальный ID услуги)
    null, // service_server_id
    salePrice ?? null, // sale_price (цена работы на момент добавления)
    1, // quantity
  ]
}

/**
 * `queries.order_service.insertFromServer`.
 *
 * @param {object} input
 * @param {string} input.localId клиентский UUID строки (он же `uuid_id` на сервере)
 * @param {number|null} input.serverId
 * @param {string} input.localOrderId
 * @param {number} input.orderServerId
 * @param {string} input.localServiceId
 * @param {number} input.serviceServerId
 * @param {number|null} input.salePrice
 * @param {number} input.quantity
 * @param {number} input.createdAt UNIX-секунды
 * @param {number} input.updatedAt UNIX-секунды
 * @returns {Array<string|number|null>}
 */
export function orderServiceLineInsertFromServerParams({
  localId,
  serverId,
  localOrderId,
  orderServerId,
  localServiceId,
  serviceServerId,
  salePrice,
  quantity,
  createdAt,
  updatedAt,
}) {
  return [
    localId,
    serverId,
    localOrderId,
    orderServerId,
    localServiceId,
    serviceServerId,
    salePrice,
    quantity,
    createdAt,
    updatedAt,
  ]
}

/**
 * `queries.order_service.updateFromServer` (`WHERE id = ?` — последний параметр).
 *
 * @param {{ localOrderId: string, orderServerId: number, localServiceId: string, serviceServerId: number, salePrice: number|null, quantity: number, updatedAt: number, localLineId: string }} input
 * @returns {Array<string|number|null>}
 */
export function orderServiceLineUpdateFromServerParams({
  localOrderId,
  orderServerId,
  localServiceId,
  serviceServerId,
  salePrice,
  quantity,
  updatedAt,
  localLineId,
}) {
  return [
    localOrderId,
    orderServerId,
    localServiceId,
    serviceServerId,
    salePrice,
    quantity,
    updatedAt,
    localLineId,
  ]
}

/**
 * `queries.order_product.insert` — товар со склада в заказе.
 *
 * `buyPrice` — себестоимость на момент продажи (задачи 9.5/9.6): `null` значит
 * «закупка неизвестна» (маржа по строке не считается), а не «закупка 0».
 *
 * @param {{ id: string, orderId: string, productId: string, salePrice: number, buyPrice: number|null, quantity: number }} input
 * @returns {Array<string|number|null>}
 */
export function orderProductLineInsertParams({ id, orderId, productId, salePrice, buyPrice, quantity }) {
  return [id, orderId, productId, salePrice, quantity, buyPrice ?? null]
}

/**
 * `queries.order_product.insertFromServer`.
 *
 * @param {{ localId: string, serverId: number, localOrderId: string, localProductId: string, salePrice: number, buyPrice: number|null, quantity: number, createdAt: number, updatedAt: number }} input
 * @returns {Array<string|number|null>}
 */
export function orderProductLineInsertFromServerParams({
  localId,
  serverId,
  localOrderId,
  localProductId,
  salePrice,
  buyPrice,
  quantity,
  createdAt,
  updatedAt,
}) {
  return [
    localId,
    serverId,
    localOrderId,
    localProductId,
    salePrice,
    quantity,
    buyPrice ?? null,
    createdAt,
    updatedAt,
  ]
}

/**
 * `queries.order_product.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 *
 * @param {{ salePrice: number, buyPrice: number|null, quantity: number, updatedAt: number, serverId: number }} input
 * @returns {Array<number|null>}
 */
export function orderProductLineUpdateFromServerParams({
  salePrice,
  buyPrice,
  quantity,
  updatedAt,
  serverId,
}) {
  return [salePrice, quantity, buyPrice ?? null, updatedAt, serverId]
}

/**
 * `queries.materials.insert` — ручная позиция заказа (`name/price/amount`).
 *
 * `buyPrice` — сколько позиция стоила мастеру (задачи 9.5/9.6): вводится в форме,
 * потому что для «купленного по пути» закупку взять больше неоткуда.
 *
 * @param {{ id: string, orderId: string, name: string, price: number, amount: number, buyPrice: number|null }} input
 * @returns {Array<string|number|null>}
 */
export function materialLineInsertParams({ id, orderId, name, price, amount, buyPrice }) {
  return [id, orderId, name, price, amount, buyPrice ?? null]
}

/**
 * `queries.materials.insertFromServer`.
 *
 * @param {{ localId: string, serverId: number, localOrderId: string, orderServerId: number, name: string, price: number, amount: number, buyPrice: number|null, createdAt: number, updatedAt: number }} input
 * @returns {Array<string|number|null>}
 */
export function materialLineInsertFromServerParams({
  localId,
  serverId,
  localOrderId,
  orderServerId,
  name,
  price,
  amount,
  buyPrice,
  createdAt,
  updatedAt,
}) {
  return [
    localId,
    serverId,
    localOrderId,
    orderServerId,
    name,
    price,
    amount,
    buyPrice ?? null,
    createdAt,
    updatedAt,
  ]
}

/**
 * `queries.materials.updateFromServer` (`WHERE server_id = ?` — последний параметр).
 *
 * @param {{ name: string, price: number, amount: number, buyPrice: number|null, updatedAt: number, serverId: number }} input
 * @returns {Array<string|number|null>}
 */
export function materialLineUpdateFromServerParams({
  name,
  price,
  amount,
  buyPrice,
  updatedAt,
  serverId,
}) {
  return [name, price, amount, buyPrice ?? null, updatedAt, serverId]
}
