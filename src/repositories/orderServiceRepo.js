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
  await dbAdapter.execute(queries.insert, [orderId, serviceId])

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
