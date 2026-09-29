// repositories/productStocksRepo.js
//
// `product_stocks` (задача 9.2) — **legacy**-строка остатка на товар.
//
// ⚠️ С 29.09.2026 остаток в UI берётся НЕ отсюда: он считается из движений
// (`productsRepo.getStockQuantity` = Σ приходов − Σ расходов), потому что эта таблица
// ведётся сервером и растёт **только от приходов** — продажа её не уменьшала
// («приход 5 → расход 3 → остаток 5»). Здесь остался только приём серверного значения
// выгрузкой (`applyServerRecord`) для совместимости с сервером и полного сброса.
//
// По этой таблице НЕ ставятся исходящие операции синка (иначе серверный счётчик
// разошёлся бы с движениями).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/product_stocks.js'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import {
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
 * Применяет строку остатка с сервера. Строка одна на товар, поэтому ищем её по
 * `server_id`, а если не нашли — по товару: так «наша» строка превращается в
 * серверную и дубль не появляется.
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
