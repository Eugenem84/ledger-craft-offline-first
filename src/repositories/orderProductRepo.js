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
import * as salesProductPricesRepo from 'src/repositories/salesProductPricesRepo.js'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  orderProductLineInsertParams,
  orderProductLineInsertFromServerParams,
  orderProductLineUpdateFromServerParams,
} from 'src/database/mappers/orderLines.js'

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
 * @param {number|null} [buyPrice] - себестоимость на момент продажи (задачи 9.5/9.6);
 *   `null` — закупка неизвестна, маржа по строке не считается
 * @returns {Promise<string>} локальный id строки
 */
export async function add(orderId, productId, amount, price, buyPrice = null) {
  const id = uuidv4()
  const quantity = amount ?? 1
  const salePrice = price ?? 0
  const cost = buyPrice ?? null

  await dbAdapter.execute(
    queries.insert,
    orderProductLineInsertParams({
      id,
      orderId,
      productId,
      salePrice,
      buyPrice: cost,
      quantity,
    })
  )

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
      buy_price: cost,
    }),
    Date.now(),
  ])

  // Продажа фиксируется и в истории цен (задача 9.3): раньше `sales_products_prices`
  // не заполнялась никем, а склад читает из неё «последнюю цену продажи» товара.
  await salesProductPricesRepo.add({ orderId, productId, salePrice })

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

  // Вместе со строкой заказа убираем и запись о продаже (задача 9.3): иначе история
  // цен «врёт» (товар убрали, а последняя продажа за ним осталась). Пару «заказ +
  // товар» берём из строки, а если вызывающий передал только `id`/`server_id` —
  // дочитываем из БД (строка ещё существует: удаляем её ниже).
  const source =
    line.order_id && line.product_id
      ? line
      : await dbAdapter.queryOne('SELECT order_id, product_id FROM order_product WHERE id = ?', [
          line.id,
        ])

  if (source?.order_id && source?.product_id) {
    await salesProductPricesRepo.removeByOrderAndProduct(source.order_id, source.product_id)
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
    await dbAdapter.execute(
      queries.insertFromServer,
      orderProductLineInsertFromServerParams({
        localId: uuidv4(), // локальный UUID строки
        serverId: record.id,
        localOrderId: order.id,
        localProductId: product.id,
        salePrice: record.sale_price ?? 0,
        buyPrice: record.buy_price ?? null,
        quantity: record.quantity ?? 1,
        createdAt,
        updatedAt,
      })
    )
    return
  }

  if (updatedAt > existing.updated_at) {
    await dbAdapter.execute(
      queries.updateFromServer,
      orderProductLineUpdateFromServerParams({
        salePrice: record.sale_price ?? 0,
        buyPrice: record.buy_price ?? null,
        quantity: record.quantity ?? 1,
        updatedAt,
        serverId: record.id,
      })
    )
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId])
}
