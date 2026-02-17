import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/order_services'

export async function getByOrderId(orderId) {
  const rows = await dbAdapter.query(queries.getByOrderId, [orderId])
  return rows
}

export async function add(orderId, serviceId) {
  await dbAdapter.execute(queries.insert, [orderId, serviceId])
}

export async function remove(orderId, serviceId) {
  await dbAdapter.execute(queries.delete, [orderId, serviceId])
}

export async function removeByOrderId(orderId) {
  await dbAdapter.execute(queries.deleteByOrderId, [orderId])
}
