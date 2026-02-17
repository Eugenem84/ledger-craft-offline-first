import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/order_material'

export async function getByOrderId(orderId) {
  const rows = await dbAdapter.query(queries.getByOrderId, [orderId])
  return rows
}

export async function add(orderId, materialId, amount, price) {
  await dbAdapter.execute(queries.insert, [orderId, materialId, amount, price])
}

export async function update(orderId, materialId, amount, price) {
  await dbAdapter.execute(queries.update, [amount, price, orderId, materialId])
}

export async function remove(orderId, materialId) {
  await dbAdapter.execute(queries.delete, [orderId, materialId])
}

export async function removeByOrderId(orderId) {
  await dbAdapter.execute(queries.deleteByOrderId, [orderId])
}
