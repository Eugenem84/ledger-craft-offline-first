// repositories/incomingProductsRepo.js
//
// Приходы товара (задача 9.2) и единственная «доменная операция» склада —
// `receiveArrival()` («приходуем товар»).
//
// Было: диалог прихода отправлял `POST /arrival_product` через `boot/axios.js`
// с фиктивным `baseURL` — офлайн приход просто не работал, а на сервере повтор
// удваивал остаток. Стало: приход пишется в локальную БД (в одной транзакции) и
// уезжает **очередью синка**, как все остальные изменения.
//
// Кто что пишет:
//   • клиент — строку прихода (`incoming_products`), закупочную цену
//     (`buy_product_prices`) и цену продажи товара (`products.base_sale_price`);
//   • сервер — остаток: `IncomingProductRepository::recordArrival()` создаёт/находит
//     строку прихода по `uuid_id` и увеличивает склад **ровно один раз**. Поэтому
//     операции по `product_stocks` не ставим (иначе остаток учтёлся бы дважды),
//     а локальный остаток обновляем оптимистично (`productStocksRepo.applyLocalArrival`).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/incoming_products.js'
import operationsRepo from 'src/repositories/operationsRepo'
import * as productStocksRepo from 'src/repositories/productStocksRepo.js'
import * as buyProductPricesRepo from 'src/repositories/buyProductPricesRepo.js'
import * as productsRepo from 'src/repositories/productsRepo.js'
import { normalizeQuantity } from 'src/utils/quantity.js'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  arrivalInsertParams,
  arrivalInsertFromServerParams,
  arrivalUpdateFromServerParams,
} from 'src/database/mappers/warehouse.js'

const TABLE = 'incoming_products'

/** Приходы товара (история; пригодится складу и марже — задачи 9.3/9.5). */
export async function getByProductId(productId) {
  return dbAdapter.query(queries.getByProductId, [productId])
}

/**
 * Оформляет приход товара офлайн.
 *
 * @param {{ product: object, byPrice: number|string, arrivalQuantity: number|string,
 *   baseSalePrice?: number|string|null, supplier?: string }} input
 * @returns {Promise<{arrivalId: string, quantity: number, byPrice: number,
 *   stockQuantity: number, baseSalePrice: number|null}>}
 */
export async function receiveArrival({
  product,
  byPrice,
  arrivalQuantity,
  baseSalePrice = null,
  supplier = '',
}) {
  if (!product?.id) {
    throw new Error('Приход невозможен: товар не выбран')
  }

  const quantity = Math.trunc(Number(arrivalQuantity))

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Укажите количество поступления — целое число больше нуля')
  }

  const purchasePrice = Math.round(Number(byPrice) || 0)
  const arrivalId = uuidv4()
  const productServerId = product.server_id || null
  let stockQuantity = 0

  // Локальные записи — одной транзакцией: либо приход целиком, либо ничего.
  // Так же поступает и сервер (`ProductController::arrival` → `DB::transaction`).
  await dbAdapter.transaction(async () => {
    await dbAdapter.execute(
      queries.insert,
      arrivalInsertParams({
        id: arrivalId,
        productId: product.id,
        supplier,
        quantity,
        byPrice: purchasePrice,
      })
    )

    stockQuantity = await productStocksRepo.applyLocalArrival(product.id, quantity, supplier)
    await buyProductPricesRepo.applyLocalArrival(product.id, purchasePrice)
  })

  // Приход уезжает очередью синка: сервер создаст/найдёт строку по `uuid_id`
  // (идемпотентность) и увеличит склад ровно один раз.
  await operationsRepo.enqueue([
    uuidv4(),
    'insert',
    TABLE,
    JSON.stringify({
      local_id: arrivalId,
      product_id: product.id,
      product_server_id: productServerId,
      supplier,
      quantity,
      by_price: purchasePrice,
    }),
    Date.now(),
  ])

  // Цена продажи: приходом её обновляет и сервер (`products.base_sale_price`),
  // локально делаем то же — но только если пользователь её действительно изменил.
  const salePrice =
    baseSalePrice === '' || baseSalePrice == null ? null : Math.round(Number(baseSalePrice))
  let appliedSalePrice = product.base_sale_price ?? null

  if (salePrice !== null && salePrice !== Number(product.base_sale_price ?? 0)) {
    await productsRepo.update({ ...product, base_sale_price: salePrice })
    appliedSalePrice = salePrice
  }

  logger.log(
    `[Склад] Приход сохранён офлайн: «${product.name}» +${quantity}, остаток ${stockQuantity}`
  )

  return {
    arrivalId,
    quantity,
    byPrice: purchasePrice,
    stockQuantity,
    baseSalePrice: appliedSalePrice,
  }
}

/**
 * Правит приход (правка владельца 15.09.2026: «историю приходов тоже должна быть
 * возможность редактировать»).
 *
 * Что можно менять — диктует сервер (`IncomingProductRepository::recordArrival()`):
 *
 *   • приход ещё **не уехал** (нет `server_id`) — правим всё: количество, закупку,
 *     поставщика. Остаток корректируем на дельту (`productStocksRepo.adjustQuantity`),
 *     а ожидающий INSERT в очереди переписываем: payload операции сериализуется в момент
 *     постановки, поэтому иначе на сервер ушло бы старое количество (и он приходовал бы
 *     не то, что видит мастер);
 *   • приход **уже на сервере** — количество менять нельзя: сервер увеличивает склад по
 *     приходу ровно один раз и при повторной отправке только правит строку, остаток не
 *     пересчитывает. Правка количества тихо разошлась бы со складом, поэтому отклоняем
 *     её явной ошибкой, а закупку и поставщика (остаток они не меняют) отправляем обычным
 *     `update`.
 *
 * @param {string} arrivalId локальный id прихода (`incoming_products.id`)
 * @param {{quantity?: unknown, byPrice?: unknown, supplier?: unknown}} patch
 * @returns {Promise<{arrivalId: string, productId: string, quantity: number,
 *   byPrice: number, supplier: string, stockQuantity: number|null, synced: boolean}>}
 */
export async function updateArrival(arrivalId, { quantity, byPrice, supplier } = {}) {
  const arrival = await dbAdapter.queryOne(queries.getById, [arrivalId])

  if (!arrival) {
    throw new Error('Приход не найден — возможно, он уже удалён или не уехал в синк')
  }

  const nextQuantity = normalizeQuantity(quantity)
  const nextPrice = Math.round(Number(byPrice) || 0)
  const nextSupplier = String(supplier ?? '').trim()
  const currentQuantity = Number(arrival.quantity) || 0
  const quantityChanged = nextQuantity !== currentQuantity
  const synced = Boolean(arrival.server_id)

  if (synced && quantityChanged) {
    throw new Error(
      'Приход уже на сервере: количество не пересчитывается — сервер считает остаток по приходу ' +
        'один раз. Измените закупку или поставщика'
    )
  }

  let stockQuantity = null

  // Локальные записи — одной транзакцией: либо приход и остаток целиком, либо ничего.
  await dbAdapter.transaction(async () => {
    if (quantityChanged) {
      stockQuantity = await productStocksRepo.adjustQuantity(
        arrival.product_id,
        nextQuantity - currentQuantity
      )
    }

    await dbAdapter.execute(queries.updateLocal, [
      nextQuantity,
      nextPrice,
      nextSupplier,
      arrivalId,
    ])
  })

  // Закупочная цена — та же семантика, что у прихода: одна актуальная цена товара.
  // Она участвует в марже, поэтому правку цены обязательно доводим и до склада.
  if (nextPrice > 0) {
    await buyProductPricesRepo.saveBuyPrice(arrival.product_id, nextPrice)
  }

  if (!synced) {
    // Строка ещё не уезжала: переписываем ожидающий INSERT (см. шапку функции).
    const product = await dbAdapter.queryOne('SELECT server_id FROM products WHERE id = ?', [
      arrival.product_id,
    ])

    await operationsRepo.removeByLocalId(TABLE, arrivalId)
    await operationsRepo.enqueue([
      uuidv4(),
      'insert',
      TABLE,
      JSON.stringify({
        local_id: arrivalId,
        product_id: arrival.product_id,
        product_server_id: product?.server_id ?? null,
        supplier: nextSupplier,
        quantity: nextQuantity,
        by_price: nextPrice,
      }),
      Date.now(),
    ])
  } else {
    // Приход на сервере: количество не менялось (проверено выше), поэтому обычный update.
    await operationsRepo.enqueue([
      uuidv4(),
      'update',
      TABLE,
      JSON.stringify({
        id: arrival.server_id,
        quantity: nextQuantity,
        by_price: nextPrice,
        supplier: nextSupplier,
      }),
      Date.now(),
    ])
  }

  logger.log(
    `[Склад] Приход обновлён: «${arrival.product_id}» ${currentQuantity} → ${nextQuantity}, закупка ${nextPrice}`
  )

  return {
    arrivalId,
    productId: arrival.product_id,
    quantity: nextQuantity,
    byPrice: nextPrice,
    supplier: nextSupplier,
    stockQuantity,
    synced,
  }
}

/**
 * Применяет приход с сервера (второе устройство видит приходы так же, как заказы).
 * Строку ищем по клиентскому `uuid_id` (устройство-автор) или по `server_id`.
 */
export async function applyServerRecord(record) {
  const product = await dbAdapter.queryOne('SELECT id FROM products WHERE server_id = ?', [
    record.product_id,
  ])

  if (!product) {
    logger.warn(
      `[Sync] Нет локального товара для прихода (server product_id=${record.product_id}). Строка пропущена.`
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
      arrivalInsertFromServerParams({
        localId: record.uuid_id ?? uuidv4(),
        serverId: record.id,
        localProductId: product.id,
        supplier: record.supplier ?? '',
        quantity: record.quantity ?? 0,
        byPrice: record.by_price ?? 0,
        createdAt: toEpochSeconds(record.created_at),
        updatedAt,
      })
    )
    return
  }

  if (updatedAt > Number(existing.updated_at || 0)) {
    await dbAdapter.execute(
      queries.updateFromServer,
      arrivalUpdateFromServerParams({
        serverId: record.id,
        supplier: record.supplier ?? '',
        quantity: record.quantity ?? 0,
        byPrice: record.by_price ?? 0,
        updatedAt,
        localId: existing.id,
      })
    )
  }
}

/** Полный сброс (вызывается из `syncService.fullReset()`). */
export async function clearAll() {
  await dbAdapter.execute('DELETE FROM incoming_products')
}

