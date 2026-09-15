// repositories/materialsRepo.js
//
// Ручные позиции заказа («купил на стороне») — решение **D2**: и локальная, и серверная
// таблица называются одинаково, `materials`, и хранят строки заказа
// (`order_id, name, price, amount`). Клиентский справочник материалов удалён (миграция 023).
//
// Любое изменение строки сразу пишется в локальную БД и ставит операцию в очередь `operations`;
// на сервер `order_id` уходит уже как серверный id (трансформация FK в syncService).
import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/materials.js'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'
import { normalizeQuantity } from 'src/utils/quantity.js'
import {
  materialLineInsertParams,
  materialLineInsertFromServerParams,
  materialLineUpdateFromServerParams,
} from 'src/database/mappers/orderLines.js'

const TABLE = 'materials'

export async function getByOrderId(orderId) {
  return dbAdapter.query(queries.getByOrderId, [orderId])
}

/**
 * Добавляет ручную позицию заказа.
 * @param {string} orderId - локальный id заказа
 * @param {{name?: string, price?: number, amount?: number, buy_price?: number|null}} line
 *   `buy_price` — сколько позиция стоила мастеру (задачи 9.5/9.6): для «купленного по пути»
 *   закупку взять больше неоткуда, её вводит пользователь
 * @returns {Promise<string>} локальный id строки
 */
export async function add(orderId, line) {
  const id = uuidv4()
  const name = line.name ?? ''
  const price = line.price ?? 0
  // Количество — всегда целое ≥ 1 (задача 14.19): «−3» или «2.5» из поля ввода
  // до БД и сервера не доезжают.
  const amount = normalizeQuantity(line.amount)
  const buyPrice = line.buy_price ?? null

  await dbAdapter.execute(
    queries.insert,
    materialLineInsertParams({ id, orderId, name, price, amount, buyPrice })
  )

  await operationsRepo.enqueue([
    uuidv4(),
    'insert',
    TABLE,
    JSON.stringify({ local_id: id, order_id: orderId, name, price, amount, buy_price: buyPrice }),
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
 * Удаляет все ручные позиции заказа (страница правки делает «удалить и добавить заново»).
 */
export async function removeByOrderId(orderId) {
  const lines = await dbAdapter.query(queries.getByOrderId, [orderId])

  for (const line of lines) {
    await remove(line)
  }
}

/**
 * Применяет запись с сервера: находит локальный заказ по server_id и создаёт/обновляет строку.
 */
export async function applyServerRecord(record) {
  const order = await dbAdapter.queryOne(
    'SELECT id FROM orders WHERE server_id = ?',
    [record.order_id]
  )

  if (!order) {
    logger.warn(`[Sync] Нет локального заказа для materials (server order_id=${record.order_id}). Строка пропущена.`)
    return
  }

  const existing = await dbAdapter.queryOne(
    'SELECT * FROM materials WHERE server_id = ?',
    [record.id]
  )

  const createdAt = toEpochSeconds(record.created_at)
  const updatedAt = toEpochSeconds(record.updated_at)

  if (!existing) {
    await dbAdapter.execute(
      queries.insertFromServer,
      materialLineInsertFromServerParams({
        localId: uuidv4(),
        serverId: record.id,
        localOrderId: order.id,
        orderServerId: record.order_id,
        name: record.name ?? '',
        price: record.price ?? 0,
        amount: record.amount ?? 1,
        buyPrice: record.buy_price ?? null,
        createdAt,
        updatedAt,
      })
    )
    return
  }

  if (updatedAt > existing.updated_at) {
    await dbAdapter.execute(
      queries.updateFromServer,
      materialLineUpdateFromServerParams({
        name: record.name ?? '',
        price: record.price ?? 0,
        amount: record.amount ?? 1,
        buyPrice: record.buy_price ?? null,
        updatedAt,
        serverId: record.id,
      })
    )
  }
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId])
}
