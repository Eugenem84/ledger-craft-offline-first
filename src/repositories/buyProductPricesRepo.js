// repositories/buyProductPricesRepo.js
//
// Закупочные цены товара (задача 9.2; расчёт маржи — задача 9.5).
//
// На сервере это **история**: строк может быть несколько (цена на момент каждой
// закупки). Поэтому приход либо обновляет последнюю строку товара, либо создаёт
// новую, а выдача с сервера применяется по `server_id` (каждая запись отдельно).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/buy_product_prices.js'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  buyPriceInsertParams,
  buyPriceInsertFromServerParams,
  buyPriceUpdateFromServerParams,
} from 'src/database/mappers/warehouse.js'

const TABLE = 'buy_product_prices'

/** Актуальная закупочная цена товара (последняя по `created_at`). */
export async function getLatestByProductId(productId) {
  const rows = await dbAdapter.query(queries.getLatestByProductId, [productId])
  return rows.length ? rows[0] : null
}

/** Ставит ожидающий INSERT закупочной цены (используется и при перезаписи цены). */
async function enqueueInsert({ id, productId, buyPrice }) {
  await operationsRepo.enqueue([
    uuidv4(),
    'insert',
    TABLE,
    JSON.stringify({ local_id: id, product_id: productId, buy_price: buyPrice }),
    Date.now(),
  ])
}

/**
 * Локальная закупочная цена после прихода (плюс операция для сервера).
 *
 * @param {string} productId локальный UUID товара
 * @param {number} buyPrice цена закупки (целые рубли)
 * @returns {Promise<string>} локальный id строки цены
 */
export async function applyLocalArrival(productId, buyPrice) {
  const price = Math.round(Number(buyPrice) || 0)
  const existing = await getLatestByProductId(productId)

  if (!existing) {
    const id = uuidv4()
    await dbAdapter.execute(queries.insert, buyPriceInsertParams({ id, productId, buyPrice: price }))
    await enqueueInsert({ id, productId, buyPrice: price })

    return id
  }

  await dbAdapter.execute(queries.updateValue, [price, existing.id])

  if (existing.server_id) {
    await operationsRepo.enqueue([
      uuidv4(),
      'update',
      TABLE,
      JSON.stringify({ id: existing.server_id, buy_price: price }),
      Date.now(),
    ])

    return existing.id
  }

  // Строка ещё не уезжала: payload операции сериализован в момент постановки,
  // поэтому ожидающий INSERT переписываем — иначе на сервер ушла бы старая цена.
  await operationsRepo.removeByLocalId(TABLE, existing.id)
  await enqueueInsert({ id: existing.id, productId, buyPrice: price })

  return existing.id
}

/**
 * Цена закупки товара, заданная вручную — в карточке товара, а не приходом.
 *
 * Нужна для маржи: пока у товара нет закупки, «Аналитика» считает себестоимость
 * нулевой и показывает наценку прочерком (правка владельца 15.09.2026). Семантика та
 * же, что у прихода: одна актуальная закупка на товар, она уезжает очередью синка.
 *
 * @param {string} productId локальный UUID товара
 * @param {number} buyPrice целые рубли
 * @returns {Promise<string>} локальный id строки цены
 */
export async function saveBuyPrice(productId, buyPrice) {
  return applyLocalArrival(productId, buyPrice)
}

/** Применяет закупочную цену с сервера (история — ключ `server_id`). */
export async function applyServerRecord(record) {
  const product = await dbAdapter.queryOne('SELECT id FROM products WHERE server_id = ?', [
    record.product_id,
  ])

  if (!product) {
    logger.warn(
      `[Sync] Нет локального товара для закупочной цены (server product_id=${record.product_id}). Строка пропущена.`
    )
    return
  }

  const existing = await dbAdapter.queryOne(queries.getByServerId, [record.id])
  const updatedAt = toEpochSeconds(record.updated_at)

  if (!existing) {
    await dbAdapter.execute(
      queries.insertFromServer,
      buyPriceInsertFromServerParams({
        localId: uuidv4(),
        serverId: record.id,
        localProductId: product.id,
        buyPrice: record.buy_price ?? 0,
        createdAt: toEpochSeconds(record.created_at),
        updatedAt,
      })
    )
    return
  }

  if (updatedAt > Number(existing.updated_at || 0)) {
    await dbAdapter.execute(
      queries.updateFromServer,
      buyPriceUpdateFromServerParams({
        buyPrice: record.buy_price ?? 0,
        updatedAt,
        serverId: record.id,
      })
    )
  }
}

/** Полный сброс (вызывается из `syncService.fullReset()`). */
export async function clearAll() {
  await dbAdapter.execute('DELETE FROM buy_product_prices')
}
