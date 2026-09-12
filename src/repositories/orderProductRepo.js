// repositories/orderProductRepo.js
//
// Товары в заказе (связка заказ ↔ товар со склада). Любое изменение сразу пишется
// в локальную БД и ставит операцию в очередь `operations`; `order_id`/`product_id`
// уходят на сервер уже как серверные id (трансформация FK в syncService).
//
// ⚠️ Правка строк на странице заказа пока делается как «удалить все и добавить заново»
// (см. OrderDetailsPage.updateOrder), поэтому отдельного `update` у репозитория нет —
// его стоит добавить вместе с рефакторингом страницы (Фаза 8).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/order_product.js'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'

const TABLE = 'order_product'

export async function getByOrderId(orderId) {
  return dbAdapter.query(queries.getByOrderId, [orderId])
}

/**
 * Добавляет товар в заказ.
 * @param {string} orderId - локальный id заказа
 * @param {string} productId - локальный id товара
 * @param {number} amount - количество (`quantity` на сервере)
 * @param {number} price - цена продажи (`sale_price` на сервере), рубли
 * @returns {Promise<string>} локальный id строки
 */
export async function add(orderId, productId, amount, price) {
  const id = uuidv4()
  const quantity = amount ?? 1
  const salePrice = price ?? 0

  await dbAdapter.execute(queries.insert, [id, orderId, productId, salePrice, quantity])

  await operationsRepo.enqueue([
    uuidv4(),
    'insert',
    TABLE,
    JSON.stringify({
      local_id: id,
      order_id: orderId,
      product_id: productId,
      sale_price: salePrice,
      quantity,
    }),
    Date.now(),
  ])

  return id
}

/**
 * Удаляет строку заказа: снимает её с сервера (если она туда уехала) и убирает локально.
 * @param {{id: string, server_id?: number|null}} line
 */
export async function remove(line) {
  if (line.server_id) {
    await operationsRepo.enqueue([
      uuidv4(),
      'delete',
      TABLE,
      JSON.stringify({ id: line.server_id }),
      Date.now(),
    ])
  } else {
    // Строка ещё не уезжала — отменяем незавершённый INSERT.
    await operationsRepo.removeByLocalId(TABLE, line.id)
  }

  await dbAdapter.execute(queries.delete, [line.id])
}

/**
 * Удаляет все товары заказа (страница правки делает «удалить и добавить заново»).
 */
export async function removeByOrderId(orderId) {
  const lines = await dbAdapter.query(queries.getLinesByOrderId, [orderId])

  for (const line of lines) {
    await remove(line)
  }
}

/**
 * Применяет запись с сервера: находит локальные заказ/товар по server_id и создаёт/обновляет строку.
 */
export async function applyServerRecord(record) {
  const order = await dbAdapter.queryOne(
    'SELECT id FROM orders WHERE server_id = ?',
    [record.order_id]
  )

  if (!order) {
    logger.warn(`[Sync] Нет локального заказа для order_product (server order_id=${record.order_id}). Строка пропущена.`)
    return
  }

  const product = await dbAdapter.queryOne(
    'SELECT id FROM products WHERE server_id = ?',
    [record.product_id]
  )

  if (!product) {
    logger.warn(`[Sync] Нет локального товара для order_product (server product_id=${record.product_id}). Строка пропущена.`)
    return
  }

  const existing = await dbAdapter.queryOne(
    'SELECT * FROM order_product WHERE server_id = ?',
    [record.id]
  )

  const createdAt = toEpochSeconds(record.created_at)
  const updatedAt = toEpochSeconds(record.updated_at)

  if (!existing) {
    await dbAdapter.execute(queries.insertFromServer, [
      uuidv4(),            // id (локальный UUID)
      record.id,           // server_id
      order.id,            // order_id (локальный id заказа)
      product.id,          // product_id (локальный id товара)
      record.sale_price ?? 0,
      record.quantity ?? 1,
      createdAt,
      updatedAt,
    ])
    return
  }

  if (updatedAt > existing.updated_at) {
    await dbAdapter.execute(queries.updateFromServer, [
      record.sale_price ?? 0,
      record.quantity ?? 1,
      updatedAt,
      record.id, // WHERE server_id = ?
    ])
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId])
}
