import { logger } from 'src/utils/logger'
import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/db.js'
import queries from 'src/database/queries/order_service'
import operationsRepo from 'src/repositories/operationsRepo'
import { toEpochSeconds } from 'src/utils/timestamps.js'

export async function getByOrderId(orderId) {
  const rows = await dbAdapter.query(queries.getByOrderId, [orderId])
  return rows
}

export async function add(orderId, serviceId) {
  // локальный ID связи используем только в payload для синка
  const id = uuidv4()

  // создаём локальную запись связи в таблице order_service
  const params = [
    id,          // id (локальный UUID)
    null,        // server_id (будет проставлен после синка)
    orderId,     // order_id (локальный ID заказа)
    null,        // order_server_id
    serviceId,   // service_id (локальный ID услуги)
    null,        // service_server_id
    null,        // sale_price
    1,           // quantity
  ]
  await dbAdapter.execute(queries.insert, params)

  // кладём операцию INSERT в очередь синхронизации
  const opId = uuidv4()
  const payload = {
    local_id: id,
    order_id: orderId,
    service_id: serviceId,
  }
  const opParams = [opId, 'insert', 'order_service', JSON.stringify(payload), Date.now()]
  await operationsRepo.enqueue(opParams)
}

export async function remove(orderId, serviceId) {
  const line = await dbAdapter.queryOne(
    'SELECT * FROM order_service WHERE order_id = ? AND service_id = ?',
    [orderId, serviceId]
  )

  if (line) {
    await removeLine(line)
  }
}

export async function removeByOrderId(orderId) {
  const lines = await dbAdapter.query(queries.getLinesByOrderId, [orderId])

  for (const line of lines) {
    await removeLine(line)
  }
}

/**
 * Убирает строку работ из заказа.
 *
 * Если строка уже уехала на сервер — ставим операцию `delete` по натуральному
 * ключу `order_id + service_id` (у связки на сервере нет своего PK, задача 3.5);
 * иначе отменяем ещё не отправленный INSERT. Затем удаляем строку локально.
 *
 * Без этого правка заказа («удалить и добавить заново» в OrderDetailsPage)
 * оставляла на сервере дубли работ.
 *
 * @param {{id: string, order_server_id?: number|null, service_server_id?: number|null}} line
 */
async function removeLine(line) {
  if (line.order_server_id && line.service_server_id) {
    await operationsRepo.enqueue([
      uuidv4(),
      'delete',
      'order_service',
      JSON.stringify({
        local_id: line.id,
        order_id: line.order_server_id,
        service_id: line.service_server_id,
      }),
      Date.now(),
    ])
  } else {
    // Строка ещё не уезжала — отменяем незавершённый INSERT.
    await operationsRepo.removeByLocalId('order_service', line.id)
  }

  await dbAdapter.execute('DELETE FROM order_service WHERE id = ?', [line.id])
}

export async function applyServerRecord(record) {
  // Находим локальный заказ по server_id из записи связи
  const orders = await dbAdapter.query(
    'SELECT id FROM orders WHERE server_id = ?',
    [record.order_id]
  )
  if (!orders.length) {
    logger.warn(`[Sync] Не найден локальный заказ для order_service (server order_id=${record.order_id}). Запись пропущена.`)
    return
  }
  const localOrderId = orders[0].id

  // Находим локальную услугу по server_id из записи связи
  const services = await dbAdapter.query(
    'SELECT id FROM services WHERE server_id = ?',
    [record.service_id]
  )
  if (!services.length) {
    logger.warn(`[Sync] Не найдена локальная услуга для order_service (server service_id=${record.service_id}). Запись пропущена.`)
    return
  }
  const localServiceId = services[0].id

  // Идентичность строки связки на всех устройствах — клиентский UUID: он же `id`
  // локально и `uuid_id` на сервере (у `order_service` нет собственного PK,
  // поэтому `server_id` у неё пустой — задача 3.5).
  const localId = record.uuid_id ?? null

  const existing = localId
    ? await dbAdapter.query('SELECT * FROM order_service WHERE id = ?', [localId])
    : await dbAdapter.query('SELECT * FROM order_service WHERE server_id = ?', [record.id ?? null])

  const salePrice = record.sale_price ?? null
  const quantity = record.quantity ?? 1
  const createdAt = toEpochSeconds(record.created_at)
  const updatedAt = toEpochSeconds(record.updated_at, createdAt)

  if (!existing.length) {
    const params = [
      localId ?? uuidv4(), // id (локальный UUID = клиентский uuid_id)
      record.id ?? null,   // server_id (у связки отсутствует)
      localOrderId,        // order_id (локальный ID заказа)
      record.order_id,     // order_server_id
      localServiceId,      // service_id (локальный ID услуги)
      record.service_id,   // service_server_id
      salePrice,           // sale_price
      quantity,            // quantity
      createdAt,           // created_at (UNIX-время в секундах)
      updatedAt,           // updated_at (UNIX-время в секундах)
    ]
    await dbAdapter.execute(queries.insertFromServer, params)
    return
  }

  // Обновление существующей записи: побеждает более свежий updated_at (last-write-wins).
  if (updatedAt <= toEpochSeconds(existing[0].updated_at, 0)) {
    return
  }

  const updateParams = [
    localOrderId,     // order_id
    record.order_id,  // order_server_id
    localServiceId,   // service_id
    record.service_id, // service_server_id
    salePrice,        // sale_price
    quantity,         // quantity
    updatedAt,        // updated_at
    existing[0].id,   // WHERE id = ? (локальный UUID строки связки)
  ]
  await dbAdapter.execute(queries.updateFromServer, updateParams)
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId])
}
