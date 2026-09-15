// repositories/productStocksRepo.js
//
// Остаток товара (задача 9.2): одна строка на товар (`product_stocks`).
//
// Кто пишет что:
//   • **сервер** — увеличивает остаток приходом (`IncomingProductRepository::recordArrival`,
//     идемпотентность по `uuid_id`): приход приходит из очереди операций;
//   • **клиент** — только «оптимистично» обновляет локальную строку
//     (`applyLocalArrival`), чтобы офлайн сразу показывал новый остаток, и забирает
//     серверное значение выгрузкой таблицы (`applyServerRecord`, ключ — товар).
//
// По этой таблице НЕ ставятся операции синка: два писателя одного числа дали бы
// двойной учёт прихода. Вывод остатка в UI — задача 9.3.
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/product_stocks.js'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
  stockInsertParams,
  stockInsertFromServerParams,
  stockUpdateFromServerParams,
} from 'src/database/mappers/warehouse.js'

/**
 * Остаток товара по локальному id товара.
 * @param {string} productId локальный UUID товара
 * @returns {Promise<object|null>}
 */
export async function getByProductId(productId) {
  const rows = await dbAdapter.query(queries.getByProductId, [productId])
  return rows.length ? rows[0] : null
}

/**
 * Локальный остаток после прихода: строку создаём, если её ещё нет, иначе увеличиваем.
 * Операцию синка не ставим — остаток ведёт сервер (см. комментарий в шапке файла).
 *
 * @param {string} productId локальный UUID товара
 * @param {number} quantity количество прихода
 * @param {string} [supplier]
 * @returns {Promise<number>} остаток после прихода
 */
export async function applyLocalArrival(productId, quantity, supplier = '') {
  const added = Number(quantity) || 0
  const existing = await getByProductId(productId)

  if (existing) {
    await dbAdapter.execute(queries.increaseQuantity, [added, existing.id])
    return Number(existing.quantity || 0) + added
  }

  await dbAdapter.execute(
    queries.insert,
    stockInsertParams({ id: uuidv4(), productId, quantity: added, supplier })
  )

  return added
}

/**
 * Корректирует локальный остаток **на дельту** (правка прихода, 15.09.2026).
 *
 * Живёт отдельно от `applyLocalArrival`, потому что меняет не «+N к остатку», а
 * «−2 от остатка»: приход правится, а не оформляется заново. Применяется только к
 * приходу, который ещё **не уехал** на сервер (`incomingProductsRepo.updateArrival`):
 * сервер считает остаток сам и приходует ровно один раз, поэтому «отменить» уже
 * применённый приход на сервере нельзя, и количество такого прихода мы не даём менять.
 *
 * Остаток никогда не уходит ниже нуля: отрицательное количество — не склад, а ошибка.
 *
 * @param {string} productId локальный UUID товара
 * @param {number} delta изменение остатка (может быть отрицательным)
 * @returns {Promise<number|null>} остаток после правки (`null` — строки остатка нет)
 */
export async function adjustQuantity(productId, delta) {
  const change = Math.trunc(Number(delta) || 0)
  if (!change) return null

  const existing = await getByProductId(productId)
  if (!existing) return null

  const next = Math.max(0, Number(existing.quantity || 0) + change)

  await dbAdapter.execute(queries.setQuantity, [next, existing.id])

  return next
}

/**
 * Применяет строку остатка с сервера. Строка одна на товар, поэтому ищем её по
 * `server_id`, а если не нашли — по товару: так «наша» оптимистичная строка
 * превращается в серверную и дубль не появляется.
 */
export async function applyServerRecord(record) {
  const product = await dbAdapter.queryOne('SELECT id FROM products WHERE server_id = ?', [
    record.product_id,
  ])

  if (!product) {
    logger.warn(
      `[Sync] Нет локального товара для остатка (server product_id=${record.product_id}). Строка пропущена.`
    )
    return
  }

  const existing =
    (await dbAdapter.queryOne(queries.getByServerId, [record.id])) ??
    (await dbAdapter.queryOne(queries.getByProductId, [product.id]))

  const updatedAt = toEpochSeconds(record.updated_at)

  if (!existing) {
    await dbAdapter.execute(
      queries.insertFromServer,
      stockInsertFromServerParams({
        localId: uuidv4(),
        serverId: record.id,
        localProductId: product.id,
        quantity: record.quantity ?? 0,
        supplier: record.supplier ?? '',
        createdAt: toEpochSeconds(record.created_at),
        updatedAt,
      })
    )
    return
  }

  // Локальная строка без `server_id` — это наша «предсказанная» строка (приход
  // офлайн): по остатку источник истины сервер, поэтому принимаем его значения
  // целиком (push в `sync()` уже прошёл раньше pull). Для уже принятой строки
  // действует last-write-wins (задача 3.8).
  const adopt = !existing.server_id || updatedAt > Number(existing.updated_at || 0)

  if (!adopt) return

  await dbAdapter.execute(
    queries.updateFromServer,
    stockUpdateFromServerParams({
      serverId: record.id,
      quantity: record.quantity ?? 0,
      supplier: record.supplier ?? '',
      updatedAt,
      localProductId: product.id,
    })
  )
}

/** Полный сброс (задача 6.x/4.4): вызывается из `syncService.fullReset()`. */
export async function clearAll() {
  await dbAdapter.execute('DELETE FROM product_stocks')
}
