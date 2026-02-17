import dbAdapter from 'src/database/adapters/sqljs-web-adapter'
import queries from 'src/database/queries/order_products'

export async function getByOrderId(orderId) {
  const rows = await dbAdapter.query(queries.getByOrderId, [orderId])
  return rows
}

export async function add(orderId, productId, amount, price) {
  await dbAdapter.execute(queries.insert, [orderId, productId, amount, price])
}

export async function update(orderId, productId, amount, price) {
  await dbAdapter.execute(queries.update, [amount, price, orderId, productId])
}

export async function remove(orderId, productId) {
  await dbAdapter.execute(queries.delete, [orderId, productId])
}

export async function removeByOrderId(orderId) {
  await dbAdapter.execute(queries.deleteByOrderId, [orderId])
}
