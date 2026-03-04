import { v4 as uuidv4 } from 'uuid'
import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/order_service'
import operationsRepo from 'src/repositories/operationsRepo'

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
  await dbAdapter.execute(queries.delete, [orderId, serviceId])
}

export async function removeByOrderId(orderId) {
  await dbAdapter.execute(queries.deleteByOrderId, [orderId])
}

export async function applyServerRecord(record) {
  // Находим локальный заказ по server_id из записи связи
  const orders = await dbAdapter.query(
    'SELECT id FROM orders WHERE server_id = ?',
    [record.order_id]
  )
  if (!orders.length) {
    console.warn(`[Sync] Не найден локальный заказ для order_service (server order_id=${record.order_id}). Запись пропущена.`)
    return
  }
  const localOrderId = orders[0].id

  // Находим локальную услугу по server_id из записи связи
  const services = await dbAdapter.query(
    'SELECT id FROM services WHERE server_id = ?',
    [record.service_id]
  )
  if (!services.length) {
    console.warn(`[Sync] Не найдена локальная услуга для order_service (server service_id=${record.service_id}). Запись пропущена.`)
    return
  }
  const localServiceId = services[0].id

  const existing = await dbAdapter.query(
    'SELECT * FROM order_service WHERE server_id = ?',
    [record.id]
  )

  const salePrice = record.sale_price ?? null
  const quantity = record.quantity ?? 1
  const createdAt = record.created_at || Math.floor(Date.now() / 1000)
  const updatedAt = record.updated_at || createdAt

  if (!existing.length) {
    const localId = uuidv4()
    const params = [
      localId,         // id (локальный UUID)
      record.id,       // server_id
      localOrderId,    // order_id (локальный ID заказа)
      record.order_id, // order_server_id
      localServiceId,  // service_id (локальный ID услуги)
      record.service_id, // service_server_id
      salePrice,       // sale_price
      quantity,        // quantity
      createdAt,       // created_at (UNIX-время в секундах)
      updatedAt,       // updated_at (UNIX-время в секундах)
    ]
    await dbAdapter.execute(queries.insertFromServer, params)
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
    record.id,        // WHERE server_id = ?
  ]
  await dbAdapter.execute(queries.updateFromServer, updateParams)
}

export async function updateServerId(localId, serverId) {
  await dbAdapter.execute(queries.updateServerId, [serverId, localId])
}
