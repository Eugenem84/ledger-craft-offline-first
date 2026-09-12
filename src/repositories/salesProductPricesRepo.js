// repositories/salesProductPricesRepo.js
//
// Цены продажи товаров по заказам (задача 9.3).
//
// Раньше таблица не заполнялась вообще: `sale_price` жил только в строке заказа
// (`order_product`), а в `sales_products_prices` не писал никто, и ни один расчёт её
// не читал. Теперь запись создаётся там же, где товар продаётся — при добавлении
// товара со склада в заказ (`orderProductRepo.add`), — и убирается вместе со строкой
// заказа. Читается на складе: «последняя цена продажи» товара
// (`queries/products.js` → `last_sale_price`).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/sales_products_prices.js'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  salePriceInsertParams,
  salePriceInsertFromServerParams,
  salePriceUpdateFromServerParams,
} from 'src/database/mappers/warehouse.js'

const TABLE = 'sales_products_prices'

/** Записи о продажах товаров заказа. */
export async function getByOrderId(orderId) {
  return dbAdapter.query(queries.getByOrderId, [orderId])
}

/** Ставит в очередь INSERT цены продажи. */
async function enqueueInsert({ id, orderId, productId, salePrice }) {
  await operationsRepo.enqueue([
    uuidv4(),
    'insert',
    TABLE,
    JSON.stringify({
      local_id: id,
      order_id: orderId,
      product_id: productId,
      sale_price: salePrice,
    }),
    Date.now(),
  ])
}

/**
 * Фиксирует цену продажи товара в заказе.
 *
 * @param {{ orderId: string, productId: string, salePrice: number|string }} input
 * @returns {Promise<string>} локальный id записи
 */
export async function add({ orderId, productId, salePrice }) {
  const id = uuidv4()
  const price = Math.round(Number(salePrice) || 0)

  await dbAdapter.execute(
    queries.insert,
    salePriceInsertParams({ id, orderId, productId, salePrice: price })
  )

  await enqueueInsert({ id, orderId, productId, salePrice: price })

  return id
}

/**
 * Убирает записи о продаже товара в заказе (строку товара удалили): снимает их с
 * сервера по `server_id` или отменяет ещё не уехавшие INSERT'ы.
 */
export async function removeByOrderAndProduct(orderId, productId) {
  const rows = await dbAdapter.query(queries.getByOrderAndProduct, [orderId, productId])

  for (const row of rows) {
    if (row.server_id) {
      await operationsRepo.enqueue([
        uuidv4(),
        'delete',
        TABLE,
        JSON.stringify({ id: row.server_id }),
        Date.now(),
      ])
    } else {
      await operationsRepo.removeByLocalId(TABLE, row.id)
    }

    await dbAdapter.execute(queries.delete, [row.id])
  }
}

/** Применяет запись о продаже с сервера (заказ и товар ищутся по серверным id). */
export async function applyServerRecord(record) {
  const order = await dbAdapter.queryOne('SELECT id FROM orders WHERE server_id = ?', [
    record.order_id,
  ])

  if (!order) {
    logger.warn(
      `[Sync] Нет локального заказа для sales_products_prices (server order_id=${record.order_id}). Строка пропущена.`
    )
    return
  }

  const product = await dbAdapter.queryOne('SELECT id FROM products WHERE server_id = ?', [
    record.product_id,
  ])

  if (!product) {
    logger.warn(
      `[Sync] Нет локального товара для sales_products_prices (server product_id=${record.product_id}). Строка пропущена.`
    )
    return
  }

  const existing = await dbAdapter.queryOne(queries.getByUuidOrServerId, [
    record.uuid_id ?? null,
    record.id,
  ])
  const updatedAt = toEpochSeconds(record.updated_at)

  if (!existing) {
    await dbAdapter.execute(
      queries.insertFromServer,
      salePriceInsertFromServerParams({
        localId: record.uuid_id ?? uuidv4(),
        serverId: record.id,
        localProductId: product.id,
        localOrderId: order.id,
        salePrice: record.sale_price ?? 0,
        createdAt: toEpochSeconds(record.created_at),
        updatedAt,
      })
    )
    return
  }

  if (updatedAt > Number(existing.updated_at || 0)) {
    await dbAdapter.execute(
      queries.updateFromServer,
      salePriceUpdateFromServerParams({
        salePrice: record.sale_price ?? 0,
        updatedAt,
        serverId: record.id,
      })
    )
  }
}

/** Полный сброс (вызывается из `syncService.fullReset()`). */
export async function clearAll() {
  await dbAdapter.execute('DELETE FROM sales_products_prices')
}
